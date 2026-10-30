"""Flood-related evidence screening.

Answers "is there flood-related evidence for this location?" without ever
pretending to be a flood forecast. The rules are strict and deliberate:

* **Rainfall is not flooding.** A heavy-rainfall day is reported as a rainfall
  signal, never as an observed flood.
* **Ordinary water is not flooding.** Mapped water and satellite surface-water
  observations are reported as *context*, not as flood extent.
* **Modelled discharge is a signal, not a warning.** A GloFAS discharge ratio
  above a stated threshold is reported as an elevated modelled signal.
* **No flood model is operated.** The result is labelled evidence-based
  screening throughout, with an explicit disclaimer.

Evidence types are kept in separate items so a consumer (UI, report, AI) can
never blend an observation with a rainfall or model signal.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.common import DataClassification, GeoPoint, ProviderReport, ProviderStatus
from app.models.water_intel import FloodEvidenceItem, FloodEvidenceResult, FloodStatus
from app.providers import catalog
from app.providers import open_meteo
from app.services.aggregation import aggregate_precipitation
from app.services.baseline import expected_window_days
from app.services.indicators import flood_discharge_indicator
from app.providers.water_bodies import find_water_bodies
from app.services.geometry import haversine_km
from app.services.water_presence import PRESENCE_RADIUS_M

logger = get_logger(__name__)

# Explicit, documented thresholds. They are stated in each item's method so the
# user is never left guessing why a signal fired.
HEAVY_RAIN_MM = 20.0
ELEVATED_DISCHARGE_RATIO = 1.25
RECENT_DAYS = 14
FORECAST_DAYS = 7

DISCLAIMER = (
    "Evidence-based screening only. AquaNexus does not operate a validated flood "
    "forecast model and is not an official flood warning service. Consult national "
    "or regional authorities for flood warnings."
)


def _discharge_payload(series) -> dict:
    """Adapt a DischargeSeries back to the raw shape the indicator consumes.

    The indicator was written against the provider's raw payload; keeping that
    shape avoids changing the verified calculation while the service now works
    from the typed series.
    """
    return {
        "daily": {
            "time": [p.timestamp.date().isoformat() for p in series.points],
            "river_discharge": [p.discharge_m3s for p in series.points],
            "river_discharge_mean": [p.ensemble_mean_m3s for p in series.points],
            "river_discharge_median": [p.ensemble_median_m3s for p in series.points],
        }
    }


async def _safe(coro):
    try:
        return await coro, None
    except (AquaNexusError, ProviderError, ValueError) as exc:
        return None, exc


async def assess_flood_evidence(point: GeoPoint) -> FloodEvidenceResult:
    """Collect flood-related evidence from rainfall, discharge and mapping."""
    now = datetime.now(tz=timezone.utc)
    today = now.date()
    observed_end = today - timedelta(days=5)
    observed_start = observed_end - timedelta(days=RECENT_DAYS - 1)

    items: list[FloodEvidenceItem] = []
    providers: list[ProviderReport] = []
    notes: list[str] = []

    (recent, recent_exc), (forecast, forecast_exc), (discharge, discharge_exc), (
        bodies,
        bodies_exc,
    ) = (
        await _safe(open_meteo.fetch_archive_precipitation(point, start=observed_start, end=observed_end)),
        await _safe(open_meteo.fetch_forecast_precipitation(point, days=FORECAST_DAYS)),
        await _safe(open_meteo.fetch_discharge_series(point, days=14, past_days=30)),
        await _safe(find_water_bodies(point, radius_m=PRESENCE_RADIUS_M, limit=30)),
    )

    any_source_ok = False

    # --- Rainfall signal (observed, recent) -------------------------------
    if recent is not None:
        any_source_ok = True
        providers.append(
            ProviderReport(
                provider_id=recent.provider.id,
                provider_name=recent.provider.name,
                status=ProviderStatus.OK,
                classification=recent.provenance.classification,
            )
        )
        agg = aggregate_precipitation(
            recent.points, expected_days=expected_window_days(observed_start, observed_end)
        )
        values = [v for v in agg.values if v is not None]
        heavy_days = sum(1 for v in values if v >= HEAVY_RAIN_MM)
        items.append(
            FloodEvidenceItem(
                key="observed_heavy_rainfall",
                label=f"Observed heavy-rainfall days (>= {HEAVY_RAIN_MM:.0f} mm/day)",
                evidence_type="rainfall_signal",
                status="ok",
                value=float(heavy_days),
                unit="days",
                period=f"{observed_start.isoformat()} to {observed_end.isoformat()}",
                source=recent.provider.name,
                classification=DataClassification.DERIVED,
                method=(
                    f"count(daily reanalysis precipitation >= {HEAVY_RAIN_MM:.0f} mm) over "
                    f"{agg.valid_days} valid days. A rainfall signal, not evidence that a "
                    "flood occurred."
                ),
                limitations=[
                    "Heavy rainfall does not by itself mean a flood occurred.",
                    "The threshold is an explicit, documented choice, not a warning criterion.",
                    "Reanalysis is a modelled estimate, not a gauge measurement.",
                ],
            )
        )
        items.append(
            FloodEvidenceItem(
                key="observed_rainfall_total",
                label="Observed rainfall total (recent window)",
                evidence_type="rainfall_signal",
                status="ok" if agg.has_sufficient_coverage else "insufficient_data",
                value=round(agg.total_mm, 1),
                unit="mm",
                period=f"{observed_start.isoformat()} to {observed_end.isoformat()}",
                source=recent.provider.name,
                classification=DataClassification.REANALYSIS,
                method=f"Sum of daily reanalysis precipitation over {agg.valid_days} valid days.",
                limitations=[f"Coverage {agg.coverage_ratio:.0%}; compare totals only at similar coverage."],
            )
        )
    else:
        providers.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_ARCHIVE.id,
                provider_name=catalog.OPEN_METEO_ARCHIVE.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(recent_exc),
            )
        )

    # --- Rainfall signal (forecast) ---------------------------------------
    if forecast is not None:
        any_source_ok = True
        providers.append(
            ProviderReport(
                provider_id=forecast.provider.id,
                provider_name=forecast.provider.name,
                status=ProviderStatus.OK,
                classification=forecast.provenance.classification,
            )
        )
        fvalues = [p.value for p in forecast.points if p.value is not None]
        forecast_heavy = sum(1 for v in fvalues if v >= HEAVY_RAIN_MM)
        items.append(
            FloodEvidenceItem(
                key="forecast_heavy_rainfall",
                label=f"Forecast heavy-rainfall days (>= {HEAVY_RAIN_MM:.0f} mm/day)",
                evidence_type="rainfall_signal",
                status="ok",
                value=float(forecast_heavy),
                unit="days",
                period=f"next {FORECAST_DAYS} days",
                source=forecast.provider.name,
                classification=DataClassification.FORECAST,
                method=(
                    f"count(forecast daily precipitation >= {HEAVY_RAIN_MM:.0f} mm) over the "
                    "next 7 days. A modelled rainfall signal, not a flood forecast."
                ),
                limitations=[
                    "Forecast, not observed; skill decreases with lead time.",
                    "Heavy forecast rainfall is not a flood probability.",
                ],
            )
        )
    else:
        providers.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FORECAST.id,
                provider_name=catalog.OPEN_METEO_FORECAST.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(forecast_exc),
            )
        )

    # --- Modelled discharge signal ----------------------------------------
    discharge_ratio: float | None = None
    discharge_series = None
    if discharge is not None:
        discharge_series = discharge
        any_source_ok = True
        providers.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.OK,
                classification=DataClassification.SIMULATION,
            )
        )
        indicator = flood_discharge_indicator(_discharge_payload(discharge))
        discharge_ratio = indicator.value
        # Reanalysis/hindcast discharge (before today) — modelled, not a gauge.
        hist = [p for p in discharge.points if not p.is_forecast and p.discharge_m3s is not None]
        fc = [p for p in discharge.points if p.is_forecast and p.discharge_m3s is not None]
        if hist:
            peak = max(hist, key=lambda p: p.discharge_m3s or 0.0)
            items.append(
                FloodEvidenceItem(
                    key="modelled_discharge_reanalysis",
                    label="Modelled discharge, recent reanalysis window (GloFAS)",
                    evidence_type="discharge_signal",
                    status="ok",
                    value=round(peak.discharge_m3s or 0.0, 2),
                    unit="m3/s",
                    period=f"{discharge.start_date.isoformat()} to {discharge.points[0].timestamp.date().isoformat()}",
                    source=catalog.OPEN_METEO_FLOOD.name,
                    classification=DataClassification.SIMULATION,
                    method=(
                        f"Peak GloFAS modelled daily river_discharge over {len(hist)} "
                        "reanalysis/hindcast days before today. Modelled along the river "
                        "network, not a gauge measurement."
                    ),
                    limitations=list(indicator.limitations),
                )
            )
        if fc:
            peak_fc = max(fc, key=lambda p: p.discharge_m3s or 0.0)
            items.append(
                FloodEvidenceItem(
                    key="modelled_discharge_forecast",
                    label="Modelled discharge, forecast peak (GloFAS)",
                    evidence_type="discharge_signal",
                    status="ok",
                    value=round(peak_fc.discharge_m3s or 0.0, 2),
                    unit="m3/s",
                    period=f"{fc[0].timestamp.date().isoformat()} to {fc[-1].timestamp.date().isoformat()}",
                    source=catalog.OPEN_METEO_FLOOD.name,
                    classification=DataClassification.SIMULATION,
                    method=(
                        f"Peak GloFAS modelled daily river_discharge over {len(fc)} "
                        "forecast days. Ensemble spread is reported in the discharge "
                        "series; this is a hydrological signal, not a flood forecast."
                    ),
                    limitations=list(indicator.limitations),
                )
            )
        # Ensemble spread across the forecast window: how much the ensemble
        # members disagree. Reported as the median relative interquartile range
        # (p75-p25)/median. This is robust when the ensemble minimum approaches
        # zero, where a max/min ratio would explode and be meaningless.
        rel_iqr = [
            (p.ensemble_p75_m3s - p.ensemble_p25_m3s) / p.ensemble_median_m3s
            for p in discharge.points
            if p.is_forecast
            and p.ensemble_p25_m3s is not None
            and p.ensemble_p75_m3s is not None
            and p.ensemble_median_m3s
            and p.ensemble_median_m3s > 0
        ]
        if rel_iqr:
            rel_iqr.sort()
            mid = len(rel_iqr) // 2
            spread = (
                rel_iqr[mid]
                if len(rel_iqr) % 2
                else (rel_iqr[mid - 1] + rel_iqr[mid]) / 2
            )
            items.append(
                FloodEvidenceItem(
                    key="modelled_discharge_ensemble_spread",
                    label="Forecast ensemble spread (GloFAS, relative IQR)",
                    evidence_type="discharge_signal",
                    status="ok",
                    value=round(spread, 3),
                    unit="ratio",
                    period=f"next {discharge.forecast_days} forecast days",
                    source=catalog.OPEN_METEO_FLOOD.name,
                    classification=DataClassification.DERIVED,
                    method=(
                        "median of (ensemble_p75 - ensemble_p25) / ensemble_median across "
                        "the forecast days. A larger value means the ensemble members "
                        "disagree more about the forecast discharge. It is a spread "
                        "measure, not a flood probability."
                    ),
                    limitations=[
                        "Ensemble statistics are only defined for forecast days, not "
                        "consolidated historical data.",
                        "A wide spread means uncertainty, not an elevated flood risk.",
                        "A relative measure: it scales with the forecast magnitude.",
                    ],
                )
            )
        items.append(
            FloodEvidenceItem(
                key="modelled_discharge_ratio",
                label="Modelled discharge vs. ensemble mean (GloFAS)",
                evidence_type="discharge_signal",
                status=indicator.status,
                value=indicator.value,
                unit="ratio",
                period=f"next {discharge.forecast_days} forecast days",
                source=catalog.OPEN_METEO_FLOOD.name,
                classification=DataClassification.DERIVED,
                method=(
                    "river_discharge / river_discharge_mean for the same forecast day. "
                    f"Values >= {ELEVATED_DISCHARGE_RATIO} are treated as an elevated "
                    "modelled signal."
                ),
                limitations=list(indicator.limitations),
            )
        )
    else:
        providers.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(discharge_exc),
            )
        )

    # --- Surface-water context (mapping) ----------------------------------
    if bodies is not None:
        providers.append(bodies.provider)
        if bodies.service_reachable:
            any_source_ok = True
            near = [
                b
                for b in bodies.bodies
                if b.coordinates
                and min(
                    haversine_km(point.latitude, point.longitude, lat, lon)
                    for lon, lat in b.coordinates
                )
                <= 2.0
            ]
            items.append(
                FloodEvidenceItem(
                    key="surface_water_context",
                    label="Mapped surface water within 2 km (context)",
                    evidence_type="surface_water_context",
                    status="ok",
                    value=float(len(near)),
                    unit="features",
                    source=bodies.provider.provider_name,
                    classification=DataClassification.OBSERVATION,
                    method=(
                        "Count of mapped water features (OpenStreetMap) whose outline comes "
                        "within 2 km of the point. Context only — ordinary mapped water is not "
                        "flooding."
                    ),
                    limitations=list(catalog.OSM_OVERPASS.limitations)
                    + ["Presence of water is not evidence of a flood."],
                )
            )
        else:
            # The mapping service did not answer. Reporting a count here would
            # fabricate an observation, so the item is explicitly unavailable.
            items.append(
                FloodEvidenceItem(
                    key="surface_water_context",
                    label="Mapped surface water within 2 km (context)",
                    evidence_type="surface_water_context",
                    status="unavailable",
                    value=None,
                    unit="features",
                    source=bodies.provider.provider_name,
                    classification=DataClassification.OBSERVATION,
                    method=(
                        "Count of mapped water features (OpenStreetMap) whose outline comes "
                        "within 2 km of the point. Not computed: the mapping service did not "
                        "answer."
                    ),
                    limitations=list(catalog.OSM_OVERPASS.limitations)
                    + [
                        "The mapping service could not be reached, so no water-feature "
                        "count is shown. This is a service limitation, not evidence that "
                        "no water is present.",
                    ],
                )
            )
    elif bodies_exc is not None:
        providers.append(
            ProviderReport(
                provider_id=catalog.OSM_OVERPASS.id,
                provider_name=catalog.OSM_OVERPASS.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(bodies_exc),
            )
        )

    # --- Combine ----------------------------------------------------------
    heavy_observed = next(
        (i for i in items if i.key == "observed_heavy_rainfall" and (i.value or 0) > 0), None
    )
    heavy_forecast = next(
        (i for i in items if i.key == "forecast_heavy_rainfall" and (i.value or 0) > 0), None
    )
    elevated = (
        discharge_ratio is not None and discharge_ratio >= ELEVATED_DISCHARGE_RATIO
    )

    if not any_source_ok:
        status: FloodStatus = "insufficient_data"
        headline = "Insufficient data"
        detail = (
            "No flood-related source returned usable data for this location, so no "
            "screening statement can be made."
        )
    elif elevated:
        status = "elevated_discharge_signal"
        headline = "Elevated modelled discharge signal"
        detail = (
            f"Modelled GloFAS discharge is {discharge_ratio:.2f}x its same-day ensemble "
            "mean, which is above the stated screening threshold. This is a modelled "
            "signal, not an observed flood or a flood forecast."
        )
    elif heavy_observed or heavy_forecast:
        status = "heavy_rainfall_signal"
        headline = "Heavy-rainfall signal"
        detail = (
            "Heavy rainfall is present in the available evidence"
            + (
                f" ({heavy_observed.value:.0f} observed day(s))" if heavy_observed else ""
            )
            + (f" ({heavy_forecast.value:.0f} forecast day(s))" if heavy_forecast else "")
            + ". Heavy rainfall is not proof that a flood occurred or will occur."
        )
    else:
        status = "no_flood_evidence"
        headline = "No flood evidence in the available observations"
        detail = (
            "No heavy-rainfall day, elevated modelled discharge or observed flood extent "
            "was found in the available evidence. This is a screening result, not a "
            "guarantee that flooding is absent."
        )

    notes.append(
        "Observed flood extent is not shown because AquaNexus does not run a validated "
        "flood-extent classifier. Where a NASA GIBS surface-water layer is available it "
        "is offered on the map as an observation with its own limitations."
    )
    notes.append(
        "Rainfall is not flooding, and ordinary mapped water is not flooding. This module "
        "keeps those signals separate."
    )

    return FloodEvidenceResult(
        location=point,
        generated_at=now,
        status=status,
        headline=headline,
        detail=detail,
        items=items,
        providers=providers,
        discharge=discharge_series,
        disclaimer=DISCLAIMER,
        notes=notes,
    )

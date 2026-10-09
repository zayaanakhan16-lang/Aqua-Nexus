"""Location summary orchestration.

Combines providers into a single evidence-backed view. Every provider call is
isolated: a failure downgrades one section to an honest ``unavailable`` state
without discarding the rest. Nothing is fabricated to fill a gap.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.aggregates import Indicator, LocationSummary
from app.models.common import (
    DataClassification,
    GeoPoint,
    PlaceResult,
    ProviderReport,
    ProviderStatus,
    utcnow,
)
from app.providers import catalog
from app.providers import nasa_power, open_meteo
from app.services import indicators as ind
from app.services.aggregation import aggregate_precipitation

logger = get_logger(__name__)

DEFAULT_WINDOW_DAYS = 30


async def build_location_summary(
    point: GeoPoint,
    *,
    label: str | None = None,
    resolved_place: PlaceResult | None = None,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> LocationSummary:
    """Assemble a preliminary, evidence-based summary for a location."""
    window_days = max(7, min(window_days, 90))
    today = datetime.now(tz=timezone.utc).date()
    # Reanalysis lags ~5 days; end the observed window slightly in the past.
    observed_end = today - timedelta(days=5)
    observed_start = observed_end - timedelta(days=window_days - 1)

    reports: list[ProviderReport] = []
    indicators: list[Indicator] = []
    notes: list[str] = [
        "All values are preliminary and depend on the coverage of the listed sources.",
        "AquaNexus does not currently assess groundwater, reservoirs, demand or "
        "infrastructure, so it cannot establish water scarcity from rainfall alone.",
    ]

    # --- Recent observed/reanalysis precipitation -------------------------
    primary_classification: DataClassification | None = None
    primary_agg = None
    try:
        observed = await open_meteo.fetch_archive_precipitation(
            point, start=observed_start, end=observed_end
        )
        primary_agg = aggregate_precipitation(observed.points)
        primary_classification = observed.provenance.classification
        reports.append(
            ProviderReport(
                provider_id=observed.provider.id,
                provider_name=observed.provider.name,
                status=ProviderStatus.OK if primary_agg.has_sufficient_coverage else ProviderStatus.PARTIAL,
                message=(
                    None
                    if primary_agg.has_sufficient_coverage
                    else f"Only {primary_agg.coverage_ratio:.0%} of days have values."
                ),
                classification=observed.provenance.classification,
            )
        )
        indicators.append(ind.coverage_indicator(primary_agg))
        indicators.append(ind.wet_day_fraction(primary_agg))
        indicators.append(
            ind.assess_freshness(observed.provenance.observed_at, policy="reanalysis")
        )

        # --- Historical comparison: same window, previous year -------------
        baseline_start = observed_start.replace(year=observed_start.year - 1)
        baseline_end = observed_end.replace(year=observed_end.year - 1)
        try:
            baseline = await open_meteo.fetch_archive_precipitation(
                point, start=baseline_start, end=baseline_end
            )
            baseline_agg = aggregate_precipitation(baseline.points)
            from app.services.anomaly import compute_anomaly

            anomaly = compute_anomaly(
                primary_agg,
                baseline_agg,
                observed_classification=observed.provenance.classification,
                baseline_classification=baseline.provenance.classification,
            )
            indicators.append(
                ind.precipitation_deficit_indicator(
                    anomaly.anomaly_mm,
                    anomaly.anomaly_percent,
                    sufficient_evidence=True,
                    baseline_description=(
                        f"previous year ({baseline_start.isoformat()} to "
                        f"{baseline_end.isoformat()}, same ERA5 product)"
                    ),
                )
            )
            notes.append(
                "Rainfall anomaly compares the window with the same calendar window "
                "one year earlier, using the same reanalysis product."
            )
        except (AquaNexusError, ProviderError, ValueError) as exc:
            logger.info("Baseline comparison unavailable: %s", exc)
            indicators.append(
                ind.precipitation_deficit_indicator(
                    None,
                    None,
                    sufficient_evidence=False,
                    baseline_description="unavailable",
                )
            )
            reports.append(
                ProviderReport(
                    provider_id=catalog.OPEN_METEO_ARCHIVE.id,
                    provider_name="Historical baseline comparison",
                    status=ProviderStatus.UNAVAILABLE,
                    message=str(exc),
                )
            )
        indicators.append(ind.data_classification_indicator(primary_classification))
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.warning("Primary precipitation unavailable: %s", exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_ARCHIVE.id,
                provider_name=catalog.OPEN_METEO_ARCHIVE.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
            )
        )
        indicators.append(ind.coverage_indicator(None))
        indicators.append(ind.data_classification_indicator(None))

    # --- Forecast ---------------------------------------------------------
    try:
        forecast = await open_meteo.fetch_forecast_precipitation(point, days=7)
        forecast_total = forecast.total
        reports.append(
            ProviderReport(
                provider_id=forecast.provider.id,
                provider_name=forecast.provider.name,
                status=ProviderStatus.OK,
                classification=forecast.provenance.classification,
            )
        )
        indicators.append(
            Indicator(
                key="forecast_7d_total",
                label="7-day forecast precipitation",
                value=round(forecast_total, 1) if forecast_total is not None else None,
                unit="mm",
                status="ok",
                method="Sum of daily precipitation_sum for the next 7 days (modelled).",
                method_version="1.0",
                inputs=["Open-Meteo ICON/GFS blend"],
                classification=DataClassification.FORECAST,
                limitations=[
                    "Forecast, not an observation.",
                    "Skill decreases with lead time.",
                ],
            )
        )
        indicators.append(
            ind.assess_freshness(forecast.provenance.observed_at, policy="forecast")
        )
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("Forecast unavailable: %s", exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FORECAST.id,
                provider_name=catalog.OPEN_METEO_FORECAST.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
            )
        )

    # --- River discharge --------------------------------------------------
    try:
        flood_payload = await open_meteo.fetch_flood_discharge(point, days=14)
        indicators.append(ind.flood_discharge_indicator(flood_payload))
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.OK,
                classification=DataClassification.SIMULATION,
            )
        )
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("River discharge unavailable: %s", exc)
        indicators.append(ind.flood_discharge_indicator(None))
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
            )
        )

    # --- Independent cross-check (NASA POWER) -----------------------------
    try:
        power = await nasa_power.fetch_precipitation(
            point, start=observed_start, end=observed_end
        )
        power_agg = aggregate_precipitation(power.points)
        reports.append(
            ProviderReport(
                provider_id=power.provider.id,
                provider_name=power.provider.name,
                status=ProviderStatus.OK,
                classification=power.provenance.classification,
            )
        )
        if primary_agg is not None:
            delta = primary_agg.total_mm - power_agg.total_mm
            pct = (delta / power_agg.total_mm * 100.0) if power_agg.total_mm > 0 else None
            indicators.append(
                Indicator(
                    key="cross_check_delta",
                    label="Cross-source difference (ERA5 vs. MERRA-2)",
                    value=round(pct, 1) if pct is not None else None,
                    unit="%",
                    status="ok" if pct is not None else "insufficient_data",
                    baseline=0.0,
                    method=(
                        "(ERA5 total - MERRA-2 total) / MERRA-2 total * 100 for the "
                        "same window; two independent products rarely agree exactly."
                    ),
                    method_version="1.0",
                    inputs=["Open-Meteo ERA5", "NASA POWER MERRA-2"],
                    classification=DataClassification.DERIVED,
                    limitations=[
                        "A difference between products is expected and is not an error.",
                        "Both are reanalyses with different spatial resolutions.",
                    ],
                )
            )
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("NASA POWER cross-check unavailable: %s", exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.NASA_POWER.id,
                provider_name=catalog.NASA_POWER.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
            )
        )

    return LocationSummary(
        location=point,
        label=label,
        resolved_place=resolved_place,
        generated_at=utcnow(),
        providers=reports,
        indicators=indicators,
        notes=notes,
    )


def window_bounds(window_days: int) -> tuple[date, date]:
    today = datetime.now(tz=timezone.utc).date()
    end = today - timedelta(days=5)
    start = end - timedelta(days=max(7, window_days) - 1)
    return start, end

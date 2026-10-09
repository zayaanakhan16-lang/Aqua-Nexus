"""Location summary orchestration.

Combines providers into a single evidence-backed view. Independent providers are
fetched **concurrently** with isolated error handling: a failure downgrades one
section to an honest ``unavailable`` state without discarding the rest, and one
slow provider cannot block the others. Nothing is fabricated to fill a gap.

Scientific notes
----------------
* Coverage is measured against the true calendar window, so omitted days count
  against coverage rather than inflating it.
* The historical comparison is a **year-over-year** comparison against the same
  period in a prior year, aligned on calendar dates (leap-safe). It is *not* a
  long-term climate normal.
* The cross-source check compares ERA5 and MERRA-2 only on dates where **both**
  products have a real value.
* Observed/reanalysis freshness and forecast freshness are reported separately.
"""
from __future__ import annotations

import asyncio
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
from app.services.baseline import expected_window_days, pair_on_valid_dates, prior_year_window

logger = get_logger(__name__)

DEFAULT_WINDOW_DAYS = 30


async def _gather_optional(coro):
    """Await a provider coroutine, returning ``(value, exc)`` instead of raising."""
    try:
        return await coro, None
    except (AquaNexusError, ProviderError, ValueError) as exc:
        return None, exc


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
    observed_window_len = expected_window_days(observed_start, observed_end)

    baseline_start, baseline_end = prior_year_window(observed_start, observed_end, 1)
    baseline_window_len = expected_window_days(baseline_start, baseline_end)

    reports: list[ProviderReport] = []
    indicators: list[Indicator] = []
    notes: list[str] = [
        "All values are preliminary and depend on the coverage of the listed sources.",
        "AquaNexus does not currently assess groundwater, reservoirs, demand or "
        "infrastructure, so it cannot establish water scarcity from rainfall alone.",
    ]

    # --- Fetch independent providers concurrently -------------------------
    (
        (observed, observed_exc),
        (baseline, baseline_exc),
        (forecast, forecast_exc),
        (flood_payload, flood_exc),
        (power, power_exc),
    ) = await asyncio.gather(
        _gather_optional(
            open_meteo.fetch_archive_precipitation(
                point, start=observed_start, end=observed_end
            )
        ),
        _gather_optional(
            open_meteo.fetch_archive_precipitation(
                point, start=baseline_start, end=baseline_end
            )
        ),
        _gather_optional(open_meteo.fetch_forecast_precipitation(point, days=7)),
        _gather_optional(open_meteo.fetch_flood_discharge(point, days=14)),
        _gather_optional(
            nasa_power.fetch_precipitation(point, start=observed_start, end=observed_end)
        ),
    )

    # --- Recent observed/reanalysis precipitation -------------------------
    primary_classification: DataClassification | None = None
    primary_agg = None
    if observed is not None:
        primary_agg = aggregate_precipitation(
            observed.points, expected_days=observed_window_len
        )
        primary_classification = observed.provenance.classification
        reports.append(
            ProviderReport(
                provider_id=observed.provider.id,
                provider_name=observed.provider.name,
                status=(
                    ProviderStatus.OK
                    if primary_agg.has_sufficient_coverage
                    else ProviderStatus.PARTIAL
                ),
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
            ind.assess_freshness(
                observed.provenance.observed_at,
                policy="reanalysis",
                key="observed_freshness",
                label="Observed/reanalysis freshness",
            )
        )
    else:
        logger.warning("Primary precipitation unavailable: %s", observed_exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_ARCHIVE.id,
                provider_name=catalog.OPEN_METEO_ARCHIVE.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(observed_exc),
            )
        )
        indicators.append(ind.coverage_indicator(None))

    # --- Historical comparison: same window, previous year ----------------
    if primary_agg is not None and baseline is not None:
        baseline_agg = aggregate_precipitation(
            baseline.points, expected_days=baseline_window_len
        )
        from app.services.anomaly import compute_anomaly

        try:
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
                        f"same period in {baseline_start.year} "
                        f"({baseline_start.isoformat()} to {baseline_end.isoformat()}, "
                        "year-over-year, same ERA5 product)"
                    ),
                )
            )
            notes.append(
                f"Rainfall comparison is a year-over-year change versus the same period "
                f"in {baseline_start.year}, using the same reanalysis product. It is not "
                "a 30-year climate normal."
            )
        except ValueError as exc:
            logger.info("Baseline comparison unsupported: %s", exc)
            indicators.append(
                ind.precipitation_deficit_indicator(
                    None,
                    None,
                    sufficient_evidence=False,
                    baseline_description=f"same period in {baseline_start.year}",
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
    else:
        indicators.append(
            ind.precipitation_deficit_indicator(
                None,
                None,
                sufficient_evidence=False,
                baseline_description="unavailable",
            )
        )
        if baseline_exc is not None:
            reports.append(
                ProviderReport(
                    provider_id=catalog.OPEN_METEO_ARCHIVE.id,
                    provider_name="Historical baseline comparison",
                    status=ProviderStatus.UNAVAILABLE,
                    message=str(baseline_exc),
                )
            )

    indicators.append(ind.data_classification_indicator(primary_classification))

    # --- Forecast ---------------------------------------------------------
    if forecast is not None:
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
        # Forecast freshness is the age of the forecast's first day, not its last:
        # a future end date must not be mistaken for a fresh initialisation.
        forecast_start_at = forecast.points[0].timestamp if forecast.points else None
        indicators.append(
            ind.assess_freshness(
                forecast_start_at,
                policy="forecast",
                key="forecast_freshness",
                label="Forecast freshness",
            )
        )
    else:
        logger.info("Forecast unavailable: %s", forecast_exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FORECAST.id,
                provider_name=catalog.OPEN_METEO_FORECAST.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(forecast_exc),
            )
        )

    # --- River discharge --------------------------------------------------
    if flood_payload is not None:
        indicators.append(ind.flood_discharge_indicator(flood_payload))
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.OK,
                classification=DataClassification.SIMULATION,
            )
        )
    else:
        logger.info("River discharge unavailable: %s", flood_exc)
        indicators.append(ind.flood_discharge_indicator(None))
        reports.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FLOOD.id,
                provider_name=catalog.OPEN_METEO_FLOOD.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(flood_exc),
            )
        )

    # --- Independent cross-check (NASA POWER) -----------------------------
    if power is not None:
        reports.append(
            ProviderReport(
                provider_id=power.provider.id,
                provider_name=power.provider.name,
                status=ProviderStatus.OK if observed is not None else ProviderStatus.PARTIAL,
                classification=power.provenance.classification,
            )
        )
        if observed is not None and observed.points:
            try:
                paired_era5, paired_power = pair_on_valid_dates(observed, power)
            except ValueError as exc:
                paired_era5, paired_power = [], []
                logger.info("Cross-check pairing failed: %s", exc)
            if paired_era5 and paired_power:
                era5_agg = aggregate_precipitation(
                    paired_era5, expected_days=observed_window_len
                )
                power_agg = aggregate_precipitation(
                    paired_power, expected_days=observed_window_len
                )
                if not (
                    era5_agg.has_sufficient_coverage and power_agg.has_sufficient_coverage
                ):
                    indicators.append(
                        Indicator(
                            key="cross_check_delta",
                            label="Cross-source difference (ERA5 vs. MERRA-2)",
                            value=None,
                            unit="%",
                            status="insufficient_data",
                            baseline=0.0,
                            method=(
                                "(ERA5 total - MERRA-2 total) / MERRA-2 total * 100, "
                                "restricted to dates where both products have values"
                            ),
                            method_version="1.1",
                            inputs=["Open-Meteo ERA5", "NASA POWER MERRA-2"],
                            classification=DataClassification.DERIVED,
                            limitations=[
                                "Too few shared valid dates to compare the two products.",
                            ],
                        )
                    )
                else:
                    delta = era5_agg.total_mm - power_agg.total_mm
                    pct = (
                        (delta / power_agg.total_mm * 100.0)
                        if power_agg.total_mm > 0
                        else None
                    )
                    indicators.append(
                        Indicator(
                            key="cross_check_delta",
                            label="Cross-source difference (ERA5 vs. MERRA-2)",
                            value=round(pct, 1) if pct is not None else None,
                            unit="%",
                            status="ok" if pct is not None else "insufficient_data",
                            baseline=0.0,
                            method=(
                                "(ERA5 total - MERRA-2 total) / MERRA-2 total * 100 over "
                                f"{era5_agg.valid_days} shared valid dates; two independent "
                                "products rarely agree exactly."
                            ),
                            method_version="1.1",
                            inputs=[
                                "Open-Meteo ERA5",
                                "NASA POWER MERRA-2",
                                f"{era5_agg.valid_days} shared valid dates",
                            ],
                            classification=DataClassification.DERIVED,
                            limitations=[
                                "A difference between products is expected and is not an error.",
                                "Both are reanalyses with different spatial resolutions.",
                                "Only dates present in both products are compared.",
                            ],
                        )
                    )
    else:
        logger.info("NASA POWER cross-check unavailable: %s", power_exc)
        reports.append(
            ProviderReport(
                provider_id=catalog.NASA_POWER.id,
                provider_name=catalog.NASA_POWER.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(power_exc),
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

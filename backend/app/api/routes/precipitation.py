"""Precipitation, comparison, and availability routes."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.errors import InsufficientDataError, ValidationError
from app.models.aggregates import (
    LocationSummary,
    PrecipitationComparison,
    PrecipitationSeries,
)
from app.models.common import (
    DataClassification,
    GeoPoint,
    Provenance,
)
from app.providers import open_meteo
from app.services.aggregation import aggregate_precipitation
from app.services.anomaly import compute_anomaly
from app.services.baseline import align_daily_by_date, expected_window_days, prior_year_window
from app.services.summary import build_location_summary

router = APIRouter(tags=["precipitation"])


def _default_window(days: int) -> tuple[date, date]:
    """Recent window ending a few days before today, to avoid reanalysis lag."""
    today = datetime.now(tz=timezone.utc).date()
    end = today - timedelta(days=5)
    start = end - timedelta(days=days - 1)
    return start, end


@router.get(
    "/precipitation/forecast",
    response_model=PrecipitationSeries,
    summary="Near-term modelled forecast precipitation (FORECAST)",
)
async def forecast_precipitation(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(7, ge=1, le=16),
) -> PrecipitationSeries:
    return await open_meteo.fetch_forecast_precipitation(
        GeoPoint(latitude=latitude, longitude=longitude), days=days
    )


@router.get(
    "/precipitation/historical",
    response_model=PrecipitationSeries,
    summary="Historical reanalysis precipitation (REANALYSIS)",
)
async def historical_precipitation(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(30, ge=1, le=365),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
) -> PrecipitationSeries:
    point = GeoPoint(latitude=latitude, longitude=longitude)
    # An explicitly supplied date range must be complete and coherent; silently
    # ignoring a lone start or end date would mislead the caller.
    if (start_date is None) != (end_date is None):
        raise ValidationError(
            "Provide both start_date and end_date, or neither. A lone date is ambiguous."
        )
    if start_date and end_date:
        if end_date < start_date:
            raise ValidationError("end_date must be on or after start_date.")
        return await open_meteo.fetch_archive_precipitation(
            point, start=start_date, end=end_date
        )
    start, end = _default_window(days)
    return await open_meteo.fetch_archive_precipitation(point, start=start, end=end)


async def _build_multi_year_baseline(
    point: GeoPoint, start: date, end: date, baseline_years: int
) -> tuple[PrecipitationSeries, list[int], list[int]]:
    """Average the same calendar window across prior years, aligned by date.

    Each prior-year window is aligned on **calendar dates**, so a missing daily
    value is never treated as zero and leap years (29 February) are handled
    deterministically. Returns the baseline series, the years that contributed,
    and the years that were skipped.
    """
    series_list: list[PrecipitationSeries] = []
    years: list[int] = []
    skipped: list[int] = []
    for offset in range(1, baseline_years + 1):
        target_year = start.year - offset
        b_start, b_end = prior_year_window(start, end, offset)
        try:
            series_list.append(
                await open_meteo.fetch_archive_precipitation(point, start=b_start, end=b_end)
            )
            years.append(target_year)
        except Exception:  # a provider gap for one year must not kill the baseline
            skipped.append(target_year)
            continue

    if not series_list:
        raise InsufficientDataError(
            "No historical baseline period could be retrieved for this location."
        )

    baseline_points = align_daily_by_date(series_list)
    baseline = PrecipitationSeries(
        location=point,
        start_date=baseline_points[0].timestamp.date(),
        end_date=baseline_points[-1].timestamp.date(),
        granularity="daily",
        unit="mm",
        points=baseline_points,
        provenance=Provenance(
            source_id=open_meteo.ARCHIVE.id,
            source_name=f"{open_meteo.ARCHIVE.name} (year-over-year baseline)",
            classification=DataClassification.REANALYSIS,
            observed_at=baseline_points[-1].timestamp,
            method=(
                "Mean of the same calendar window across prior years, aligned by "
                "date; dates missing from any year are excluded and never imputed"
            ),
            method_version="1.1",
            notes=[
                "Baseline years: " + ", ".join(str(y) for y in years),
                "This is a year-over-year comparison, not a long-term climate normal.",
            ],
        ),
        provider=open_meteo.ARCHIVE,
        coverage=f"Baseline averaged over years: {', '.join(str(y) for y in years)}",
        missing_days=sum(1 for p in baseline_points if p.value is None),
        total=sum(p.value for p in baseline_points if p.value is not None),
    )
    return baseline, years, skipped


@router.get(
    "/precipitation/comparison",
    response_model=PrecipitationComparison,
    summary="Observed vs. same-period-in-prior-year rainfall comparison",
)
async def precipitation_comparison(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    days: int = Query(30, ge=7, le=365),
    baseline_years: int = Query(1, ge=1, le=5, description="How many prior years to average"),
) -> PrecipitationComparison:
    point = GeoPoint(latitude=latitude, longitude=longitude)
    start, end = _default_window(days)
    window_len = expected_window_days(start, end)

    observed = await open_meteo.fetch_archive_precipitation(point, start=start, end=end)
    observed_agg = aggregate_precipitation(observed.points, expected_days=window_len)

    baseline, years, skipped = await _build_multi_year_baseline(
        point, start, end, baseline_years
    )
    baseline_agg = aggregate_precipitation(baseline.points)

    try:
        anomaly = compute_anomaly(
            observed_agg,
            baseline_agg,
            observed_classification=observed.provenance.classification,
            baseline_classification=baseline.provenance.classification,
        )
    except ValueError as exc:
        raise InsufficientDataError(str(exc)) from exc

    compare_label = ", ".join(str(y) for y in years) if years else "prior year"
    notes = list(anomaly.notes)
    notes.append(
        f"Comparison is a year-over-year change versus the same period in {compare_label}, "
        "not a 30-year climate normal."
    )
    if skipped:
        notes.append(
            "Years skipped for lack of data: " + ", ".join(str(y) for y in skipped) + "."
        )

    return PrecipitationComparison(
        location=point,
        observed=observed,
        baseline=baseline,
        baseline_years=years,
        anomaly_mm=round(anomaly.anomaly_mm, 2),
        anomaly_percent=(
            round(anomaly.anomaly_percent, 1) if anomaly.anomaly_percent is not None else None
        ),
        classification={"band": anomaly.band, "label": anomaly.band_label},
        supported=True,
        notes=notes,
    )


@router.get(
    "/location/summary",
    response_model=LocationSummary,
    summary="Evidence-backed summary for a location",
)
async def location_summary(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    label: str | None = Query(None, max_length=200),
    window_days: int = Query(30, ge=7, le=90),
) -> LocationSummary:
    try:
        return await build_location_summary(
            GeoPoint(latitude=latitude, longitude=longitude),
            label=label,
            window_days=window_days,
        )
    except ValueError as exc:
        raise InsufficientDataError(str(exc)) from exc


@router.get(
    "/location/availability",
    response_model=LocationSummary,
    summary="Which datasets are available for a location",
)
async def location_availability(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> LocationSummary:
    return await build_location_summary(
        GeoPoint(latitude=latitude, longitude=longitude), window_days=14
    )

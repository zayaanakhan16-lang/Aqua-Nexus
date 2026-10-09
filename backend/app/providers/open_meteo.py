"""Open-Meteo adapters: forecast, historical archive, and climate baseline.

Three distinct products live here because they share a wire format but carry
very different meaning. Forecast, reanalysis and modelled-climate values are
never conflated: each returns its own ``classification``.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from app.config import get_settings
from app.errors import ProviderError, ProviderUnavailableError, ValidationError
from app.models.aggregates import PrecipitationSeries
from app.models.common import DataClassification, GeoPoint, Provenance, TimeSeriesPoint
from app.providers import catalog
from app.providers.base import request_json

FORECAST = catalog.OPEN_METEO_FORECAST
ARCHIVE = catalog.OPEN_METEO_ARCHIVE
CLIMATE = catalog.OPEN_METEO_CLIMATE

# Guard rails so a single request cannot pull an unreasonable amount of data.
MAX_FORECAST_DAYS = 16
MAX_ARCHIVE_DAYS = 366 * 5
MAX_CLIMATE_DAYS = 366 * 40


def _parse_daily(payload: dict, unit: str = "mm") -> list[TimeSeriesPoint]:
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    values = daily.get("precipitation_sum") or []
    points: list[TimeSeriesPoint] = []
    for stamp, value in zip(times, values):
        # Provider timestamps are date-only and would otherwise be reported in
        # local time; anchor them to noon UTC to avoid day-boundary ambiguity.
        ts = datetime.combine(date.fromisoformat(stamp), time(12, 0), tzinfo=timezone.utc)
        points.append(TimeSeriesPoint(timestamp=ts, value=value, unit=unit))
    return points


def _missing_days(payload: dict) -> int:
    daily = payload.get("daily") or {}
    values = daily.get("precipitation_sum") or []
    return sum(1 for v in values if v is None)


async def fetch_forecast_precipitation(
    point: GeoPoint, *, days: int = 7
) -> PrecipitationSeries:
    """Near-term modelled forecast precipitation. Classification: FORECAST."""
    days = max(1, min(days, MAX_FORECAST_DAYS))
    settings = get_settings()
    payload = await request_json(
        settings.open_meteo_forecast_url,
        params={
            "latitude": point.latitude,
            "longitude": point.longitude,
            "daily": "precipitation_sum",
            "timezone": "GMT",
            "forecast_days": days,
        },
        provider_id=FORECAST.id,
    )
    points = _parse_daily(payload)
    if not points:
        raise ProviderUnavailableError("Open-Meteo forecast returned no precipitation data.")
    start = points[0].timestamp.date()
    end = points[-1].timestamp.date()
    return PrecipitationSeries(
        location=point,
        start_date=start,
        end_date=end,
        granularity="daily",
        unit="mm",
        points=points,
        provenance=Provenance(
            source_id=FORECAST.id,
            source_name=FORECAST.name,
            classification=DataClassification.FORECAST,
            observed_at=points[-1].timestamp,
            method="Open-Meteo daily precipitation_sum for the requested grid cell",
            method_version="1.0",
            notes=["Forecast values predict what may occur; they are not observations."],
        ),
        provider=FORECAST,
        coverage="Global land and coastal areas",
        missing_days=_missing_days(payload),
        total=sum(p.value for p in points if p.value is not None),
    )


async def fetch_archive_precipitation(
    point: GeoPoint, *, start: date, end: date
) -> PrecipitationSeries:
    """Historical reanalysis precipitation (ERA5). Classification: REANALYSIS."""
    if end < start:
        raise ValidationError("end_date must be on or after start_date.")
    if (end - start).days > MAX_ARCHIVE_DAYS:
        raise ValidationError(
            f"Historical range too large (max {MAX_ARCHIVE_DAYS} days per request)."
        )
    settings = get_settings()
    payload = await request_json(
        settings.open_meteo_archive_url,
        params={
            "latitude": point.latitude,
            "longitude": point.longitude,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "precipitation_sum",
            "timezone": "GMT",
        },
        provider_id=ARCHIVE.id,
    )
    points = _parse_daily(payload)
    if not points:
        raise ProviderUnavailableError("Open-Meteo archive returned no precipitation data.")
    return PrecipitationSeries(
        location=point,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        granularity="daily",
        unit="mm",
        points=points,
        provenance=Provenance(
            source_id=ARCHIVE.id,
            source_name=ARCHIVE.name,
            classification=DataClassification.REANALYSIS,
            observed_at=points[-1].timestamp,
            method="ERA5 / ERA5-Land daily precipitation_sum via Open-Meteo",
            method_version="1.0",
            notes=[
                "Reanalysis is a model reconstruction constrained by observations; "
                "it is not a gauge record.",
            ],
        ),
        provider=ARCHIVE,
        coverage="Global, 1940 to ~5 days behind real time",
        missing_days=_missing_days(payload),
        total=sum(p.value for p in points if p.value is not None),
    )


async def fetch_climate_precipitation(
    point: GeoPoint, *, start: date, end: date, model: str = "MRI_AGCM3_2_S"
) -> PrecipitationSeries:
    """Downscaled climate-model precipitation for a baseline window.

    Classification: SIMULATION. Used only as a modelled comparison reference and
    always reported as such.
    """
    if end < start:
        raise ValidationError("end_date must be on or after start_date.")
    if (end - start).days > MAX_CLIMATE_DAYS:
        raise ValidationError(
            f"Climate range too large (max {MAX_CLIMATE_DAYS} days per request)."
        )
    settings = get_settings()
    payload = await request_json(
        settings.open_meteo_climate_url,
        params={
            "latitude": point.latitude,
            "longitude": point.longitude,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "precipitation_sum",
            "models": model,
            "timezone": "GMT",
        },
        provider_id=CLIMATE.id,
    )
    points = _parse_daily(payload)
    if not points:
        raise ProviderUnavailableError(
            f"Open-Meteo climate model '{model}' returned no precipitation data."
        )
    return PrecipitationSeries(
        location=point,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        granularity="daily",
        unit="mm",
        points=points,
        provenance=Provenance(
            source_id=CLIMATE.id,
            source_name=CLIMATE.name,
            classification=DataClassification.SIMULATION,
            observed_at=points[-1].timestamp,
            method=f"Downscaled climate model {model} daily precipitation_sum via Open-Meteo",
            method_version="1.0",
            notes=["Climate-model baseline, not an observational record."],
        ),
        provider=CLIMATE,
        coverage=f"Modelled baseline, model={model}",
        missing_days=_missing_days(payload),
        total=sum(p.value for p in points if p.value is not None),
    )


async def fetch_flood_discharge(point: GeoPoint, *, days: int = 14) -> dict:
    """Modelled river discharge (GloFAS). Returns raw normalized points."""
    days = max(1, min(days, 210))
    settings = get_settings()
    try:
        payload = await request_json(
            settings.open_meteo_flood_url,
            params={
                "latitude": point.latitude,
                "longitude": point.longitude,
                "daily": "river_discharge,river_discharge_mean,river_discharge_median",
                "forecast_days": min(days, 210),
                "timezone": "GMT",
            },
            provider_id=catalog.OPEN_METEO_FLOOD.id,
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"River discharge unavailable: {exc.message}",
            details={"provider": catalog.OPEN_METEO_FLOOD.id},
        ) from exc
    return payload


# Re-export for readability of import sites.
__all__ = [
    "fetch_forecast_precipitation",
    "fetch_archive_precipitation",
    "fetch_climate_precipitation",
    "fetch_flood_discharge",
    "MAX_FORECAST_DAYS",
    "MAX_ARCHIVE_DAYS",
    "MAX_CLIMATE_DAYS",
]
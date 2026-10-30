"""Open-Meteo adapters: forecast, historical archive, and climate baseline.

Three distinct products live here because they share a wire format but carry
very different meaning. Forecast, reanalysis and modelled-climate values are
never conflated: each returns its own ``classification``.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from app.config import get_settings
from app.errors import ProviderError, ProviderUnavailableError, ValidationError
from app.models.aggregates import (
    DischargePoint,
    DischargeSeries,
    PrecipitationSeries,
    TemperatureSeries,
    WeatherCurrent,
    WeatherDay,
    WeatherForecast,
)
from app.models.common import DataClassification, GeoPoint, Provenance, TimeSeriesPoint
from app.providers import catalog
from app.providers.base import request_json

FORECAST = catalog.OPEN_METEO_FORECAST
ARCHIVE = catalog.OPEN_METEO_ARCHIVE
CLIMATE = catalog.OPEN_METEO_CLIMATE
FLOOD = catalog.OPEN_METEO_FLOOD

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
            provider_id=FLOOD.id,
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"River discharge unavailable: {exc.message}",
            details={"provider": FLOOD.id},
        ) from exc
    return payload


async def fetch_weather_forecast(point: GeoPoint, *, days: int = 7) -> WeatherForecast:
    """Modelled current conditions plus a daily forecast timeline.

    Classification: FORECAST. ``current`` is the model's latest analysis step,
    which is a modelled value, not an instrument reading — the UI must label it
    accordingly.
    """
    days = max(1, min(days, MAX_FORECAST_DAYS))
    settings = get_settings()
    payload = await request_json(
        settings.open_meteo_forecast_url,
        params={
            "latitude": point.latitude,
            "longitude": point.longitude,
            "current": (
                "temperature_2m,apparent_temperature,relative_humidity_2m,"
                "precipitation,wind_speed_10m,weather_code"
            ),
            "daily": (
                "temperature_2m_max,temperature_2m_min,precipitation_sum,"
                "wind_speed_10m_max,weather_code"
            ),
            "timezone": "GMT",
            "forecast_days": days,
        },
        provider_id=FORECAST.id,
    )

    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    tmax = daily.get("temperature_2m_max") or []
    tmin = daily.get("temperature_2m_min") or []
    psum = daily.get("precipitation_sum") or []
    wmax = daily.get("wind_speed_10m_max") or []
    wcode = daily.get("weather_code") or []
    daily_rows = [
        WeatherDay(
            date=date.fromisoformat(stamp),
            temperature_max_c=_at(tmax, i),
            temperature_min_c=_at(tmin, i),
            precipitation_sum_mm=_at(psum, i),
            wind_speed_max_kmh=_at(wmax, i),
            weather_code=_at_int(wcode, i),
        )
        for i, stamp in enumerate(times)
    ]

    current_raw = payload.get("current") or {}
    current = None
    if current_raw.get("time"):
        current = WeatherCurrent(
            timestamp=_parse_iso_utc(current_raw["time"]),
            temperature_c=current_raw.get("temperature_2m"),
            apparent_temperature_c=current_raw.get("apparent_temperature"),
            relative_humidity_pct=current_raw.get("relative_humidity_2m"),
            precipitation_mm=current_raw.get("precipitation"),
            wind_speed_kmh=current_raw.get("wind_speed_10m"),
            weather_code=current_raw.get("weather_code"),
        )

    if current is None and not daily_rows:
        raise ProviderUnavailableError("Open-Meteo forecast returned no weather data.")

    return WeatherForecast(
        location=point,
        current=current,
        daily=daily_rows,
        provenance=Provenance(
            source_id=FORECAST.id,
            source_name=FORECAST.name,
            classification=DataClassification.FORECAST,
            observed_at=current.timestamp if current else None,
            method="Open-Meteo current conditions and daily forecast for the requested grid cell",
            method_version="1.0",
            notes=[
                "'Current' values are model output, not instrument measurements.",
                "Forecast values predict what may occur; they are not observations.",
            ],
        ),
        provider=FORECAST,
        notes=[
            "Weather values are modelled forecast output (Open-Meteo ICON/GFS blend).",
        ],
    )


async def fetch_discharge_series(
    point: GeoPoint, *, days: int = 14, past_days: int = 30
) -> DischargeSeries:
    """Modelled GloFAS river discharge: reanalysis/hindcast plus forecast.

    Classification: SIMULATION. The Open-Meteo Flood API returns the GloFAS
    ``river_discharge`` for a requested window; the portion before today is
    reanalysis/hindcast and the portion from today onward is forecast. The same
    variable name covers both, so each point carries ``is_forecast`` explicitly
    and the caller can never read a forecast as an observation. The provider also
    returns same-day ensemble statistics (mean/median/max/min/p25/p75) which are
    used to communicate forecast spread.
    """
    days = max(1, min(days, 210))
    past_days = max(0, min(past_days, 92))
    settings = get_settings()
    retrieved_at = datetime.now(tz=timezone.utc)
    try:
        payload = await request_json(
            settings.open_meteo_flood_url,
            params={
                "latitude": point.latitude,
                "longitude": point.longitude,
                "daily": (
                    "river_discharge,river_discharge_mean,river_discharge_median,"
                    "river_discharge_max,river_discharge_min,river_discharge_p25,"
                    "river_discharge_p75"
                ),
                "past_days": past_days,
                "forecast_days": days,
                "timezone": "GMT",
            },
            provider_id=FLOOD.id,
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"River discharge unavailable: {exc.message}",
            details={"provider": FLOOD.id},
        ) from exc

    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    discharge = daily.get("river_discharge") or []
    mean = daily.get("river_discharge_mean") or []
    median = daily.get("river_discharge_median") or []
    vmax = daily.get("river_discharge_max") or []
    vmin = daily.get("river_discharge_min") or []
    p25 = daily.get("river_discharge_p25") or []
    p75 = daily.get("river_discharge_p75") or []

    # The provider snaps the request to its model grid; report the cell it used.
    grid_cell = None
    if isinstance(payload.get("latitude"), (int, float)) and isinstance(
        payload.get("longitude"), (int, float)
    ):
        grid_cell = GeoPoint(
            latitude=float(payload["latitude"]), longitude=float(payload["longitude"])
        )

    today = retrieved_at.date()
    points: list[DischargePoint] = []
    missing = 0
    historical_days = 0
    forecast_days = 0
    for i, stamp in enumerate(times):
        day = date.fromisoformat(stamp)
        is_forecast = day >= today
        if is_forecast:
            forecast_days += 1
        else:
            historical_days += 1
        value = _at(discharge, i)
        if value is None:
            missing += 1
        points.append(
            DischargePoint(
                timestamp=datetime.combine(day, time(12, 0), tzinfo=timezone.utc),
                discharge_m3s=value,
                ensemble_mean_m3s=_at(mean, i),
                ensemble_median_m3s=_at(median, i),
                ensemble_max_m3s=_at(vmax, i),
                ensemble_min_m3s=_at(vmin, i),
                ensemble_p25_m3s=_at(p25, i),
                ensemble_p75_m3s=_at(p75, i),
                is_forecast=is_forecast,
            )
        )

    if not points:
        raise ProviderUnavailableError(
            "The GloFAS river network returned no discharge values for this location."
        )

    valid_days = sum(1 for p in points if p.discharge_m3s is not None)
    return DischargeSeries(
        location=point,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        points=points,
        provenance=Provenance(
            source_id=FLOOD.id,
            source_name=FLOOD.name,
            classification=DataClassification.SIMULATION,
            observed_at=points[-1].timestamp,
            retrieved_at=retrieved_at,
            method="GloFAS v4 modelled daily river_discharge via Open-Meteo Flood API",
            method_version="1.0",
            notes=[
                "Modelled discharge along the GloFAS river network; not a gauge reading.",
                "GloFAS selects the largest river within ~5 km of the point.",
                "Values before today are reanalysis/hindcast; values from today "
                "onward are forecast.",
            ],
        ),
        provider=FLOOD,
        valid_days=valid_days,
        missing_days=missing,
        grid_cell=grid_cell,
        grid_resolution_km=5.0,
        model="GloFAS v4 (Copernicus Emergency Management Service)",
        retrieved_at=retrieved_at,
        historical_days=historical_days,
        forecast_days=forecast_days,
        note=(
            "Modelled discharge, not an observation. Values are grid-cell averages "
            "along the modelled river network and are unavailable where no modelled "
            "river passes near the point. Forecast values carry ensemble spread; a "
            "high discharge is a hydrological signal, not a confirmed flood."
        ),
    )



def _at(values: list, index: int) -> float | None:
    if index >= len(values):
        return None
    value = values[index]
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _at_int(values: list, index: int) -> int | None:
    if index >= len(values):
        return None
    value = values[index]
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_iso_utc(value: str) -> datetime:
    """Parse an Open-Meteo ISO timestamp; anchor date-only values to noon UTC."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def fetch_archive_temperature(
    point: GeoPoint, *, start: date, end: date
) -> TemperatureSeries:
    """Historical reanalysis daily mean temperature (ERA5).

    Classification: REANALYSIS. Used for heat and dry-condition context. It is a
    model reconstruction, not a station measurement, and it is not by itself a
    heatwave classification.
    """
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
            "daily": "temperature_2m_mean,temperature_2m_max",
            "timezone": "GMT",
        },
        provider_id=ARCHIVE.id,
    )
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    means = daily.get("temperature_2m_mean") or []
    points: list[TimeSeriesPoint] = []
    for i, stamp in enumerate(times):
        points.append(
            TimeSeriesPoint(
                timestamp=datetime.combine(
                    date.fromisoformat(stamp), time(12, 0), tzinfo=timezone.utc
                ),
                value=_at(means, i),
                unit="deg C",
            )
        )
    if not points:
        raise ProviderUnavailableError("Open-Meteo archive returned no temperature data.")
    valid_days = sum(1 for p in points if p.value is not None)
    return TemperatureSeries(
        location=point,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        points=points,
        provenance=Provenance(
            source_id=ARCHIVE.id,
            source_name=ARCHIVE.name,
            classification=DataClassification.REANALYSIS,
            observed_at=points[-1].timestamp,
            method="ERA5 daily mean 2 m air temperature via Open-Meteo",
            method_version="1.0",
            notes=[
                "Reanalysis air temperature, not a station measurement.",
                "A single warm day is not a heatwave; duration and a documented "
                "baseline are required.",
            ],
        ),
        provider=ARCHIVE,
        coverage="Global, 1940 to ~5 days behind real time",
        valid_days=valid_days,
        missing_days=len(points) - valid_days,
        note=(
            "Daily mean 2 m air temperature from reanalysis. Heat anomalies are "
            "computed against the same calendar window of a prior year, not a "
            "multi-decade normal."
        ),
    )


# Re-export for readability of import sites.
__all__ = [
    "fetch_forecast_precipitation",
    "fetch_archive_precipitation",
    "fetch_climate_precipitation",
    "fetch_flood_discharge",
    "fetch_weather_forecast",
    "fetch_discharge_series",
    "fetch_archive_temperature",
    "MAX_FORECAST_DAYS",
    "MAX_ARCHIVE_DAYS",
    "MAX_CLIMATE_DAYS",
]
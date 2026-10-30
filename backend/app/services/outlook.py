"""Future outlook service.

Builds the coming-days outlook from the real forecast products (Open-Meteo
forecast precipitation and weather). Everything here is classified ``forecast``
or ``derived``; the module never emits an observed value.

It deliberately does **not** compute a flood probability: no validated flood
forecast model is operated. Instead it reports rainfall-based concern signals
(accumulated forecast rainfall, heavy-rainfall days) and points to the
historical comparison for context, keeping the two classifications separate.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.aggregates import PrecipitationSeries, WeatherForecast
from app.models.common import DataClassification, GeoPoint, ProviderReport, ProviderStatus
from app.models.outlook import LocationOutlook, OutlookPeriod, OutlookSignal
from app.providers import catalog
from app.providers import open_meteo

logger = get_logger(__name__)

FORECAST_DAYS = 14
WEATHER_DAYS = 7
WET_DAY_MM = 1.0
HEAVY_RAIN_MM = 20.0
NOTABLE_ACCUMULATION_MM = 50.0


def _periods(points, predicate) -> list[OutlookPeriod]:
    """Group consecutive forecast days matching a predicate into runs."""
    runs: list[OutlookPeriod] = []
    current: list = []
    for point in points:
        if predicate(point):
            current.append(point)
        else:
            if current:
                runs.append(_to_period(current))
                current = []
    if current:
        runs.append(_to_period(current))
    return runs


def _to_period(days: list) -> OutlookPeriod:
    total = sum(p.value for p in days if p.value is not None)
    return OutlookPeriod(
        kind="rainy" if any((p.value or 0) >= WET_DAY_MM for p in days) else "dry",
        start_date=days[0].timestamp.date(),
        end_date=days[-1].timestamp.date(),
        days=len(days),
        total_mm=round(total, 1) if days else None,
    )


async def _safe(coro):
    try:
        return await coro, None
    except (AquaNexusError, ProviderError, ValueError) as exc:
        return None, exc


async def build_outlook(point: GeoPoint) -> LocationOutlook:
    """Assemble the future outlook for a location."""
    now = datetime.now(tz=timezone.utc)
    providers: list[ProviderReport] = []
    signals: list[OutlookSignal] = []

    (forecast, forecast_exc), (weather, weather_exc) = (
        await _safe(open_meteo.fetch_forecast_precipitation(point, days=FORECAST_DAYS)),
        await _safe(open_meteo.fetch_weather_forecast(point, days=WEATHER_DAYS)),
    )

    rainy: list[OutlookPeriod] = []
    dry: list[OutlookPeriod] = []

    if forecast is not None:
        providers.append(
            ProviderReport(
                provider_id=forecast.provider.id,
                provider_name=forecast.provider.name,
                status=ProviderStatus.OK,
                classification=forecast.provenance.classification,
            )
        )
        points = forecast.points
        values = [p.value for p in points if p.value is not None]
        total = sum(values) if values else None
        heavy = sum(1 for v in values if v >= HEAVY_RAIN_MM)
        wet = sum(1 for v in values if v >= WET_DAY_MM)
        first_day = points[0].timestamp if points else None

        signals.append(
            OutlookSignal(
                key="forecast_accumulation",
                label=f"{FORECAST_DAYS}-day forecast rainfall accumulation",
                value=round(total, 1) if total is not None else None,
                unit="mm",
                status="ok" if total is not None else "insufficient_data",
                classification=DataClassification.FORECAST,
                method=f"Sum of forecast daily precipitation over the next {FORECAST_DAYS} days.",
                limitations=[
                    "Forecast accumulation, not observed rainfall.",
                    "Skill decreases with lead time; convective rainfall is spatially uncertain.",
                ],
            )
        )
        signals.append(
            OutlookSignal(
                key="forecast_wet_days",
                label=f"Forecast rainy days (>= {WET_DAY_MM:.0f} mm)",
                value=float(wet),
                unit="days",
                classification=DataClassification.FORECAST,
                method=f"count(forecast daily precipitation >= {WET_DAY_MM:.0f} mm) over {FORECAST_DAYS} days.",
                limitations=["Threshold-dependent count of modelled days."],
            )
        )
        signals.append(
            OutlookSignal(
                key="forecast_heavy_days",
                label=f"Forecast heavy-rainfall days (>= {HEAVY_RAIN_MM:.0f} mm)",
                value=float(heavy),
                unit="days",
                classification=DataClassification.FORECAST,
                method=(
                    f"count(forecast daily precipitation >= {HEAVY_RAIN_MM:.0f} mm). A rainfall "
                    "concern signal, not a flood probability."
                ),
                limitations=[
                    "A heavy-rainfall forecast is not a flood forecast.",
                    "AquaNexus does not operate a validated flood model.",
                ],
            )
        )
        signals.append(
            OutlookSignal(
                key="accumulation_concern",
                label="Accumulation concern flag",
                value=1.0 if (total or 0) >= NOTABLE_ACCUMULATION_MM else 0.0,
                unit="flag",
                status="ok",
                classification=DataClassification.DERIVED,
                method=(
                    f"1 when the {FORECAST_DAYS}-day forecast accumulation is >= "
                    f"{NOTABLE_ACCUMULATION_MM:.0f} mm, else 0. A screening flag, not a warning."
                ),
                limitations=["An explicit, documented threshold; not an official criterion."],
            )
        )

        rainy = _periods(points, lambda p: (p.value or 0) >= WET_DAY_MM)
        dry = _periods(points, lambda p: (p.value or 0) < WET_DAY_MM)
    else:
        logger.info("Outlook forecast unavailable: %s", forecast_exc)
        providers.append(
            ProviderReport(
                provider_id=catalog.OPEN_METEO_FORECAST.id,
                provider_name=catalog.OPEN_METEO_FORECAST.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(forecast_exc),
            )
        )

    if weather is not None:
        providers.append(
            ProviderReport(
                provider_id=weather.provider.id,
                provider_name=weather.provider.name,
                status=ProviderStatus.OK,
                classification=weather.provenance.classification,
            )
        )
        if weather.daily:
            tmax = [d.temperature_max_c for d in weather.daily if d.temperature_max_c is not None]
            tmin = [d.temperature_min_c for d in weather.daily if d.temperature_min_c is not None]
            if tmax:
                signals.append(
                    OutlookSignal(
                        key="forecast_temp_max",
                        label="Warmest forecast day (modelled)",
                        value=round(max(tmax), 1),
                        unit="°C",
                        classification=DataClassification.FORECAST,
                        method="Maximum daily maximum temperature over the 7-day forecast.",
                        limitations=["Modelled air temperature, not a land-surface temperature."],
                    )
                )
            if tmin:
                signals.append(
                    OutlookSignal(
                        key="forecast_temp_min",
                        label="Coolest forecast night (modelled)",
                        value=round(min(tmin), 1),
                        unit="°C",
                        classification=DataClassification.FORECAST,
                        method="Minimum daily minimum temperature over the 7-day forecast.",
                        limitations=["Modelled air temperature, not a station measurement."],
                    )
                )
    else:
        logger.info("Outlook weather unavailable: %s", weather_exc)

    notes = [
        "Every value in this outlook is a modelled forecast or a derived flag — none of "
        "it is an observation.",
        "AquaNexus does not issue flood probabilities: no validated flood forecast model "
        "is operated. Rainfall concern flags are screening signals only.",
        "Water availability (reservoir levels, groundwater) is not predicted here because "
        "no suitable dataset is connected.",
    ]
    limitations = [
        "Forecast skill decreases with lead time, especially for convective rainfall.",
        "A forecast is not an observed fact and must not be treated as one.",
        "Accumulation thresholds are explicit AquaNexus choices, not official criteria.",
    ]

    return LocationOutlook(
        location=point,
        generated_at=now,
        forecast=forecast,
        weather=weather,
        comparison=None,
        rainy_periods=rainy,
        dry_periods=dry,
        signals=signals,
        providers=providers,
        notes=notes,
        limitations=limitations,
    )

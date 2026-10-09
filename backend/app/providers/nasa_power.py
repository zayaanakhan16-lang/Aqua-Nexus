"""NASA POWER adapter: an independent precipitation cross-check.

NASA POWER is a public, credential-free service. It is used here as a second
reanalysis source so a user can see whether two independent products agree.
"""
from __future__ import annotations

from datetime import date, datetime, time, timezone

from app.config import get_settings
from app.errors import ProviderError, ProviderUnavailableError, ValidationError
from app.models.aggregates import PrecipitationSeries
from app.models.common import DataClassification, GeoPoint, Provenance, TimeSeriesPoint
from app.providers import catalog
from app.providers.base import request_json

PROVIDER = catalog.NASA_POWER
FILL_VALUE = -999.0
MAX_DAYS = 366 * 5


async def fetch_precipitation(point: GeoPoint, *, start: date, end: date) -> PrecipitationSeries:
    """Daily corrected precipitation (PRECTOTCORR) from MERRA-2."""
    if end < start:
        raise ValidationError("end must be on or after start.")
    if (end - start).days > MAX_DAYS:
        raise ValidationError(f"Range too large (max {MAX_DAYS} days per request).")

    settings = get_settings()
    params = {
        "parameters": "PRECTOTCORR",
        "community": "AG",
        "longitude": point.longitude,
        "latitude": point.latitude,
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    if settings.nasa_power_api_key:
        params["api_key"] = settings.nasa_power_api_key

    try:
        payload = await request_json(
            settings.nasa_power_url, params=params, provider_id=PROVIDER.id
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"NASA POWER unavailable: {exc.message}", details={"provider": PROVIDER.id}
        ) from exc

    series = (payload.get("properties") or {}).get("parameter", {}).get("PRECTOTCORR", {})
    if not series:
        raise ProviderUnavailableError("NASA POWER returned no precipitation values.")

    points: list[TimeSeriesPoint] = []
    missing = 0
    for stamp, value in sorted(series.items()):
        try:
            day = datetime.strptime(stamp, "%Y%m%d").date()
        except ValueError:
            continue
        normalized = None if value is None or float(value) <= FILL_VALUE else float(value)
        if normalized is None:
            missing += 1
        points.append(
            TimeSeriesPoint(
                timestamp=datetime.combine(day, time(12, 0), tzinfo=timezone.utc),
                value=normalized,
                unit="mm",
            )
        )
    if not points:
        raise ProviderUnavailableError("NASA POWER returned no parseable dates.")

    return PrecipitationSeries(
        location=point,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        granularity="daily",
        unit="mm",
        points=points,
        provenance=Provenance(
            source_id=PROVIDER.id,
            source_name=PROVIDER.name,
            classification=DataClassification.REANALYSIS,
            observed_at=points[-1].timestamp,
            method="NASA POWER PRECTOTCORR (MERRA-2) daily precipitation",
            method_version="1.0",
            notes=["Independent reanalysis cross-check; not a gauge record."],
        ),
        provider=PROVIDER,
        coverage="Global, 1981 to near-present",
        missing_days=missing,
        total=sum(p.value for p in points if p.value is not None),
    )

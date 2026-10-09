"""Global geographic search via Open-Meteo's GeoNames-backed geocoder."""
from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.errors import ProviderError, ValidationError
from app.models.common import PlaceResult, ProviderReport, ProviderStatus
from app.providers import catalog
from app.providers.base import request_json

PROVIDER = catalog.OPEN_METEO_GEOCODING


def _normalize(raw: dict[str, Any]) -> PlaceResult:
    return PlaceResult(
        id=str(raw.get("id")),
        name=raw.get("name", "Unknown"),
        display_name=_display_name(raw),
        latitude=float(raw["latitude"]),
        longitude=float(raw["longitude"]),
        country=raw.get("country"),
        country_code=raw.get("country_code"),
        admin1=raw.get("admin1"),
        timezone=raw.get("timezone"),
        feature_class=raw.get("feature_code"),
        feature_type=raw.get("feature_code"),
        population=raw.get("population"),
        source_id=PROVIDER.id,
    )


def _display_name(raw: dict[str, Any]) -> str:
    parts = [raw.get("name")]
    for key in ("admin2", "admin1", "country"):
        value = raw.get(key)
        if value and value not in parts:
            parts.append(value)
    return ", ".join(p for p in parts if p)


async def search_places(query: str, *, limit: int = 8, language: str = "en") -> tuple[list[PlaceResult], ProviderReport]:
    """Resolve a free-text query to candidate places anywhere on Earth."""
    if not query or not query.strip():
        raise ValidationError("A non-empty search query is required.")
    if len(query) > 200:
        raise ValidationError("Search query is too long (max 200 characters).")
    limit = max(1, min(limit, 25))

    settings = get_settings()
    try:
        payload = await request_json(
            settings.open_meteo_geocoding_url,
            params={"name": query.strip(), "count": limit, "language": language, "format": "json"},
            provider_id=PROVIDER.id,
        )
    except ProviderError as exc:
        return [], ProviderReport(
            provider_id=PROVIDER.id,
            provider_name=PROVIDER.name,
            status=ProviderStatus.UNAVAILABLE,
            message=exc.message,
        )

    raw_results = payload.get("results") or []
    results: list[PlaceResult] = []
    for raw in raw_results:
        try:
            results.append(_normalize(raw))
        except (KeyError, TypeError, ValueError):
            # Skip malformed entries instead of failing the whole search.
            continue

    status = ProviderStatus.OK if results else ProviderStatus.UNAVAILABLE
    message = None if results else f"No places matched '{query}'."
    return results, ProviderReport(
        provider_id=PROVIDER.id,
        provider_name=PROVIDER.name,
        status=status,
        message=message,
        classification=PROVIDER.classification,
    )

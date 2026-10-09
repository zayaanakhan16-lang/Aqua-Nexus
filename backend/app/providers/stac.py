"""Copernicus Data Space Ecosystem STAC catalogue adapter.

Searches scene metadata only. Water-body classification and change detection are
explicitly NOT implemented here; this adapter answers "what imagery exists for
this area and time?" so a future processing pipeline can be built on it.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.config import get_settings
from app.errors import ProviderError, ProviderUnavailableError, ValidationError
from app.models.common import BoundingBox, ProviderReport, ProviderStatus
from app.providers import catalog
from app.providers.base import request_json

PROVIDER = catalog.CDSE_STAC

SUPPORTED_COLLECTIONS = {"sentinel-2-l2a", "sentinel-1-grd", "sentinel-3-olci-l1b"}


class StacItem(BaseModel):
    """A minimal, normalized view of a STAC feature."""

    id: str
    collection: str
    acquired_at: datetime | None = None
    cloud_cover: float | None = None
    platform: str | None = None
    thumbnail: str | None = None
    bbox: list[float] | None = None


class StacSearchResult(BaseModel):
    bbox: BoundingBox
    start: datetime
    end: datetime
    collection: str
    count: int
    items: list[StacItem] = Field(default_factory=list)
    provider: ProviderReport
    note: str


def _extract_thumbnail(feature: dict) -> str | None:
    assets = feature.get("assets") or {}
    for key in ("thumbnail", "preview"):
        asset = assets.get(key)
        if asset and asset.get("href"):
            return asset["href"]
    return None


def _normalize_item(feature: dict) -> StacItem:
    props = feature.get("properties") or {}
    acquired = props.get("datetime") or props.get("start_datetime")
    acquired_at = None
    if acquired:
        try:
            acquired_at = datetime.fromisoformat(acquired.replace("Z", "+00:00"))
            if acquired_at.tzinfo is None:
                acquired_at = acquired_at.replace(tzinfo=timezone.utc)
        except ValueError:
            acquired_at = None
    return StacItem(
        id=str(feature.get("id")),
        collection=feature.get("collection", "unknown"),
        acquired_at=acquired_at,
        cloud_cover=props.get("eo:cloud_cover"),
        platform=props.get("platform"),
        thumbnail=_extract_thumbnail(feature),
        bbox=feature.get("bbox"),
    )


async def search_scenes(
    bbox: BoundingBox,
    *,
    start: datetime,
    end: datetime,
    collection: str = "sentinel-2-l2a",
    limit: int = 12,
) -> StacSearchResult:
    """Search the STAC catalogue for scenes intersecting a bounding box."""
    if collection not in SUPPORTED_COLLECTIONS:
        raise ValidationError(
            f"Unsupported collection '{collection}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_COLLECTIONS))}."
        )
    if end < start:
        raise ValidationError("end must be on or after start.")
    limit = max(1, min(limit, 50))

    settings = get_settings()
    body = {
        "collections": [collection],
        "bbox": [bbox.west, bbox.south, bbox.east, bbox.north],
        "datetime": f"{start.astimezone(timezone.utc).isoformat()}/"
        f"{end.astimezone(timezone.utc).isoformat()}",
        "limit": limit,
    }
    try:
        payload = await request_json(
            settings.cdse_stac_url,
            method="POST",
            json_body=body,
            provider_id=PROVIDER.id,
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"Satellite catalogue unavailable: {exc.message}",
            details={"provider": PROVIDER.id},
        ) from exc

    features = payload.get("features") or []
    items = [_normalize_item(f) for f in features]
    return StacSearchResult(
        bbox=bbox,
        start=start,
        end=end,
        collection=collection,
        count=len(items),
        items=items,
        provider=ProviderReport(
            provider_id=PROVIDER.id,
            provider_name=PROVIDER.name,
            status=ProviderStatus.OK if items else ProviderStatus.UNAVAILABLE,
            message=None if items else "No scenes matched this extent and time window.",
            classification=PROVIDER.classification,
        ),
        note=(
            "Scene metadata only. AquaNexus does not yet perform water-body "
            "classification or change detection on this imagery."
        ),
    )

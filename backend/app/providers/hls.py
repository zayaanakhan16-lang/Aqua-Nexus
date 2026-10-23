"""NASA HLS (Harmonized Landsat Sentinel-2) product discovery.

HLS harmonizes Landsat 8/9 (L30) and Sentinel-2 (S30) surface reflectance into a
common 30 m, nadir BRDF-adjusted grid. This adapter answers the same question the
Copernicus adapter answers — "what imagery exists for this area and time?" — but
for NASA's harmonized products, and it keeps the two sources clearly distinct.

Access route
------------
Discovery uses NASA's **CMR STAC API** (the LP DAAC ``LPCLOUD`` provider). CMR
STAC metadata search is anonymous, so no Earthdata credential is required to list
HLS granules. Only downloading the underlying COG/GeoTIFF pixels requires an
Earthdata Login token, and AquaNexus does not download HLS pixels here.

Honesty rules
-------------
* Only real CMR records are returned. Nothing is synthesized when CMR is
  unreachable: the caller receives an explicit ``unavailable`` state instead.
* HLS is **30 m** harmonized data, not native 10 m Sentinel-2. That distinction
  is stated in the result note and in the provider metadata so the two sources
  are never conflated.
"""
from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field

from app.config import get_settings
from app.errors import ProviderError, ProviderUnavailableError, ValidationError
from app.models.common import BoundingBox, ProviderReport, ProviderStatus
from app.providers import catalog
from app.providers.base import request_json

PROVIDER = catalog.HLS_LPCLOUD

# CMR STAC collection ids for HLS v2.0. S30 is the Sentinel-2 source; L30 is the
# Landsat source. S30 is the default because it has the finer effective revisit
# for the Sentinel-2 half of the harmonization.
COLLECTION_S30 = "HLSS30_2.0"
COLLECTION_L30 = "HLSL30_2.0"
SUPPORTED_COLLECTIONS = {COLLECTION_S30, COLLECTION_L30}

# Which satellite each harmonized collection is derived from. Reported in the UI
# so an HLS scene is never mistaken for a native Sentinel-2 or Landsat product.
_DATA_SOURCE = {
    COLLECTION_S30: "Sentinel-2 (MSI)",
    COLLECTION_L30: "Landsat 8/9 (OLI)",
}


class HLSItem(BaseModel):
    """A minimal, normalized view of one HLS granule record."""

    id: str
    collection: str
    data_source: str  # "Sentinel-2 (MSI)" or "Landsat 8/9 (OLI)"
    acquired_at: datetime | None = None
    cloud_cover: float | None = None
    bbox: list[float] | None = None
    # Link to the granule's CMR landing page / metadata so a user can inspect the
    # real record. Never a fabricated URL.
    record_url: str | None = None


class HLSSearchResult(BaseModel):
    bbox: BoundingBox
    start: datetime
    end: datetime
    collection: str
    data_source: str
    count: int
    items: list[HLSItem] = Field(default_factory=list)
    provider: ProviderReport
    note: str


def _record_url(feature: dict, base_url: str) -> str | None:
    """Return the granule's self/collection link when CMR provides one."""
    for link in feature.get("links") or []:
        if link.get("rel") in ("self", "item") and link.get("href"):
            return link["href"]
    # Fall back to the CMR STAC collection browser for the granule id.
    ident = feature.get("id")
    if ident:
        return f"{base_url.rstrip('/')}/collections/{COLLECTION_S30}/items/{ident}"
    return None


def _normalize_item(feature: dict, *, base_url: str) -> HLSItem:
    props = feature.get("properties") or {}
    collection = feature.get("collection") or props.get("collection") or COLLECTION_S30
    acquired = props.get("datetime") or props.get("start_datetime")
    acquired_at = None
    if acquired:
        try:
            acquired_at = datetime.fromisoformat(str(acquired).replace("Z", "+00:00"))
            if acquired_at.tzinfo is None:
                acquired_at = acquired_at.replace(tzinfo=timezone.utc)
        except ValueError:
            acquired_at = None
    cloud = props.get("eo:cloud_cover")
    return HLSItem(
        id=str(feature.get("id")),
        collection=str(collection),
        data_source=_DATA_SOURCE.get(str(collection), "Harmonized (HLS)"),
        acquired_at=acquired_at,
        cloud_cover=cloud if isinstance(cloud, (int, float)) else None,
        bbox=feature.get("bbox"),
        record_url=_record_url(feature, base_url),
    )


async def search_hls(
    bbox: BoundingBox,
    *,
    start: datetime,
    end: datetime,
    collection: str = COLLECTION_S30,
    limit: int = 12,
) -> HLSSearchResult:
    """Search NASA CMR STAC for HLS granules intersecting a bounding box.

    Anonymous: CMR STAC metadata search needs no Earthdata credential. Raises
    ``ProviderUnavailableError`` when CMR cannot be reached so the UI can state
    the limitation rather than inventing scenes.
    """
    if collection not in SUPPORTED_COLLECTIONS:
        raise ValidationError(
            f"Unsupported HLS collection '{collection}'. "
            f"Supported: {', '.join(sorted(SUPPORTED_COLLECTIONS))}."
        )
    if end < start:
        raise ValidationError("end must be on or after start.")
    limit = max(1, min(limit, 50))

    settings = get_settings()
    base_url = settings.cmr_hls_stac_url.rstrip("/")
    body = {
        "collections": [collection],
        "bbox": [bbox.west, bbox.south, bbox.east, bbox.north],
        "datetime": f"{start.astimezone(timezone.utc).isoformat()}/"
        f"{end.astimezone(timezone.utc).isoformat()}",
        "limit": limit,
    }
    try:
        payload = await request_json(
            f"{base_url}/search",
            method="POST",
            json_body=body,
            provider_id=PROVIDER.id,
        )
    except ProviderError as exc:
        raise ProviderUnavailableError(
            f"NASA HLS catalogue unavailable: {exc.message}",
            details={"provider": PROVIDER.id},
        ) from exc

    features = payload.get("features") or []
    items = [_normalize_item(f, base_url=base_url) for f in features]
    return HLSSearchResult(
        bbox=bbox,
        start=start,
        end=end,
        collection=collection,
        data_source=_DATA_SOURCE.get(collection, "Harmonized (HLS)"),
        count=len(items),
        items=items,
        provider=ProviderReport(
            provider_id=PROVIDER.id,
            provider_name=PROVIDER.name,
            status=ProviderStatus.OK if items else ProviderStatus.UNAVAILABLE,
            message=None if items else "No HLS granules matched this extent and time window.",
            classification=PROVIDER.classification,
        ),
        note=(
            "NASA HLS harmonizes Landsat and Sentinel-2 to a common 30 m, "
            "nadir BRDF-adjusted grid. It is not a like-for-like replacement for "
            "native 10 m Sentinel-2 imagery. Metadata only: AquaNexus does not "
            "download or classify the HLS pixels here."
        ),
    )

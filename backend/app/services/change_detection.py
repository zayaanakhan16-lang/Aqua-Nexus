"""Imagery change detection (scene discovery, not pixel classification).

Discovers two real, date-separated satellite scenes over the selected area and
presents them for visual comparison. It is deliberately honest about its scope:

* AquaNexus does **not** download Level-2A bands or classify pixels in this
  build, so it reports no water-surface or vegetation *change measurement*.
* ``comparable`` is only true when two scenes exist, are separated by at least
  the minimum interval, and their cloud cover is low enough to be usable. The
  comparability conditions a real analysis would need are listed explicitly.

This keeps the module useful (real before/after imagery with dates, resolutions
and cloud cover) without overstating what the platform computes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.common import BoundingBox, GeoPoint, ProviderReport, ProviderStatus
from app.models.water_intel import ChangeDetectionResult, ChangeScene
from app.providers import catalog
from app.providers.hls import COLLECTION_S30, search_hls
from app.providers.stac import search_scenes

logger = get_logger(__name__)

SEARCH_DAYS = 180
MIN_SEPARATION_DAYS = 30
MAX_USABLE_CLOUD_PCT = 40.0

INDICATORS = [
    "Water-surface expansion or reduction (NDWI / MNDWI differencing)",
    "Vegetation change around water bodies (NDVI differencing)",
    "Land-surface and seasonal change",
    "Flood-related extent change where cloud-free scenes allow",
]


def _scene_from_stac(role: str, item) -> ChangeScene:
    return ChangeScene(
        role=role,  # type: ignore[arg-type]
        scene_id=item.id,
        collection=item.collection,
        acquired_at=item.acquired_at,
        cloud_cover=item.cloud_cover,
        platform=item.platform,
        thumbnail=item.thumbnail,
        bbox=item.bbox,
        resolution="10 m (Sentinel-2 L2A)",
    )


def _scene_from_hls(role: str, item) -> ChangeScene:
    return ChangeScene(
        role=role,  # type: ignore[arg-type]
        scene_id=item.id,
        collection=item.collection,
        acquired_at=item.acquired_at,
        cloud_cover=item.cloud_cover,
        platform=item.data_source,
        thumbnail=None,
        bbox=item.bbox,
        resolution="30 m (HLS harmonized)",
    )


async def detect_change(
    point: GeoPoint,
    *,
    radius_deg: float = 0.2,
    search_days: int = SEARCH_DAYS,
) -> ChangeDetectionResult:
    """Find a comparable before/after scene pair for a location."""
    now = datetime.now(tz=timezone.utc)
    start = now - timedelta(days=search_days)
    bbox = BoundingBox(
        west=max(-180.0, point.longitude - radius_deg),
        south=max(-90.0, point.latitude - radius_deg),
        east=min(180.0, point.longitude + radius_deg),
        north=min(90.0, point.latitude + radius_deg),
    )

    providers: list[ProviderReport] = []
    scenes: list[ChangeScene] = []

    # --- Copernicus Sentinel-2 (native 10 m, has rendered previews) -------
    try:
        stac = await search_scenes(
            bbox, start=start, end=now, collection="sentinel-2-l2a", limit=50
        )
        providers.append(stac.provider)
        for item in stac.items:
            scenes.append(_scene_from_stac("later", item))
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("Change detection STAC unavailable: %s", exc)
        providers.append(
            ProviderReport(
                provider_id=catalog.CDSE_STAC.id,
                provider_name=catalog.CDSE_STAC.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
                classification=catalog.CDSE_STAC.classification,
            )
        )

    # --- NASA HLS (harmonized 30 m, metadata only) ------------------------
    try:
        hls = await search_hls(
            bbox, start=start, end=now, collection=COLLECTION_S30, limit=20
        )
        providers.append(hls.provider)
        for item in hls.items:
            scenes.append(_scene_from_hls("later", item))
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("Change detection HLS unavailable: %s", exc)
        providers.append(
            ProviderReport(
                provider_id=catalog.HLS_LPCLOUD.id,
                provider_name=catalog.HLS_LPCLOUD.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
                classification=catalog.HLS_LPCLOUD.classification,
            )
        )

    # Prefer Sentinel-2 (10 m) scenes with a thumbnail and usable cloud cover.
    dated = [s for s in scenes if s.acquired_at is not None]
    dated.sort(key=lambda s: s.acquired_at)  # type: ignore[arg-type]

    s2 = [s for s in dated if s.collection == "sentinel-2-l2a"]
    usable = [
        s
        for s in s2
        if s.cloud_cover is None or s.cloud_cover <= MAX_USABLE_CLOUD_PCT
    ]

    earlier: ChangeScene | None = None
    later: ChangeScene | None = None
    comparable = False
    note: str

    if len(usable) >= 2:
        earlier = usable[0]
        later = usable[-1]
        gap = (later.acquired_at - earlier.acquired_at).days  # type: ignore[operator]
        if gap >= MIN_SEPARATION_DAYS:
            comparable = True
            note = (
                f"Two low-cloud Sentinel-2 scenes separated by {gap} days are available. "
                "A quantitative change analysis would additionally require consistent "
                "processing, cloud masking and a matched acquisition geometry."
            )
        else:
            comparable = False
            note = (
                f"The two most usable scenes are only {gap} days apart "
                f"(minimum {MIN_SEPARATION_DAYS} days required for a meaningful seasonal "
                "comparison)."
            )
        earlier.role = "earlier"
        later.role = "later"
    elif len(usable) == 1:
        later = usable[-1]
        note = (
            "Only one low-cloud Sentinel-2 scene is available in the window, so a "
            "before/after comparison cannot be formed."
        )
    elif s2:
        earlier = s2[0]
        later = s2[-1]
        note = (
            "Scenes exist but all exceed the "
            f"{MAX_USABLE_CLOUD_PCT:.0f}% cloud-cover limit, so a reliable comparison is "
            "not possible for this period."
        )
    else:
        note = (
            "No Sentinel-2 scenes were found for this area and period, so no comparison "
            "is available."
        )

    limitations = [
        "AquaNexus does not download or classify imagery pixels in this build, so no "
        "water-surface or vegetation change value is computed.",
        "Optical scenes are cloud-affected; cloud cover varies by scene and season.",
        "Comparability requires consistent processing, cloud masking and acquisition "
        "geometry, none of which is guaranteed by date separation alone.",
    ]

    return ChangeDetectionResult(
        location=point,
        bbox=bbox,
        generated_at=now,
        comparable=comparable,
        comparability_note=note,
        earlier=earlier,
        later=later,
        scenes=dated,
        indicators=INDICATORS,
        providers=providers,
        limitations=limitations,
        notes=[
            "Scenes shown are real catalogue records from Copernicus (Sentinel-2, 10 m) "
            "and NASA HLS (30 m harmonized). No imagery is synthesized.",
        ],
    )

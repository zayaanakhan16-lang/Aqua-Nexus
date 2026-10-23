"""Satellite catalogue routes (scene metadata search only)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from app.models.common import BoundingBox, GeoPoint
from app.providers.hls import (
    COLLECTION_S30,
    HLSSearchResult,
    search_hls,
)
from app.providers.stac import StacSearchResult, search_scenes

router = APIRouter(tags=["satellite"])


@router.get(
    "/satellite/scenes",
    response_model=StacSearchResult,
    summary="Search Sentinel satellite scene metadata (STAC)",
)
async def satellite_scenes(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_deg: float = Query(0.1, gt=0, le=2.0, description="Half-size of the search box"),
    days: int = Query(30, ge=1, le=365),
    collection: str = Query("sentinel-2-l2a"),
    limit: int = Query(12, ge=1, le=50),
) -> StacSearchResult:
    point = GeoPoint(latitude=latitude, longitude=longitude)
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=days)
    bbox = BoundingBox(
        west=max(-180.0, point.longitude - radius_deg),
        south=max(-90.0, point.latitude - radius_deg),
        east=min(180.0, point.longitude + radius_deg),
        north=min(90.0, point.latitude + radius_deg),
    )
    return await search_scenes(
        bbox, start=start, end=end, collection=collection, limit=limit
    )


@router.get(
    "/satellite/hls",
    response_model=HLSSearchResult,
    summary="Search NASA HLS (Harmonized Landsat Sentinel-2) granule metadata",
)
async def satellite_hls(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_deg: float = Query(0.1, gt=0, le=2.0, description="Half-size of the search box"),
    days: int = Query(30, ge=1, le=365),
    collection: str = Query(
        COLLECTION_S30,
        description="HLSS30_2.0 (Sentinel-2 source) or HLSL30_2.0 (Landsat source)",
    ),
    limit: int = Query(12, ge=1, le=50),
) -> HLSSearchResult:
    """Discover real NASA HLS granules via CMR STAC (anonymous, key-free).

    Kept separate from ``/satellite/scenes`` so an HLS granule is never confused
    with a native Copernicus Sentinel-2 scene in the UI.
    """
    point = GeoPoint(latitude=latitude, longitude=longitude)
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=days)
    bbox = BoundingBox(
        west=max(-180.0, point.longitude - radius_deg),
        south=max(-90.0, point.latitude - radius_deg),
        east=min(180.0, point.longitude + radius_deg),
        north=min(90.0, point.latitude + radius_deg),
    )
    return await search_hls(
        bbox, start=start, end=end, collection=collection, limit=limit
    )

"""Water-feature discovery and area-selection routes."""
from __future__ import annotations

from fastapi import APIRouter, Body, Query

from app.models.common import GeoPoint
from app.models.water import AreaSelection, WaterBodyResult
from app.providers.water_bodies import find_water_bodies
from app.services.geometry import build_area_selection

router = APIRouter(tags=["water"])


@router.get(
    "/water/bodies",
    response_model=WaterBodyResult,
    summary="Find mapped water bodies near a point (OpenStreetMap)",
)
async def water_bodies(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(15_000, ge=500, le=50_000),
    limit: int = Query(25, ge=1, le=60),
) -> WaterBodyResult:
    return await find_water_bodies(
        GeoPoint(latitude=latitude, longitude=longitude),
        radius_m=radius_m,
        limit=limit,
    )


@router.post(
    "/water/area",
    response_model=AreaSelection,
    summary="Validate a drawn area selection and resolve its analysis point",
)
async def select_area(
    coordinates: list[list[float]] | None = Body(
        default=None, description="Drawn ring as [[lon, lat], ...]"
    ),
    latitude: float | None = Body(default=None),
    longitude: float | None = Body(default=None),
    label: str | None = Body(default=None),
) -> AreaSelection:
    point = (
        GeoPoint(latitude=latitude, longitude=longitude)
        if latitude is not None and longitude is not None
        else None
    )
    return build_area_selection(coordinates, point=point, label=label)

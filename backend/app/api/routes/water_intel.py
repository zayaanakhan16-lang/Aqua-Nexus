"""Local water-intelligence routes.

Thin HTTP surface for the surface-water presence, water-body, flood-evidence,
change-detection and future-outlook modules. Each route validates input, calls
exactly one service and returns a typed model; no scientific logic lives here.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.common import GeoPoint, ProviderReport, ProviderStatus
from app.models.outlook import LocationOutlook
from app.models.water_intel import (
    ChangeDetectionResult,
    FloodEvidenceResult,
    WaterBodySummary,
    WaterPresenceResult,
)
from app.providers.water_bodies import find_water_bodies
from app.services.change_detection import detect_change
from app.services.flood_evidence import assess_flood_evidence
from app.services.outlook import build_outlook
from app.services.water_presence import assess_water_presence

router = APIRouter(tags=["water-intelligence"])


@router.get(
    "/water/presence",
    response_model=WaterPresenceResult,
    summary="Observable surface-water presence for a location",
)
async def water_presence(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(10_000, ge=500, le=50_000),
) -> WaterPresenceResult:
    return await assess_water_presence(
        GeoPoint(latitude=latitude, longitude=longitude), radius_m=radius_m
    )


@router.get(
    "/water/bodies/summary",
    response_model=WaterBodySummary,
    summary="Nearby mapped water bodies with a per-kind summary",
)
async def water_bodies_summary(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(15_000, ge=500, le=50_000),
    limit: int = Query(25, ge=1, le=60),
) -> WaterBodySummary:
    point = GeoPoint(latitude=latitude, longitude=longitude)
    result = await find_water_bodies(point, radius_m=radius_m, limit=limit)
    by_kind: dict[str, int] = {}
    for body in result.bodies:
        by_kind[body.kind] = by_kind.get(body.kind, 0) + 1
    nearest: float | None = None
    if result.bodies:
        from app.services.geometry import nearest_vertex_km

        nearest = round(
            min(nearest_vertex_km(point, b.coordinates) for b in result.bodies), 2
        )
    return WaterBodySummary(
        location=point,
        radius_m=result.radius_m,
        count=result.count,
        bodies=result.bodies,
        provider=result.provider,
        note=result.note,
        by_kind=by_kind,
        nearest_km=nearest,
    )


@router.get(
    "/flood/evidence",
    response_model=FloodEvidenceResult,
    summary="Flood-related evidence screening (not a flood forecast)",
)
async def flood_evidence(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> FloodEvidenceResult:
    return await assess_flood_evidence(GeoPoint(latitude=latitude, longitude=longitude))


@router.get(
    "/change/detection",
    response_model=ChangeDetectionResult,
    summary="Before/after satellite scene discovery (no pixel classification)",
)
async def change_detection(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_deg: float = Query(0.2, gt=0, le=2.0),
    search_days: int = Query(180, ge=30, le=365),
) -> ChangeDetectionResult:
    return await detect_change(
        GeoPoint(latitude=latitude, longitude=longitude),
        radius_deg=radius_deg,
        search_days=search_days,
    )


@router.get(
    "/outlook",
    response_model=LocationOutlook,
    summary="Future outlook for a location (forecast products only)",
)
async def outlook(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
) -> LocationOutlook:
    return await build_outlook(GeoPoint(latitude=latitude, longitude=longitude))

"""AI analysis route.

Returns a grounded evidence package for a location and, when an AI provider is
configured, the model's structured interpretation of it. The endpoint never
fabricates a report: an unconfigured or failed provider is reported explicitly
while the evidence package is still returned.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.ai import AIAnalysisReport
from app.models.common import GeoPoint
from app.services.ai_analysis import analyze_location

router = APIRouter(tags=["ai"])


@router.get(
    "/ai/analysis",
    response_model=AIAnalysisReport,
    summary="Evidence-grounded AI analysis for a location",
)
async def ai_analysis(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    label: str | None = Query(None, max_length=200),
    window_days: int = Query(30, ge=7, le=90),
) -> AIAnalysisReport:
    return await analyze_location(
        GeoPoint(latitude=latitude, longitude=longitude),
        label=label,
        window_days=window_days,
    )

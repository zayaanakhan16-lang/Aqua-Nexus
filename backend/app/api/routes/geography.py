"""Geographic search routes."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.aggregates import PlaceSearchResponse
from app.providers.geocoding import PROVIDER, search_places

router = APIRouter(tags=["geography"])


@router.get(
    "/geocode",
    response_model=PlaceSearchResponse,
    summary="Search for places worldwide (cities, features, coordinates)",
)
async def geocode(
    q: str = Query(..., min_length=1, max_length=200, description="Free-text place query"),
    limit: int = Query(8, ge=1, le=25),
    language: str = Query("en", max_length=8),
) -> PlaceSearchResponse:
    results, report = await search_places(q, limit=limit, language=language)
    return PlaceSearchResponse(
        query=q,
        count=len(results),
        results=results,
        provider=report,
        attribution=PROVIDER.attribution,
    )

"""Saved study-area routes (CRUD)."""
from __future__ import annotations

from fastapi import APIRouter, Response, status

from app.models.study_area import (
    StudyArea,
    StudyAreaCreate,
    StudyAreaListResponse,
    StudyAreaUpdate,
)
from app.services import study_areas

router = APIRouter(tags=["study-areas"])


@router.get(
    "/study-areas",
    response_model=StudyAreaListResponse,
    summary="List saved study areas",
)
async def list_study_areas() -> StudyAreaListResponse:
    areas = await study_areas.list_study_areas()
    return StudyAreaListResponse(count=len(areas), study_areas=areas)


@router.post(
    "/study-areas",
    response_model=StudyArea,
    status_code=status.HTTP_201_CREATED,
    summary="Create a study area",
)
async def create_study_area(payload: StudyAreaCreate) -> StudyArea:
    return await study_areas.create_study_area(
        name=payload.name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        label=payload.label,
        place=payload.place,
    )


@router.get(
    "/study-areas/{study_area_id}",
    response_model=StudyArea,
    summary="Fetch a study area",
)
async def get_study_area(study_area_id: str) -> StudyArea:
    return await study_areas.get_study_area(study_area_id)


@router.patch(
    "/study-areas/{study_area_id}",
    response_model=StudyArea,
    summary="Rename a study area",
)
async def rename_study_area(study_area_id: str, payload: StudyAreaUpdate) -> StudyArea:
    return await study_areas.rename_study_area(study_area_id, payload.name)


@router.delete(
    "/study-areas/{study_area_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a study area",
)
async def delete_study_area(study_area_id: str) -> Response:
    await study_areas.delete_study_area(study_area_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

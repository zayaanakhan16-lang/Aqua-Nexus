"""Saved study-area domain models.

A study area is a user-authored, named location — a coordinate plus an optional
resolved place — persisted so an investigation can be reopened later. It carries
only what the user supplied (name, coordinates, label); no derived value is
stored, because indicators must always be recomputed from live providers rather
than replayed from a stale snapshot.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.common import GeoPoint, PlaceResult, utcnow


class StudyAreaCreate(BaseModel):
    """Request body for creating a study area."""

    name: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str | None = Field(default=None, max_length=200)
    place: PlaceResult | None = None


class StudyAreaUpdate(BaseModel):
    """Request body for renaming a study area."""

    name: str = Field(min_length=1, max_length=120)


class StudyArea(BaseModel):
    """A persisted, named investigation location."""

    id: str
    name: str
    location: GeoPoint
    label: str | None = None
    place: PlaceResult | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class StudyAreaListResponse(BaseModel):
    count: int
    study_areas: list[StudyArea] = Field(default_factory=list)

"""Shared request schemas for the API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class CoordinateQuery(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

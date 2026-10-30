"""Models for discovered water bodies and for user-drawn selection areas.

A ``WaterBody`` carries its real outline geometry so the map can draw the actual
shape. An ``AreaSelection`` carries the geometry a user drew (or the bounding
box a place resolved to) plus the analysis point actually used, so the UI can
state exactly what spatial extent an analysis covers.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.common import BoundingBox, GeoPoint, ProviderReport


class WaterBody(BaseModel):
    """One mapped water feature with real outline geometry."""

    id: str
    name: str | None = None
    kind: str  # water | lake | river | riverbank | reservoir | wetland
    # Closed ring of [longitude, latitude] pairs (first point repeated last).
    coordinates: list[list[float]]
    bbox: BoundingBox
    area_km2: float | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    source_id: str


class WaterBodyResult(BaseModel):
    """Mapped water features near a point."""

    location: GeoPoint
    radius_m: int
    count: int
    bodies: list[WaterBody] = Field(default_factory=list)
    provider: ProviderReport
    note: str
    # True when the mapping service answered (even with zero features); False when
    # it could not be reached. Callers must use this to distinguish "no mapped
    # water" from "no coverage" — the provider status alone conflates the two.
    service_reachable: bool = True
    # The radius actually queried. Cached lookups are keyed on it, so a shared
    # result must report the radius it was built for rather than the caller's.
    lookup_radius_m: int | None = None


class AreaSelection(BaseModel):
    """A user-drawn or place-derived spatial selection.

    ``coordinates`` is the drawn ring (empty when the selection came from a
    place point). ``analysis_point`` is the single coordinate the existing
    point-based analysis actually runs on, and ``coverage`` states plainly
    whether the analysis covers the whole area or only that point, so a drawn
    region is never implied to be fully analysed when it is not.
    """

    bbox: BoundingBox
    coordinates: list[list[float]] = Field(default_factory=list)
    area_km2: float | None = None
    analysis_point: GeoPoint
    # "full_area" | "bounding_box" | "point_only"
    coverage: str
    coverage_note: str
    label: str | None = None

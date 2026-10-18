"""Models for the global map-layer catalog.

Every layer is described with the facts a user needs to interpret it: the
product, its units, spatial and temporal resolution, the source and attribution,
an accessible colour legend, and an explicit availability state. A layer that
cannot be shown is reported with ``available=False`` and a reason — it is never
silently dropped or replaced with decorative imagery.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.common import DataClassification


class LegendStop(BaseModel):
    """One entry in a layer's colour legend."""

    value: float | None = None
    color: str
    label: str


class MapLayer(BaseModel):
    """A supported global observation/derived raster layer."""

    id: str
    name: str
    category: str  # precipitation | heat | dry | flood | surface_water | imagery | availability
    description: str
    classification: DataClassification
    units: str
    spatial_resolution: str
    temporal_resolution: str
    source_id: str
    source_name: str
    attribution: str
    product: str | None = None
    docs_url: str | None = None
    color_scale: list[str] = Field(default_factory=list)
    legend: list[LegendStop] = Field(default_factory=list)
    legend_note: str
    available: bool
    unavailable_reason: str | None = None
    default_date: date | None = None
    tile_template: str | None = None
    tile_format: str = "png"
    max_zoom: int = 6
    default_opacity: float = 0.75
    limitations: list[str] = Field(default_factory=list)
    disclaimer: str | None = None


class MapLayerCatalog(BaseModel):
    """The set of layers the deployment can currently render."""

    generated_at: datetime
    default_date: date
    available_count: int
    layers: list[MapLayer]
    notes: list[str] = Field(default_factory=list)

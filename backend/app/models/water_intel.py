"""Models for the local water-intelligence modules.

These cover surface-water presence, nearby water bodies, flood-related evidence
and imagery change detection. Every model carries an explicit availability
state, provenance and limitations so a value is never presented without the
context needed to interpret it.

Design rules that are enforced by the shapes below:

* **Observed water is never flooding.** ``WaterPresenceResult`` describes
  observable surface water; ``FloodEvidenceResult`` describes flood *evidence*
  and states plainly that it is a screening signal, not a warning.
* **Missing coverage is not absence.** ``status`` distinguishes
  ``insufficient_evidence`` from ``no_water_detected``.
* **Change is only computed when comparable.** ``ChangeDetectionResult`` reports
  ``comparable=False`` with a reason rather than differencing incomparable
  scenes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.aggregates import DischargeSeries
from app.models.common import (
    BoundingBox,
    DataClassification,
    GeoPoint,
    ProviderReport,
)
from app.models.water import WaterBody

# --- Surface-water presence -------------------------------------------------

WaterPresenceStatus = Literal[
    "water_detected",
    "no_water_detected",
    "partial_coverage",
    "insufficient_evidence",
    "unavailable",
]


class WaterPresenceObservation(BaseModel):
    """One piece of evidence about surface water at the location."""

    source_id: str
    source_name: str
    product: str
    classification: DataClassification
    observed_at: datetime | None = None
    spatial_resolution: str
    method: str
    method_version: str = "1.0"
    # What this observation found, in the source's own terms.
    detected: bool | None = None
    coverage_fraction: float | None = None
    value: float | None = None
    unit: str | None = None
    confidence: str | None = None
    limitations: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class WaterPresenceResult(BaseModel):
    """A combined surface-water presence assessment for a location.

    ``status`` is one of ``water_detected``, ``no_water_detected``,
    ``partial_coverage``, ``insufficient_evidence`` or ``unavailable``. The
    assessment never claims water is absent merely because imagery is missing or
    cloud-affected: missing coverage yields ``insufficient_evidence``.
    """

    location: GeoPoint
    generated_at: datetime
    status: WaterPresenceStatus
    headline: str
    detail: str
    observations: list[WaterPresenceObservation] = Field(default_factory=list)
    providers: list[ProviderReport] = Field(default_factory=list)
    evidence_count: int = 0
    notes: list[str] = Field(default_factory=list)


# --- Nearby water bodies ----------------------------------------------------


class WaterBodySummary(BaseModel):
    """Mapped water features near the location, with real outline geometry.

    This is OpenStreetMap mapping data, not a hydrological survey. Distances are
    straight-line approximations; ``by_kind`` counts features per type.
    """

    location: GeoPoint
    radius_m: int
    count: int
    bodies: list[WaterBody] = Field(default_factory=list)
    provider: ProviderReport
    note: str
    by_kind: dict[str, int] = Field(default_factory=dict)
    nearest_km: float | None = None


# --- Flood evidence ---------------------------------------------------------

FloodStatus = Literal[
    "observed_flood_water",
    "heavy_rainfall_signal",
    "elevated_discharge_signal",
    "no_flood_evidence",
    "insufficient_data",
]


class FloodEvidenceItem(BaseModel):
    """A single flood-related evidence item, with its kind made explicit."""

    key: str
    label: str
    # observed_extent | rainfall_signal | discharge_signal | surface_water_context
    evidence_type: str
    status: str
    value: float | None = None
    unit: str | None = None
    period: str | None = None
    source: str
    classification: DataClassification
    method: str | None = None
    limitations: list[str] = Field(default_factory=list)


class FloodEvidenceResult(BaseModel):
    """Flood-related evidence for a location.

    This is **evidence-based screening**, not a flood forecast or an official
    warning. Observed water extent, rainfall signals and modelled discharge are
    reported as distinct evidence types and are never conflated.
    """

    location: GeoPoint
    generated_at: datetime
    status: FloodStatus
    headline: str
    detail: str
    items: list[FloodEvidenceItem] = Field(default_factory=list)
    providers: list[ProviderReport] = Field(default_factory=list)
    disclaimer: str
    notes: list[str] = Field(default_factory=list)
    # The real GloFAS series behind the discharge signal, so the UI can chart
    # observed/reanalysis and forecast discharge separately and show ensemble
    # spread. Kept distinct from any observed flood extent.
    discharge: "DischargeSeries | None" = None


# --- Imagery change detection ----------------------------------------------


class ChangeScene(BaseModel):
    """A satellite scene usable for a before/after comparison."""

    role: Literal["earlier", "later"]
    scene_id: str
    collection: str
    acquired_at: datetime | None = None
    cloud_cover: float | None = None
    platform: str | None = None
    thumbnail: str | None = None
    bbox: list[float] | None = None
    resolution: str


class ChangeDetectionResult(BaseModel):
    """Before/after satellite scene discovery for a location.

    AquaNexus does **not** download or classify pixels here, so it makes no
    water-surface or vegetation change *measurement*. It presents two real,
    date-separated scenes with their metadata and states the comparability
    conditions that a real change analysis would require.
    """

    location: GeoPoint
    bbox: BoundingBox
    generated_at: datetime
    comparable: bool
    comparability_note: str
    earlier: ChangeScene | None = None
    later: ChangeScene | None = None
    scenes: list[ChangeScene] = Field(default_factory=list)
    indicators: list[str] = Field(default_factory=list)
    providers: list[ProviderReport] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)

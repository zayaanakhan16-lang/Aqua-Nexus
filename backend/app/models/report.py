"""Models for the AquaNexus report generator.

A report is assembled from the *actual* analysis of one study area over one
period. Every section carries its own provenance and an explicit availability
state so an unavailable source is stated rather than omitted or invented.
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.common import DataClassification, GeoPoint, PlaceResult


class ReportMetric(BaseModel):
    """One key metric shown in the report's metric table."""

    key: str
    label: str
    value: float | None = None
    unit: str = ""
    status: str = "ok"
    classification: DataClassification | None = None
    method: str | None = None
    note: str | None = None


class ReportSource(BaseModel):
    """A cited data source with its provenance and limitations."""

    provider_id: str
    provider_name: str
    status: str
    classification: DataClassification | None = None
    product: str | None = None
    url: str | None = None
    attribution: str | None = None
    spatial_resolution: str | None = None
    temporal_resolution: str | None = None
    units: str | None = None
    limitations: list[str] = Field(default_factory=list)
    message: str | None = None


class ReportSection(BaseModel):
    """A narrative section of the report."""

    title: str
    available: bool
    body: str | None = None
    items: list[str] = Field(default_factory=list)
    unavailable_reason: str | None = None


class ReportChartPoint(BaseModel):
    label: str
    value: float | None = None


class ReportChart(BaseModel):
    """A simple, renderable chart for the PDF (no client dependency)."""

    title: str
    unit: str
    points: list[ReportChartPoint] = Field(default_factory=list)
    available: bool = True
    note: str | None = None


class ReportPayload(BaseModel):
    """Everything the PDF renderer needs, already resolved from real analysis."""

    report_id: str
    generated_at: datetime
    study_area_name: str
    location: GeoPoint
    resolved_place: PlaceResult | None = None
    analysis_start: date
    analysis_end: date
    window_days: int
    completeness: str  # "complete" | "partial"
    completeness_note: str
    executive_summary: ReportSection
    observed_conditions: ReportSection
    rainfall_findings: ReportSection
    heat_findings: ReportSection
    flood_findings: ReportSection
    surface_water_findings: ReportSection
    dry_condition_findings: ReportSection
    data_quality: ReportSection
    follow_up: ReportSection
    ai_interpretation: ReportSection
    ai_generated: bool
    metrics: list[ReportMetric] = Field(default_factory=list)
    charts: list[ReportChart] = Field(default_factory=list)
    sources: list[ReportSource] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)


class ReportRequest(BaseModel):
    """A request to generate a report (used by the POST route)."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    name: str | None = Field(default=None, max_length=120)
    label: str | None = Field(default=None, max_length=200)
    window_days: int = Field(default=30, ge=7, le=90)
    include_ai: bool = True

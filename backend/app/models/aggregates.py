"""Aggregate domain models for API responses."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.common import (
    DataClassification,
    GeoPoint,
    PlaceResult,
    ProviderMetadata,
    ProviderReport,
    Provenance,
    TimeSeriesPoint,
)


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    time_utc: datetime


class ReadinessResponse(BaseModel):
    status: str
    providers: list[ProviderReport]


class PlaceSearchResponse(BaseModel):
    query: str | None = None
    count: int
    results: list[PlaceResult] = Field(default_factory=list)
    provider: ProviderReport
    attribution: str | None = None


class PrecipitationSeries(BaseModel):
    """A normalized precipitation time series with provenance."""

    location: GeoPoint
    start_date: date
    end_date: date
    granularity: str  # "daily" | "hourly"
    unit: str = "mm"
    points: list[TimeSeriesPoint]
    provenance: Provenance
    provider: ProviderMetadata
    coverage: str | None = None
    missing_days: int = 0
    total: float | None = None


class PrecipitationComparison(BaseModel):
    """Observed vs. historical baseline for the same calendar window."""

    location: GeoPoint
    observed: PrecipitationSeries
    baseline: PrecipitationSeries
    baseline_years: list[int]
    anomaly_mm: float
    anomaly_percent: float | None
    classification: dict[str, str]
    supported: bool
    notes: list[str] = Field(default_factory=list)


class Indicator(BaseModel):
    """A transparent, evidence-based derived indicator."""

    key: str
    label: str
    value: float | None
    unit: str
    status: str  # "ok" | "insufficient_data" | "unavailable"
    baseline: float | None = None
    method: str
    method_version: str = "1.0"
    inputs: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    classification: DataClassification = DataClassification.DERIVED


class LocationSummary(BaseModel):
    """Everything AquaNexus currently knows about a location."""

    location: GeoPoint
    label: str | None = None
    resolved_place: PlaceResult | None = None
    generated_at: datetime
    providers: list[ProviderReport]
    indicators: list[Indicator]
    notes: list[str] = Field(default_factory=list)

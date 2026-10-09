"""Shared provenance, quality, and unit primitives.

Scientific integrity starts here: every value that reaches a user carries the
metadata needed to interpret it responsibly.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    """Timezone-aware UTC now. All internal timestamps are UTC."""
    return datetime.now(tz=timezone.utc)


class DataClassification(str, Enum):
    """How a value was produced. Displayed to users; never blurred together."""

    OBSERVATION = "observation"          # direct in-situ measurement (gauge)
    SATELLITE_ESTIMATE = "satellite_estimate"  # remotely sensed estimate
    REANALYSIS = "reanalysis"            # model reanalysis (e.g. ERA5)
    FORECAST = "forecast"                # modelled future prediction
    DERIVED = "derived"                  # computed by AquaNexus from the above
    SIMULATION = "simulation"            # scenario / modelled, not measured
    DEMONSTRATION = "demonstration"      # synthetic, for UI only


class ProviderStatus(str, Enum):
    OK = "ok"
    PARTIAL = "partial"                  # responded but with gaps
    UNCONFIGURED = "unconfigured"        # missing credential
    UNAVAILABLE = "unavailable"          # network/outage
    ERROR = "error"


class ProviderMetadata(BaseModel):
    """Identity and quality of a data source."""

    id: str
    name: str
    product: str | None = None
    version: str | None = None
    url: str | None = None
    attribution: str | None = None
    license: str | None = None
    classification: DataClassification
    spatial_resolution: str | None = None
    temporal_resolution: str | None = None
    units: str | None = None
    latency_note: str | None = None
    coverage_note: str | None = None
    limitations: list[str] = Field(default_factory=list)


class Provenance(BaseModel):
    """Per-response provenance envelope."""

    source_id: str
    source_name: str
    classification: DataClassification
    retrieved_at: datetime = Field(default_factory=utcnow)
    observed_at: datetime | None = None
    method: str | None = None
    method_version: str | None = None
    is_fresh: bool = True
    notes: list[str] = Field(default_factory=list)


class ProviderReport(BaseModel):
    """Status of a single provider for a given request."""

    provider_id: str
    provider_name: str
    status: ProviderStatus
    message: str | None = None
    classification: DataClassification | None = None


class TimeSeriesPoint(BaseModel):
    """A single normalized time-series sample."""

    timestamp: datetime
    value: float | None
    unit: str


class GeoPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class BoundingBox(BaseModel):
    """Geographic extent: west, south, east, north in EPSG:4326."""

    west: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    east: float = Field(ge=-180, le=180)
    north: float = Field(ge=-90, le=90)


class PlaceResult(BaseModel):
    """A resolved geographic place."""

    id: str
    name: str
    display_name: str
    latitude: float
    longitude: float
    country: str | None = None
    country_code: str | None = None
    admin1: str | None = None
    timezone: str | None = None
    feature_class: str | None = None
    feature_type: str | None = None
    population: int | None = None
    source_id: str = "open_meteo_geocoding"

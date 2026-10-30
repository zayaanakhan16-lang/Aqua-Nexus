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
    # Upstream products that contributed to this series, as reported by the
    # provider itself (e.g. NASA POWER's ``header.sources``).
    sources: list[str] = Field(default_factory=list)
    # True when the provider flags some or all values as preliminary /
    # near-real-time and therefore subject to revision.
    preliminary: bool = False
    # First date (inclusive) served by a preliminary segment, when known.
    preliminary_from: date | None = None


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


class WeatherCurrent(BaseModel):
    """Latest modelled near-surface conditions for a point."""

    timestamp: datetime
    temperature_c: float | None = None
    apparent_temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    precipitation_mm: float | None = None
    wind_speed_kmh: float | None = None
    weather_code: int | None = None


class WeatherDay(BaseModel):
    """One forecast day of modelled weather."""

    date: date
    temperature_max_c: float | None = None
    temperature_min_c: float | None = None
    precipitation_sum_mm: float | None = None
    wind_speed_max_kmh: float | None = None
    weather_code: int | None = None


class WeatherForecast(BaseModel):
    """Modelled current conditions plus a daily forecast timeline."""

    location: GeoPoint
    current: WeatherCurrent | None = None
    daily: list[WeatherDay] = Field(default_factory=list)
    provenance: Provenance
    provider: ProviderMetadata
    notes: list[str] = Field(default_factory=list)


class DischargePoint(BaseModel):
    """One day of modelled river discharge (GloFAS).

    ``is_forecast`` separates the reanalysis/hindcast portion of the series from
    the forecast portion: the same daily variable name is used for both by the
    provider, so the distinction must travel with each point rather than being
    inferred by the reader.
    """

    timestamp: datetime
    discharge_m3s: float | None = None
    ensemble_mean_m3s: float | None = None
    ensemble_median_m3s: float | None = None
    ensemble_max_m3s: float | None = None
    ensemble_min_m3s: float | None = None
    ensemble_p25_m3s: float | None = None
    ensemble_p75_m3s: float | None = None
    is_forecast: bool = False


class DischargeSeries(BaseModel):
    """Modelled river discharge over a window, past and/or forecast.

    The GloFAS product is a simulation along a modelled river network, not a
    gauge measurement; the classification is always ``simulation``.
    """

    location: GeoPoint
    start_date: date
    end_date: date
    granularity: str = "daily"
    unit: str = "m3/s"
    points: list[DischargePoint] = Field(default_factory=list)
    provenance: Provenance
    provider: ProviderMetadata
    valid_days: int = 0
    missing_days: int = 0
    note: str = ""
    # Provider-resolved grid cell. The API snaps the request to the model grid,
    # so the returned coordinates can differ from the requested point; reporting
    # them is the honest way to say where the value actually came from.
    grid_cell: GeoPoint | None = None
    grid_resolution_km: float = 5.0
    model: str | None = None
    retrieved_at: datetime | None = None
    historical_days: int = 0
    forecast_days: int = 0


class TemperatureSeries(BaseModel):
    """A normalized daily temperature series with provenance.

    Used for heat and dry-condition context. Values are reanalysis estimates
    (ERA5) unless the provider states otherwise; the classification always
    travels with the series so a modelled value is never read as a measurement.
    """

    location: GeoPoint
    start_date: date
    end_date: date
    granularity: str = "daily"
    unit: str = "deg C"
    points: list[TimeSeriesPoint] = Field(default_factory=list)
    provenance: Provenance
    provider: ProviderMetadata
    coverage: str | None = None
    valid_days: int = 0
    missing_days: int = 0
    note: str = ""


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

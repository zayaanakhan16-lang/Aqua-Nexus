"""Models for the future-outlook module.

The outlook reports what the available *forecast* products say about the coming
days. It never presents a forecast as an observation, and it does not difference
a forecast against a reanalysis climatology (that mixing is prohibited — see
docs/SCIENCE.md). Forecast accumulation and historical context are shown side by
side, each labelled with its own classification.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.aggregates import (
    PrecipitationComparison,
    PrecipitationSeries,
    WeatherForecast,
)
from app.models.common import DataClassification, GeoPoint, ProviderReport


class OutlookPeriod(BaseModel):
    """A run of consecutive rainy or dry days in the forecast."""

    kind: Literal["rainy", "dry"]
    start_date: date
    end_date: date
    days: int
    total_mm: float | None = None


class OutlookSignal(BaseModel):
    """A derived outlook signal, always labelled forecast or derived."""

    key: str
    label: str
    value: float | None = None
    unit: str = ""
    status: str = "ok"
    classification: DataClassification = DataClassification.FORECAST
    method: str
    limitations: list[str] = Field(default_factory=list)


class LocationOutlook(BaseModel):
    """Future outlook for a location, built from real forecast products."""

    location: GeoPoint
    generated_at: datetime
    forecast: PrecipitationSeries | None = None
    weather: WeatherForecast | None = None
    comparison: PrecipitationComparison | None = None
    rainy_periods: list[OutlookPeriod] = Field(default_factory=list)
    dry_periods: list[OutlookPeriod] = Field(default_factory=list)
    signals: list[OutlookSignal] = Field(default_factory=list)
    providers: list[ProviderReport] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)

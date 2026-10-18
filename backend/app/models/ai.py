"""AI analysis models.

The AI layer is split in two so it stays honest even when no model is
configured:

* ``AIEvidencePackage`` is always built from real provider responses and is
  returned regardless of the model's availability. It is the traceable factual
  basis a user can verify.
* ``AINarrative`` is the model's *interpretation* of that package. It is
  explicitly separated from measurements and is ``None`` when the model is not
  configured or could not be reached.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.models.common import (
    DataClassification,
    GeoPoint,
    PlaceResult,
    ProviderReport,
    utcnow,
)


class EvidenceObservation(BaseModel):
    """A single grounded value drawn from a real provider response."""

    key: str
    label: str
    value: float | None = None
    unit: str = ""
    status: str = "ok"
    classification: DataClassification | None = None
    period: str | None = None
    source: str
    method: str | None = None


class AIEvidencePackage(BaseModel):
    """The factual basis handed to the model and shown to the user."""

    location: GeoPoint
    label: str | None = None
    resolved_place: PlaceResult | None = None
    generated_at: datetime = Field(default_factory=utcnow)
    observations: list[EvidenceObservation] = Field(default_factory=list)
    providers: list[ProviderReport] = Field(default_factory=list)
    available: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class AINarrative(BaseModel):
    """The model's structured interpretation of the evidence package."""

    situation_summary: str = ""
    observed_conditions: list[str] = Field(default_factory=list)
    recent_changes: list[str] = Field(default_factory=list)
    potential_concerns: list[str] = Field(default_factory=list)
    confidence_and_limitations: list[str] = Field(default_factory=list)
    investigate_next: list[str] = Field(default_factory=list)
    recommended_next_steps: list[str] = Field(default_factory=list)


class AIAnalysisReport(BaseModel):
    """Top-level AI analysis response.

    ``status`` is one of:
    * ``ok``                   — a narrative was produced from the evidence package;
    * ``insufficient_evidence``— the evidence package was too thin to interpret
                                 honestly, so no narrative was requested;
    * ``unconfigured``         — no AI provider credential is configured;
    * ``unavailable``          — the provider failed or returned unusable output.

    The ``evidence`` package is present in every case so the workspace can always
    show the real, traceable data behind the analysis.
    """

    status: Literal["ok", "insufficient_evidence", "unconfigured", "unavailable"]
    provider: str
    model: str | None = None
    evidence: AIEvidencePackage
    narrative: AINarrative | None = None
    message: str | None = None
    # The minimum number of usable observations the deployment requires before it
    # will ask a model to interpret the package.
    min_observations: int | None = None

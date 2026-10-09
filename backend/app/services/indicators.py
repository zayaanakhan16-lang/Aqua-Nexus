"""Derived indicators: freshness, evidence inventory, and a preliminary
rainfall-based water-stress signal.

Every indicator is explicitly labelled DERIVED and carries its method, inputs,
baseline and limitations. Where evidence is insufficient we return an
``insufficient_data`` indicator rather than fabricating a score.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.models.aggregates import Indicator
from app.models.common import DataClassification, TimeSeriesPoint
from app.services.aggregation import PrecipitationAggregate

METHOD_VERSION = "1.0"

# Freshness policy by product family, in hours.
FRESHNESS_HOURS = {
    "forecast": 6,
    "recent_estimate": 72,
    "reanalysis": 24 * 10,
}


def assess_freshness(
    observed_at: datetime | None, *, policy: str = "reanalysis", now: datetime | None = None
) -> Indicator:
    """How current is the most recent observation/forecast sample?"""
    now = now or datetime.now(tz=timezone.utc)
    limit = FRESHNESS_HOURS.get(policy, FRESHNESS_HOURS["reanalysis"])
    if observed_at is None:
        return Indicator(
            key="data_freshness",
            label="Data freshness",
            value=None,
            unit="hours",
            status="unavailable",
            method="Age of the latest sample compared with a product-family policy",
            method_version=METHOD_VERSION,
            limitations=["No timestamp available for the latest sample."],
        )
    age_hours = (now - observed_at).total_seconds() / 3600.0
    # Forecast samples legitimately sit in the future; age is then negative and
    # must be treated as fresh, not stale.
    is_fresh = age_hours <= limit
    return Indicator(
        key="data_freshness",
        label="Data freshness",
        value=round(max(age_hours, 0.0), 1),
        unit="hours",
        status="ok" if is_fresh else "stale",
        baseline=float(limit),
        method=(
            "age_hours = (retrieval_time - latest_sample_time) in hours; "
            f"fresh when age <= {limit}h for '{policy}' products"
        ),
        method_version=METHOD_VERSION,
        inputs=["latest sample timestamp"],
        limitations=["Freshness describes recency, not accuracy."],
    )


def wet_day_fraction(agg: PrecipitationAggregate) -> Indicator:
    """Share of valid days at or above the wet-day threshold."""
    if agg.valid_days == 0:
        return Indicator(
            key="wet_day_fraction",
            label="Wet-day fraction",
            value=None,
            unit="ratio",
            status="insufficient_data",
            method="wet_days / valid_days",
            method_version=METHOD_VERSION,
            limitations=["No valid days in the requested window."],
        )
    value = agg.wet_days / agg.valid_days
    return Indicator(
        key="wet_day_fraction",
        label="Wet-day fraction",
        value=round(value, 3),
        unit="ratio",
        status="ok",
        method="wet_days / valid_days, where wet_days uses a 1.0 mm/day threshold",
        method_version=METHOD_VERSION,
        inputs=[f"{agg.valid_days} valid days"],
        limitations=["Threshold-sensitive; not a drought index."],
    )


def precipitation_deficit_indicator(
    anomaly_mm: float | None,
    anomaly_percent: float | None,
    *,
    sufficient_evidence: bool,
    baseline_description: str,
) -> Indicator:
    """A preliminary rainfall deficit/excess signal.

    Deliberately NOT called water stress: rainfall is only one input among many
    that would be required to assess water scarcity.
    """
    if not sufficient_evidence or anomaly_mm is None:
        return Indicator(
            key="rainfall_anomaly",
            label="Rainfall anomaly",
            value=None,
            unit="%",
            status="insufficient_data",
            method="(observed_total - baseline_total) / baseline_total * 100",
            method_version=METHOD_VERSION,
            limitations=[
                "Insufficient or incompatible evidence to compute a rainfall anomaly.",
            ],
        )
    return Indicator(
        key="rainfall_anomaly",
        label="Rainfall anomaly",
        value=round(anomaly_percent, 1) if anomaly_percent is not None else None,
        unit="%",
        baseline=None,
        status="ok",
        method=(
            "anomaly_percent = (observed_total - baseline_total) / baseline_total * 100; "
            f"baseline: {baseline_description}"
        ),
        method_version=METHOD_VERSION,
        inputs=["observed precipitation total", "baseline precipitation total"],
        classification=DataClassification.DERIVED,
        limitations=[
            "Rainfall alone does not establish water scarcity or flooding.",
            "Sensitive to the chosen baseline period and dataset.",
        ],
    )


def data_classification_indicator(classification: DataClassification | None) -> Indicator:
    """Surface what kind of data is backing the current view."""
    if classification is None:
        return Indicator(
            key="data_classification",
            label="Data classification",
            value=None,
            unit="category",
            status="unavailable",
            method="Provenance classification of the primary series",
            method_version=METHOD_VERSION,
            limitations=["No primary series available for this location."],
        )
    return Indicator(
        key="data_classification",
        label="Data classification",
        value=None,
        unit="category",
        status=classification.value,
        method="Reported directly from the provider provenance envelope",
        method_version=METHOD_VERSION,
        limitations=["Classification describes origin, not accuracy."],
    )


def coverage_indicator(agg: PrecipitationAggregate | None) -> Indicator:
    if agg is None or agg.total_days == 0:
        return Indicator(
            key="coverage",
            label="Data coverage",
            value=None,
            unit="%",
            status="unavailable",
            method="valid_days / total_days",
            method_version=METHOD_VERSION,
        )
    return Indicator(
        key="coverage",
        label="Data coverage",
        value=round(agg.coverage_ratio * 100, 1),
        unit="%",
        status="ok" if agg.has_sufficient_coverage else "insufficient_data",
        baseline=80.0,
        method="coverage = valid (non-null) days / requested days; 80% required for window claims",
        method_version=METHOD_VERSION,
        inputs=[f"{agg.valid_days}/{agg.total_days} days"],
        limitations=["Coverage measures presence of values, not their quality."],
    )


def flood_discharge_indicator(payload: dict | None) -> Indicator:
    """Ratio of the latest modelled discharge to the recent modelled mean.

    This is a transparent, preliminary comparable, not a flood forecast.
    """
    if not payload:
        return Indicator(
            key="river_discharge_ratio",
            label="River discharge vs. recent mean",
            value=None,
            unit="ratio",
            status="unavailable",
            method="latest river_discharge / mean river_discharge_mean over the window",
            method_version=METHOD_VERSION,
            limitations=["Modelled GloFAS discharge unavailable for this location."],
        )
    daily = payload.get("daily") or {}
    discharge = daily.get("river_discharge") or []
    mean = daily.get("river_discharge_mean") or []
    pairs = [(d, m) for d, m in zip(discharge, mean) if d is not None and m]
    if not pairs:
        return Indicator(
            key="river_discharge_ratio",
            label="River discharge vs. recent mean",
            value=None,
            unit="ratio",
            status="insufficient_data",
            method="latest river_discharge / mean river_discharge_mean over the window",
            method_version=METHOD_VERSION,
            limitations=["No comparable discharge values in the response."],
        )
    latest, latest_mean = pairs[0]
    ratio = latest / latest_mean if latest_mean else None
    return Indicator(
        key="river_discharge_ratio",
        label="River discharge vs. recent mean",
        value=round(ratio, 2) if ratio is not None else None,
        unit="ratio",
        status="ok" if ratio is not None else "insufficient_data",
        baseline=1.0,
        method=(
            "ratio = forecast river_discharge / river_discharge_mean (modelled). "
            "Ratio > 1 indicates modelled discharge above the recent modelled mean."
        ),
        method_version=METHOD_VERSION,
        inputs=["GloFAS modelled discharge"],
        classification=DataClassification.DERIVED,
        limitations=[
            "Modelled discharge, not a gauge observation.",
            "A single ratio does not imply a flood; local conditions and "
            "thresholds matter.",
        ],
    )

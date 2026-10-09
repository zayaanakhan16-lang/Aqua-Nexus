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
    observed_at: datetime | None,
    *,
    policy: str = "reanalysis",
    now: datetime | None = None,
    key: str | None = None,
    label: str | None = None,
) -> Indicator:
    """How current is the most recent observation/forecast sample?

    ``key`` and ``label`` distinguish observed/reanalysis freshness from forecast
    freshness so the two can never be conflated in a summary.

    Forecast samples legitimately sit in the future. Their freshness is measured
    against the *start* of the forecast window, not the far end: reporting a
    forecast as "fresh" merely because its last date is in the future would be a
    false positive.
    """
    now = now or datetime.now(tz=timezone.utc)
    limit = FRESHNESS_HOURS.get(policy, FRESHNESS_HOURS["reanalysis"])
    key = key or "data_freshness"
    label = label or "Data freshness"
    if observed_at is None:
        return Indicator(
            key=key,
            label=label,
            value=None,
            unit="hours",
            status="unavailable",
            method="Age of the latest sample compared with a product-family policy",
            method_version=METHOD_VERSION,
            limitations=["No timestamp available for the latest sample."],
        )
    age_hours = (now - observed_at).total_seconds() / 3600.0
    # Forecasts are dated in the future. We anchor them to the beginning of the
    # forecast horizon so a stale initialisation cannot masquerade as fresh.
    is_fresh = age_hours <= limit
    return Indicator(
        key=key,
        label=label,
        value=round(max(age_hours, 0.0), 1),
        unit="hours",
        status="ok" if is_fresh else "stale",
        baseline=float(limit),
        method=(
            "age_hours = (now - latest_sample_time) in hours; "
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

    When the baseline total is zero the percentage is undefined, so the indicator
    falls back to the absolute difference in millimetres rather than reporting a
    misleading percentage or "near normal".
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
    if anomaly_percent is None:
        # Zero baseline: percentage undefined, absolute difference is the story.
        return Indicator(
            key="rainfall_anomaly",
            label="Rainfall change (absolute)",
            value=round(anomaly_mm, 1),
            unit="mm",
            status="ok",
            baseline=None,
            method=(
                "anomaly_mm = observed_total - baseline_total; percentage undefined "
                f"because the baseline total is zero. baseline: {baseline_description}"
            ),
            method_version=METHOD_VERSION,
            inputs=["observed precipitation total", "baseline precipitation total"],
            classification=DataClassification.DERIVED,
            limitations=[
                "Baseline total is zero, so percentage change is undefined.",
                "Rainfall alone does not establish water scarcity or flooding.",
            ],
        )
    return Indicator(
        key="rainfall_anomaly",
        label="Rainfall anomaly",
        value=round(anomaly_percent, 1),
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
            "Year-over-year comparison, not a long-term climate normal.",
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
    """Modelled river discharge relative to its own day's ensemble mean.

    Semantics (verified against the Open-Meteo Flood API documentation)
    ----------------------------------------------------------------
    The Flood API returns the GloFAS *deterministic* ``river_discharge`` plus
    ensemble statistics (``river_discharge_mean`` / ``median`` / percentiles).
    Those statistics are "statistical analysis from ensemble members ... only
    available for forecasts and not for consolidated historical data" — i.e. the
    mean is the ensemble mean **for the same forecast day**, not a "recent mean"
    of past observations.

    This indicator therefore reports the deterministic forecast value relative to
    its own day's ensemble mean, which is a spread/agreement measure. It is not a
    flood forecast and not a comparison against a historical baseline.
    """
    label = "River discharge vs. ensemble mean (modelled)"
    method = (
        "ratio = river_discharge / river_discharge_mean for the same forecast day, "
        "where river_discharge_mean is the GloFAS forecast ensemble mean (modelled). "
        "Ratio > 1 means the deterministic run exceeds the ensemble mean."
    )
    limitations = [
        "Modelled GloFAS discharge, not a gauge observation.",
        "The ensemble mean is a same-day forecast statistic, not a historical normal.",
        "A single ratio does not imply a flood; local thresholds and conditions matter.",
        "GloFAS selects the largest river within ~5 km; try offsetting coordinates.",
    ]
    if not payload:
        return Indicator(
            key="river_discharge_ratio",
            label=label,
            value=None,
            unit="ratio",
            status="unavailable",
            method=method,
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
            label=label,
            value=None,
            unit="ratio",
            status="insufficient_data",
            method=method,
            method_version=METHOD_VERSION,
            limitations=["No comparable discharge values in the response."],
        )
    latest, ensemble_mean = pairs[0]
    ratio = latest / ensemble_mean if ensemble_mean else None
    return Indicator(
        key="river_discharge_ratio",
        label=label,
        value=round(ratio, 2) if ratio is not None else None,
        unit="ratio",
        status="ok" if ratio is not None else "insufficient_data",
        baseline=1.0,
        method=method,
        method_version=METHOD_VERSION,
        inputs=["GloFAS modelled discharge", "GloFAS forecast ensemble mean"],
        classification=DataClassification.DERIVED,
        limitations=limitations,
    )

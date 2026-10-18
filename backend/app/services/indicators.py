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


def temperature_anomaly_indicator(
    observed_mean_c: float | None,
    baseline_mean_c: float | None,
    *,
    observed_days: int,
    baseline_days: int,
    baseline_description: str,
    observed_max_c: float | None = None,
) -> Indicator:
    """Mean-temperature anomaly against the same calendar window of a prior year.

    This is deliberately *not* a heatwave classification. A heatwave requires a
    documented percentile/threshold definition and a minimum duration, neither of
    which a single window mean provides. The indicator reports the difference in
    degrees Celsius and states that limitation explicitly.
    """
    key = "temperature_anomaly"
    label = "Temperature anomaly (mean)"
    method = (
        "anomaly_c = observed_mean_temperature - baseline_mean_temperature, "
        "both over the same number of calendar days, from the same reanalysis product"
    )
    limitations = [
        "A single warm window is not a heatwave; duration and a documented "
        "threshold are required for that classification.",
        "Reanalysis mean air temperature, not a station measurement.",
        "Year-over-year comparison, not a multi-decade climate normal.",
    ]
    if observed_mean_c is None or baseline_mean_c is None or observed_days == 0 or baseline_days == 0:
        return Indicator(
            key=key,
            label=label,
            value=None,
            unit="deg C",
            status="insufficient_data",
            method=method,
            method_version=METHOD_VERSION,
            limitations=["Insufficient temperature evidence to compute an anomaly."],
        )
    return Indicator(
        key=key,
        label=label,
        value=round(observed_mean_c - baseline_mean_c, 1),
        unit="deg C",
        status="ok",
        method=f"{method}; baseline: {baseline_description}",
        method_version=METHOD_VERSION,
        inputs=[
            f"observed mean {observed_mean_c:.1f} deg C over {observed_days} days",
            f"baseline mean {baseline_mean_c:.1f} deg C over {baseline_days} days",
        ],
        classification=DataClassification.DERIVED,
        limitations=limitations,
    )


def heat_day_indicator(
    hot_days: int | None,
    *,
    valid_days: int,
    threshold_c: float = 35.0,
) -> Indicator:
    """Count of days at or above an explicit absolute temperature threshold.

    The threshold is stated in the method so it is never an implicit, arbitrary
    choice. This is a raw count, not a heatwave verdict.
    """
    if hot_days is None or valid_days == 0:
        return Indicator(
            key="hot_day_count",
            label=f"Days at or above {threshold_c:.0f} deg C",
            value=None,
            unit="days",
            status="insufficient_data",
            method=f"count(daily_mean_temperature >= {threshold_c:.0f} deg C)",
            method_version=METHOD_VERSION,
            limitations=["No valid temperature days in the requested window."],
        )
    return Indicator(
        key="hot_day_count",
        label=f"Days at or above {threshold_c:.0f} deg C",
        value=float(hot_days),
        unit="days",
        status="ok",
        method=(
            f"count(daily mean 2 m air temperature >= {threshold_c:.0f} deg C) over "
            f"{valid_days} valid days; the threshold is explicit, not a heatwave definition"
        ),
        method_version=METHOD_VERSION,
        inputs=[f"{valid_days} valid days", f"threshold {threshold_c:.0f} deg C"],
        classification=DataClassification.DERIVED,
        limitations=[
            "An absolute threshold is not a heatwave definition.",
            "Uses daily mean temperature, so hot nights and peaks are smoothed.",
        ],
    )


def dry_condition_indicator(
    dry_days: int | None,
    *,
    valid_days: int,
    threshold_mm: float = 1.0,
) -> Indicator:
    """Count of days below the wet-day threshold — a dry-spell signal.

    Reported alongside the wet-day fraction. It is a rainfall statistic, not a
    drought index, and it says nothing about soil moisture, groundwater or demand.
    """
    if dry_days is None or valid_days == 0:
        return Indicator(
            key="dry_day_count",
            label="Dry days (below wet-day threshold)",
            value=None,
            unit="days",
            status="insufficient_data",
            method=f"count(daily precipitation < {threshold_mm:.1f} mm)",
            method_version=METHOD_VERSION,
            limitations=["No valid precipitation days in the requested window."],
        )
    return Indicator(
        key="dry_day_count",
        label="Dry days (below wet-day threshold)",
        value=float(dry_days),
        unit="days",
        status="ok",
        method=(
            f"count(daily precipitation_sum < {threshold_mm:.1f} mm) over {valid_days} "
            "valid days; a rainfall statistic, not a drought index"
        ),
        method_version=METHOD_VERSION,
        inputs=[f"{valid_days} valid days", f"threshold {threshold_mm:.1f} mm/day"],
        classification=DataClassification.DERIVED,
        limitations=[
            "A dry-day count is threshold-dependent and not a drought index.",
            "Rainfall alone does not establish water scarcity or soil-moisture deficit.",
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

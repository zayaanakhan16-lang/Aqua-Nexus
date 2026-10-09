"""Rainfall anomaly, deficit and excess indicators.

Formula
-------
Given observed total ``O`` and baseline total ``B`` (same calendar window,
same units, same or compatible aggregation):
    anomaly_mm      = O - B
    anomaly_percent = (O - B) / B * 100   (None when B <= 0)

Deficit / excess classification is *percentage-band based and explicitly
labelled as a preliminary AquaNexus indicator*, not a water-scarcity verdict:

    anomaly_percent <= -50   -> "severely_below"
    -50 < anomaly_percent <= -20 -> "below"
    -20 < anomaly_percent <  20  -> "near_normal"
     20 <= anomaly_percent < 50  -> "above"
    anomaly_percent >= 50    -> "well_above"

Baseline
--------
The baseline total must come from a dataset marked compatible with the observed
series (see ``compatible_baselines``). An observational series must never be
differenced against a dataset whose definition is incompatible.

Limitations
-----------
* Rainfall deficit alone does not prove water scarcity.
* Rainfall excess alone does not prove that a flood occurred.
* Sparse or missing days degrade both totals; callers must check coverage.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models.common import DataClassification
from app.services.aggregation import METHOD_VERSION, PrecipitationAggregate

# Which classification may serve as a baseline for a given observed series.
# Observed reanalysis may be compared with reanalysis or climate simulation;
# a forecast is never compared to a historical baseline as if it "occurred".
_COMPATIBLE_BASELINES: dict[DataClassification, set[DataClassification]] = {
    DataClassification.OBSERVATION: {DataClassification.OBSERVATION, DataClassification.REANALYSIS},
    DataClassification.REANALYSIS: {DataClassification.REANALYSIS, DataClassification.SIMULATION},
    DataClassification.SATELLITE_ESTIMATE: {
        DataClassification.SATELLITE_ESTIMATE,
        DataClassification.REANALYSIS,
    },
    DataClassification.FORECAST: set(),  # forecasts are not anomalies vs. climatology
}


def compatible_baselines(observed: DataClassification) -> set[DataClassification]:
    return set(_COMPATIBLE_BASELINES.get(observed, set()))


def is_compatible(observed: DataClassification, baseline: DataClassification) -> bool:
    return baseline in compatible_baselines(observed)


@dataclass
class AnomalyResult:
    anomaly_mm: float
    anomaly_percent: float | None
    band: str
    band_label: str
    method: str = "observed_total - baseline_total"
    method_version: str = METHOD_VERSION
    notes: list[str] = None  # type: ignore[assignment]


# A named band is only meaningful when a percentage can be computed. When the
# baseline total is zero the percentage is undefined, so we report an explicit
# "undefined_baseline" band rather than reusing the near-normal band by default.
UNDEFINED_BAND = "undefined_baseline"
UNDEFINED_BAND_LABEL = (
    "Percentage change is undefined because the comparison baseline total is "
    "zero; only the absolute difference is meaningful."
)


def classify_band(anomaly_percent: float) -> tuple[str, str]:
    """Map an anomaly percentage to a named band and human explanation.

    Bands:
        pct >=  50          well_above
        20 <= pct < 50      above
       -20 <  pct < 20      near_normal
       -50 <  pct <= -20     below
        pct <= -50          severely_below
    """
    if anomaly_percent >= 50.0:
        return "well_above", "Precipitation well above the comparison baseline."
    if anomaly_percent >= 20.0:
        return "above", "Precipitation above the comparison baseline."
    if anomaly_percent > -20.0:
        return "near_normal", "Precipitation broadly near the comparison baseline."
    if anomaly_percent > -50.0:
        return "below", "Precipitation below the comparison baseline."
    return "severely_below", "Precipitation well below the comparison baseline."


def compute_anomaly(
    observed: PrecipitationAggregate,
    baseline: PrecipitationAggregate,
    *,
    observed_classification: DataClassification,
    baseline_classification: DataClassification,
) -> AnomalyResult:
    """Compute a rainfall anomaly, or raise if the comparison is unsupported."""
    notes: list[str] = []

    if observed.unit != baseline.unit:
        raise ValueError(
            f"Incompatible units: observed '{observed.unit}' vs baseline '{baseline.unit}'."
        )
    if not is_compatible(observed_classification, baseline_classification):
        raise ValueError(
            f"Incompatible datasets: cannot compare {observed_classification.value} "
            f"against {baseline_classification.value}."
        )
    if observed.valid_days == 0 or baseline.valid_days == 0:
        raise ValueError("Insufficient data: one side of the comparison has no valid days.")

    if not observed.has_sufficient_coverage:
        raise ValueError(
            f"Observed coverage too low ({observed.coverage_ratio:.0%}); "
            "anomaly would be unreliable."
        )
    if not baseline.has_sufficient_coverage:
        raise ValueError(
            f"Baseline coverage too low ({baseline.coverage_ratio:.0%}); "
            "anomaly would be unreliable."
        )

    anomaly_mm = observed.total_mm - baseline.total_mm
    if baseline.total_mm > 0:
        anomaly_percent: float | None = (anomaly_mm / baseline.total_mm) * 100.0
        band, band_label = classify_band(anomaly_percent)
    else:
        # Zero baseline: the ratio is undefined and must NOT be classified as
        # near normal. Report the absolute difference and an explicit band.
        anomaly_percent = None
        band, band_label = UNDEFINED_BAND, UNDEFINED_BAND_LABEL
        notes.append(UNDEFINED_BAND_LABEL)

    notes.append(
        "Deficit and excess bands are preliminary AquaNexus indicators. "
        "They describe rainfall relative to a comparison baseline, not water scarcity."
    )
    return AnomalyResult(
        anomaly_mm=anomaly_mm,
        anomaly_percent=anomaly_percent,
        band=band,
        band_label=band_label,
        notes=notes,
    )

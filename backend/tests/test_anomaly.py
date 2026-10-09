"""Unit tests for rainfall anomaly, deficit, and excess calculations."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.common import DataClassification, TimeSeriesPoint
from app.services.aggregation import aggregate_precipitation
from app.services.anomaly import compute_anomaly, is_compatible


def _agg(values, unit="mm"):
    base = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
    points = [
        TimeSeriesPoint(timestamp=base + timedelta(days=i), value=v, unit=unit)
        for i, v in enumerate(values)
    ]
    return aggregate_precipitation(points)


def test_normal_anomaly_below_baseline():
    observed = _agg([1.0] * 10)          # 10 mm
    baseline = _agg([2.0] * 10)          # 20 mm
    result = compute_anomaly(
        observed,
        baseline,
        observed_classification=DataClassification.REANALYSIS,
        baseline_classification=DataClassification.REANALYSIS,
    )
    assert result.anomaly_mm == pytest.approx(-10.0)
    assert result.anomaly_percent == pytest.approx(-50.0)
    assert result.band == "severely_below"


def test_band_boundaries():
    baseline = _agg([10.0] * 10)  # 100 mm

    def band_for(observed_total):
        obs = _agg([observed_total / 10.0] * 10)
        return compute_anomaly(
            obs,
            baseline,
            observed_classification=DataClassification.REANALYSIS,
            baseline_classification=DataClassification.REANALYSIS,
        ).band

    assert band_for(50.0) == "severely_below"    # -50%
    assert band_for(75.0) == "below"             # -25%
    assert band_for(95.0) == "near_normal"       # -5%
    assert band_for(130.0) == "above"            # +30%
    assert band_for(160.0) == "well_above"       # +60%


def test_zero_baseline_yields_undefined_percent():
    observed = _agg([1.0] * 10)
    baseline = _agg([0.0] * 10)
    result = compute_anomaly(
        observed,
        baseline,
        observed_classification=DataClassification.REANALYSIS,
        baseline_classification=DataClassification.REANALYSIS,
    )
    assert result.anomaly_mm == pytest.approx(10.0)
    assert result.anomaly_percent is None
    assert any("undefined" in note for note in result.notes)


def test_incompatible_datasets_rejected():
    observed = _agg([1.0] * 10)
    baseline = _agg([2.0] * 10)
    with pytest.raises(ValueError, match="Incompatible datasets"):
        compute_anomaly(
            observed,
            baseline,
            observed_classification=DataClassification.FORECAST,
            baseline_classification=DataClassification.REANALYSIS,
        )
    assert is_compatible(DataClassification.FORECAST, DataClassification.REANALYSIS) is False


def test_incompatible_units_rejected():
    observed = _agg([1.0] * 10, unit="mm")
    baseline = _agg([2.0] * 10, unit="in")
    with pytest.raises(ValueError, match="Incompatible units"):
        compute_anomaly(
            observed,
            baseline,
            observed_classification=DataClassification.REANALYSIS,
            baseline_classification=DataClassification.REANALYSIS,
        )


def test_insufficient_coverage_rejected():
    observed = _agg([1.0, None, None, None, None])  # 20% coverage
    baseline = _agg([2.0] * 5)
    with pytest.raises(ValueError, match="coverage too low"):
        compute_anomaly(
            observed,
            baseline,
            observed_classification=DataClassification.REANALYSIS,
            baseline_classification=DataClassification.REANALYSIS,
        )


def test_empty_side_rejected():
    observed = _agg([None, None])
    baseline = _agg([2.0, 2.0])
    with pytest.raises(ValueError):
        compute_anomaly(
            observed,
            baseline,
            observed_classification=DataClassification.REANALYSIS,
            baseline_classification=DataClassification.REANALYSIS,
        )

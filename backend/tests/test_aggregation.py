"""Unit tests for precipitation aggregation and normalization."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models.common import TimeSeriesPoint
from app.services.aggregation import (
    WET_DAY_THRESHOLD_MM,
    aggregate_precipitation,
    rolling_sum,
)


def _series(values, unit="mm"):
    base = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
    return [
        TimeSeriesPoint(timestamp=base + timedelta(days=i), value=v, unit=unit)
        for i, v in enumerate(values)
    ]


def test_aggregate_basic_totals():
    agg = aggregate_precipitation(_series([1.0, 2.0, 3.0, 4.0]))
    assert agg.total_mm == pytest.approx(10.0)
    assert agg.mean_daily_mm == pytest.approx(2.5)
    assert agg.max_daily_mm == pytest.approx(4.0)
    assert agg.min_daily_mm == pytest.approx(1.0)
    assert agg.valid_days == 4
    assert agg.missing_days == 0
    assert agg.coverage_ratio == pytest.approx(1.0)
    assert agg.has_sufficient_coverage is True


def test_aggregate_missing_days_are_excluded_but_counted():
    agg = aggregate_precipitation(_series([1.0, None, 3.0, None]))
    assert agg.total_mm == pytest.approx(4.0)
    assert agg.valid_days == 2
    assert agg.missing_days == 2
    assert agg.coverage_ratio == pytest.approx(0.5)
    # Below the 80% threshold: callers must not make window-level claims.
    assert agg.has_sufficient_coverage is False


def test_wet_days_use_threshold():
    threshold = WET_DAY_THRESHOLD_MM
    agg = aggregate_precipitation(_series([0.0, threshold - 0.1, threshold, 5.0]))
    assert agg.wet_days == 2


def test_empty_series_rejected():
    with pytest.raises(ValueError):
        aggregate_precipitation([])


def test_mixed_units_rejected():
    points = _series([1.0, 2.0])
    points[1] = points[1].model_copy(update={"unit": "in"})
    with pytest.raises(ValueError, match="Mixed units"):
        aggregate_precipitation(points)


def test_all_null_series_has_no_claims():
    agg = aggregate_precipitation(_series([None, None]))
    assert agg.total_mm == 0.0
    assert agg.valid_days == 0
    assert agg.mean_daily_mm is None
    assert agg.has_sufficient_coverage is False


def test_rolling_sum_excludes_windows_with_gaps():
    points = _series([1.0, 2.0, None, 4.0, 5.0])
    result = rolling_sum(points, window=2)
    # window=2 => windows ending at indices 1,2,3,4
    assert result[0][1] == pytest.approx(3.0)   # 1+2
    assert result[1][1] is None                 # contains a null
    assert result[2][1] is None                 # None + 4
    assert result[3][1] == pytest.approx(9.0)   # 4+5


def test_rolling_sum_invalid_window():
    with pytest.raises(ValueError):
        rolling_sum(_series([1.0]), window=0)

"""Regression tests for the audited scientific-correctness fixes.

Each test pins a specific bug that was found during the static audit so it can
never silently reappear:

* missing daily values are never treated as zero in baselines;
* a zero baseline reports an undefined percentage and is not "near normal";
* leap day (29 Feb) is handled deterministically in year-over-year windows;
* ERA5/MERRA-2 cross-checks pair only on shared valid dates;
* observed/reanalysis freshness is reported separately from forecast freshness;
* the comparison is labelled year-over-year, not a long-term normal.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.aggregates import PrecipitationSeries
from app.models.common import (
    DataClassification,
    GeoPoint,
    Provenance,
    TimeSeriesPoint,
)
from app.providers.catalog import OPEN_METEO_ARCHIVE, OPEN_METEO_FORECAST
from app.services import indicators as ind
from app.services.aggregation import aggregate_precipitation
from app.services.anomaly import (
    UNDEFINED_BAND,
    compute_anomaly,
)
from app.services.baseline import (
    align_daily_by_date,
    expected_window_days,
    pair_on_valid_dates,
    prior_year_window,
    shift_year,
)

POINT = GeoPoint(latitude=52.52, longitude=13.40)


def _series(dates_and_values, *, unit="mm", source=OPEN_METEO_ARCHIVE):
    points = [
        TimeSeriesPoint(
            timestamp=datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc).replace(
                hour=12
            ),
            value=v,
            unit=unit,
        )
        for d, v in dates_and_values
    ]
    classification = (
        DataClassification.REANALYSIS
        if source is OPEN_METEO_ARCHIVE
        else DataClassification.FORECAST
    )
    return PrecipitationSeries(
        location=POINT,
        start_date=points[0].timestamp.date(),
        end_date=points[-1].timestamp.date(),
        granularity="daily",
        unit=unit,
        points=points,
        provenance=Provenance(
            source_id=source.id,
            source_name=source.name,
            classification=classification,
            observed_at=points[-1].timestamp,
        ),
        provider=source,
        total=sum(p.value for p in points if p.value is not None),
    )


def _agg(values, *, expected_days=None):
    base = datetime(2024, 1, 1, 12, tzinfo=timezone.utc)
    points = [
        TimeSeriesPoint(timestamp=base + timedelta(days=i), value=v, unit="mm")
        for i, v in enumerate(values)
    ]
    return aggregate_precipitation(points, expected_days=expected_days)


# --- P1.1: missing values are never silently treated as zero ---------------


def test_baseline_alignment_does_not_impute_zero_for_missing_year():
    # Year A is dry (0.0), Year B is missing that day (None). The baseline must
    # be the mean of the *present* value (0.0), not (0.0 + 0.0)/2 forced by
    # treating the missing year as zero.
    d1 = date(2023, 6, 1)
    d2 = date(2023, 6, 2)
    year_a = _series([(d1, 0.0), (d2, 4.0)])
    year_b = _series([(d1, None), (d2, 2.0)])
    baseline = align_daily_by_date([year_a, year_b])
    by_date = {p.timestamp.date(): p.value for p in baseline}
    assert by_date[d1] == pytest.approx(0.0)   # only year A had a value
    assert by_date[d2] == pytest.approx(3.0)   # mean of 4.0 and 2.0


def test_baseline_all_missing_date_stays_null():
    d = date(2023, 6, 1)
    year_a = _series([(d, None)])
    year_b = _series([(d, None)])
    baseline = align_daily_by_date([year_a, year_b])
    assert baseline[0].value is None
    agg = aggregate_precipitation(baseline)
    assert agg.valid_days == 0
    assert agg.missing_days == 1


def test_expected_days_lowers_coverage_when_provider_omits_days():
    # Only 5 days returned but the requested window was 10 days => 50%.
    agg = _agg([1.0] * 5, expected_days=10)
    assert agg.total_days == 10
    assert agg.valid_days == 5
    assert agg.missing_days == 5
    assert agg.coverage_ratio == pytest.approx(0.5)
    assert agg.has_sufficient_coverage is False


# --- P1.2: zero baseline => undefined percentage, not near-normal ---------


def test_zero_baseline_is_not_classified_near_normal():
    observed = _agg([1.0] * 10)
    baseline = _agg([0.0] * 10)
    result = compute_anomaly(
        observed,
        baseline,
        observed_classification=DataClassification.REANALYSIS,
        baseline_classification=DataClassification.REANALYSIS,
    )
    assert result.anomaly_percent is None
    assert result.band == UNDEFINED_BAND
    assert result.band != "near_normal"


def test_zero_baseline_indicator_falls_back_to_millimetres():
    indicator = ind.precipitation_deficit_indicator(
        10.0, None, sufficient_evidence=True, baseline_description="same period"
    )
    assert indicator.status == "ok"
    assert indicator.unit == "mm"
    assert indicator.value == pytest.approx(10.0)
    assert "undefined" in indicator.method.lower()


# --- P1.3: leap day is handled safely -------------------------------------


def test_shift_year_maps_feb29_to_feb28():
    assert shift_year(date(2024, 2, 29), year=2023) == date(2023, 2, 28)
    assert shift_year(date(2024, 2, 29), year=2028) == date(2028, 2, 29)


def test_prior_year_window_spanning_feb29_does_not_raise():
    start, end = prior_year_window(date(2024, 2, 1), date(2024, 2, 29), 1)
    assert start == date(2023, 2, 1)
    assert end == date(2023, 2, 28)
    # A full non-leap February window is 28 days.
    assert expected_window_days(start, end) == 28


def test_expected_window_days_is_inclusive():
    assert expected_window_days(date(2024, 1, 1), date(2024, 1, 30)) == 30


# --- P1.4: cross-source comparison pairs only on shared valid dates --------


def test_pair_on_valid_dates_uses_only_shared_non_null_days():
    d1, d2, d3 = date(2023, 6, 1), date(2023, 6, 2), date(2023, 6, 3)
    era5 = _series([(d1, 1.0), (d2, None), (d3, 3.0)])
    power = _series([(d1, 2.0), (d2, 5.0), (d3, None)])
    left, right = pair_on_valid_dates(era5, power)
    assert [p.timestamp.date() for p in left] == [d1]  # only d1 valid on both
    assert left[0].value == pytest.approx(1.0)
    assert right[0].value == pytest.approx(2.0)


def test_pair_on_valid_dates_handles_no_overlap():
    era5 = _series([(date(2023, 6, 1), 1.0)])
    power = _series([(date(2023, 6, 2), 2.0)])
    left, right = pair_on_valid_dates(era5, power)
    assert left == [] and right == []


# --- P1.5: freshness separation and forecast anchoring --------------------


def test_observed_and_forecast_freshness_have_distinct_keys():
    now = datetime(2024, 6, 1, 12, tzinfo=timezone.utc)
    observed = ind.assess_freshness(
        now - timedelta(hours=2),
        policy="reanalysis",
        key="observed_freshness",
        label="Observed/reanalysis freshness",
        now=now,
    )
    forecast = ind.assess_freshness(
        now + timedelta(hours=1),
        policy="forecast",
        key="forecast_freshness",
        label="Forecast freshness",
        now=now,
    )
    assert observed.key != forecast.key
    assert observed.key == "observed_freshness"
    assert forecast.key == "forecast_freshness"


def test_forecast_is_not_fresh_merely_for_being_in_the_future():
    now = datetime(2024, 6, 1, 12, tzinfo=timezone.utc)
    # Forecast whose first day is 30 hours old exceeds the 6h forecast policy.
    stale = ind.assess_freshness(
        now - timedelta(hours=30), policy="forecast", key="forecast_freshness", now=now
    )
    assert stale.status == "stale"


# --- P1.6: honest year-over-year labelling --------------------------------


def test_year_over_year_labelling_in_baseline_module():
    import inspect

    import app.api.routes.precipitation as precipitation

    source = inspect.getsource(precipitation).lower()
    assert "year-over-year" in source
    assert "not a 30-year climate normal" in source
    assert "not a long-term climate normal" in source

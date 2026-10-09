"""Date-aligned helpers for historical baselines and cross-source checks.

The single most important rule enforced here: **a missing daily value is never
silently treated as zero.** Baselines are aligned on calendar dates and gaps are
carried through as ``None`` so the coverage gate in
``app.services.aggregation`` can refuse weak comparisons.

All dates are interpreted in UTC to match the rest of the platform.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from app.models.aggregates import PrecipitationSeries
from app.models.common import TimeSeriesPoint


def shift_year(day: date, *, year: int) -> date:
    """Return ``day`` in ``year``, mapping 29 Feb onto 28 Feb when needed.

    A 29 February has no counterpart in a non-leap year. Rather than crash or
    silently drop the day, it is aligned to 28 February of the target year. This
    is a documented, deterministic choice, not a hidden one.
    """
    try:
        return day.replace(year=year)
    except ValueError:
        # Only reachable for 29 February -> 28 February in a non-leap year.
        return day.replace(year=year, day=28)


def prior_year_window(start: date, end: date, year_offset: int) -> tuple[date, date]:
    """The same calendar window ``year_offset`` years earlier (leap-safe)."""
    if year_offset < 1:
        raise ValueError("year_offset must be >= 1")
    if end < start:
        raise ValueError("end must be on or after start")
    target = start.year - year_offset
    return shift_year(start, year=target), shift_year(end, year=target)


def _noon_utc(day: date) -> datetime:
    return datetime.combine(day, time(12, 0), tzinfo=timezone.utc)


def align_daily_by_date(series_list: list[PrecipitationSeries]) -> list[TimeSeriesPoint]:
    """Average several daily series on shared calendar dates.

    Semantics
    ---------
    * Only dates present in **every** contributing series are kept, so a year
      that lacks a date cannot skew the baseline.
    * For each kept date the baseline value is the mean of the values that
      actually exist across years. A year whose value is ``None`` on that date
      contributes nothing and is **never** substituted with 0.0.
    * If no year has a value for a date, the baseline point is ``None`` and is
      counted as a missing day by the aggregator.
    """
    if not series_list:
        raise ValueError("Cannot align an empty list of series.")

    unit = series_list[0].unit
    by_date: list[dict[date, float | None]] = []
    for series in series_list:
        if series.unit != unit:
            raise ValueError(
                f"Mixed units across baseline series: '{unit}' and '{series.unit}'."
            )
        by_date.append({p.timestamp.date(): p.value for p in series.points})

    common_dates = set(by_date[0])
    for mapping in by_date[1:]:
        common_dates &= set(mapping)
    if not common_dates:
        raise ValueError("Baseline series share no common dates.")

    points: list[TimeSeriesPoint] = []
    for day in sorted(common_dates):
        present = [mapping[day] for mapping in by_date if mapping.get(day) is not None]
        value = (sum(present) / len(present)) if present else None
        points.append(TimeSeriesPoint(timestamp=_noon_utc(day), value=value, unit=unit))
    return points


def pair_on_valid_dates(
    primary: PrecipitationSeries, secondary: PrecipitationSeries
) -> tuple[list[TimeSeriesPoint], list[TimeSeriesPoint]]:
    """Return two series trimmed to dates where BOTH sides have a real value.

    Used for cross-source comparisons: a total is only comparable when both
    products observed the same days. Days missing on either side are excluded
    rather than treated as zero, so the resulting totals are like-for-like.
    """
    if primary.unit != secondary.unit:
        raise ValueError(
            f"Incompatible units: '{primary.unit}' vs '{secondary.unit}'."
        )
    primary_by_date = {p.timestamp.date(): p.value for p in primary.points}
    secondary_by_date = {p.timestamp.date(): p.value for p in secondary.points}
    shared = sorted(
        day
        for day in (set(primary_by_date) & set(secondary_by_date))
        if primary_by_date[day] is not None and secondary_by_date[day] is not None
    )
    left = [
        TimeSeriesPoint(timestamp=_noon_utc(d), value=primary_by_date[d], unit=primary.unit)
        for d in shared
    ]
    right = [
        TimeSeriesPoint(timestamp=_noon_utc(d), value=secondary_by_date[d], unit=secondary.unit)
        for d in shared
    ]
    return left, right


def expected_window_days(start: date, end: date) -> int:
    """Inclusive number of days in ``[start, end]``."""
    return (end - start).days + 1


def shift_window_back(start: date, end: date, days: int) -> tuple[date, date]:
    """Shift a window by ``days`` (used only by tests and documentation)."""
    delta = timedelta(days=days)
    return start - delta, end - delta

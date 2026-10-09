"""Precipitation aggregation and normalization (unit-safe, null-aware).

Formula
-------
``sum``        = Σ value_i over the window, ignoring nulls (missing days).
``mean_daily`` = sum / count of non-null days.
``max_daily``  = max value_i.
``wet_days``   = count(value_i >= WET_DAY_THRESHOLD_MM).

Inputs
------
A list of daily ``TimeSeriesPoint`` in millimetres. Nulls represent missing
days and are excluded from sums and means but counted in ``missing_days``.

Limitations
-----------
Aggregation cannot exceed the evidence: fewer non-null days means less
confidence. Callers must inspect ``coverage_ratio`` before drawing conclusions.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.models.common import TimeSeriesPoint

# A day counts as "wet" at or above 1 mm, a common hydrometeorological threshold.
WET_DAY_THRESHOLD_MM = 1.0

METHOD_VERSION = "1.0"


@dataclass
class PrecipitationAggregate:
    unit: str
    total_mm: float
    mean_daily_mm: float | None
    max_daily_mm: float | None
    min_daily_mm: float | None
    wet_days: int
    valid_days: int
    missing_days: int
    total_days: int
    coverage_ratio: float
    values: list[float] = field(default_factory=list)

    @property
    def has_sufficient_coverage(self) -> bool:
        """Require at least 80% non-null days for a window-level claim."""
        return self.coverage_ratio >= 0.8 and self.valid_days > 0


def aggregate_precipitation(points: list[TimeSeriesPoint]) -> PrecipitationAggregate:
    """Aggregate normalized daily precipitation points."""
    if not points:
        raise ValueError("Cannot aggregate an empty precipitation series.")

    unit = points[0].unit
    valid: list[float] = []
    missing = 0
    for point in points:
        if point.value is None:
            missing += 1
            continue
        if unit != point.unit:
            raise ValueError(
                f"Mixed units in series: '{unit}' and '{point.unit}'."
            )
        valid.append(float(point.value))

    total_days = len(points)
    valid_days = len(valid)
    total = sum(valid)
    return PrecipitationAggregate(
        unit=unit,
        total_mm=total,
        mean_daily_mm=(total / valid_days) if valid_days else None,
        max_daily_mm=max(valid) if valid else None,
        min_daily_mm=min(valid) if valid else None,
        wet_days=sum(1 for v in valid if v >= WET_DAY_THRESHOLD_MM),
        valid_days=valid_days,
        missing_days=missing,
        total_days=total_days,
        coverage_ratio=(valid_days / total_days) if total_days else 0.0,
        values=valid,
    )


def rolling_sum(points: list[TimeSeriesPoint], window: int) -> list[tuple[str, float | None]]:
    """Trailing rolling sum over ``window`` samples.

    Returns ``(iso_date, value_mm | None)`` pairs. A window with any missing day
    yields ``None`` for that position rather than an underestimated sum.
    """
    if window < 1:
        raise ValueError("window must be >= 1")
    out: list[tuple[str, float | None]] = []
    for index in range(len(points)):
        if index + 1 < window:
            continue
        chunk = points[index + 1 - window : index + 1]
        if any(p.value is None for p in chunk):
            out.append((points[index].timestamp.date().isoformat(), None))
            continue
        out.append(
            (points[index].timestamp.date().isoformat(), sum(p.value for p in chunk))  # type: ignore[misc]
        )
    return out

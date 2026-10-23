"""Regression tests for report/PDF value formatting.

A wet-day fraction is stored as a 0–1 ratio but must read as a percentage in
generated output, while genuine ratios (e.g. ``river_discharge_ratio``, where
1.0 means normal flow) must stay as ratios. The underlying value is never
changed — only its rendering.
"""
from __future__ import annotations

from app.services.report_builder import _fmt
from app.services.report_pdf import _fmt_value


def test_wet_day_fraction_renders_as_percentage():
    # 0.633 is stored; it must read as 63.3%, not "0.63 ratio".
    assert _fmt(0.633, "ratio", "wet_day_fraction") == "63.3%"
    assert _fmt_value(0.633, "ratio", "wet_day_fraction") == "63.3%"


def test_discharge_ratio_is_not_converted_to_percentage():
    # 1.0 means normal flow — 100% would be wrong.
    assert _fmt(1.0, "ratio", "river_discharge_ratio") == "1.00"
    assert _fmt_value(1.0, "ratio", "river_discharge_ratio") == "1.00"


def test_percentage_and_other_units_are_unchanged():
    assert _fmt(-10.5, "%", "rainfall_anomaly") == "-10.5%"
    assert _fmt(140.5, "mm", "rainfall_total") == "140.5 mm"
    assert _fmt_value(140.5, "mm", "rainfall_total") == "140.5 mm"


def test_unavailable_value_is_reported_honestly():
    assert _fmt(None, "ratio", "wet_day_fraction") == "unavailable"
    assert _fmt_value(None, "%", "cross_check_delta") == "unavailable"

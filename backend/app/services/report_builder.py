"""Report payload assembly.

Builds a :class:`ReportPayload` from the *actual* analysis for one location and
period: the location summary indicators, the precipitation comparison, the
weather forecast, modelled discharge, the satellite scene catalogue and — when
configured — the evidence-grounded AI interpretation.

Design rules:

* Nothing is invented. A section whose evidence is missing is marked
  ``available=False`` with an explicit reason.
* The report is labelled ``partial`` when a required source is missing, so a
  download is never presented as a complete, verified report when it is not.
* AI interpretation is included only when it was genuinely generated from the
  evidence package (``status == "ok"``); otherwise the section states that the
  narrative was not generated and the verified indicators stand on their own.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from app.models.aggregates import Indicator, LocationSummary
from app.models.common import DataClassification, GeoPoint, PlaceResult
from app.models.report import (
    ReportChart,
    ReportChartPoint,
    ReportMetric,
    ReportPayload,
    ReportSection,
    ReportSource,
)
from app.providers.catalog import provider_by_id
from app.services.aggregation import aggregate_precipitation

# Indicator keys that belong to each report section.
_RAINFALL_KEYS = {"rainfall_anomaly", "wet_day_fraction", "forecast_7d_total"}
_HEAT_KEYS = {"temperature_anomaly", "hot_day_count"}
_DRY_KEYS = {"dry_day_count", "coverage"}
_FLOOD_KEYS = {"river_discharge_ratio"}


def _fmt(value: float | None, unit: str) -> str:
    if value is None:
        return "unavailable"
    if unit == "%":
        return f"{value:.1f}%"
    if unit == "ratio":
        return f"{value:.2f}"
    if unit == "deg C":
        return f"{value:.1f} deg C"
    if unit == "mm":
        return f"{value:.1f} mm"
    if unit == "m3/s":
        return f"{value:.1f} m3/s"
    return f"{value:g} {unit}".strip()


def _metric_from_indicator(indicator: Indicator) -> ReportMetric:
    return ReportMetric(
        key=indicator.key,
        label=indicator.label,
        value=indicator.value,
        unit=indicator.unit,
        status=indicator.status,
        classification=indicator.classification,
        method=indicator.method,
        note=indicator.limitations[0] if indicator.limitations else None,
    )


def _section_from_indicators(
    title: str,
    keys: set[str],
    indicators: list[Indicator],
    *,
    available_note: str,
    unavailable_reason: str,
) -> ReportSection:
    """Build a section from the indicators that are present and usable."""
    chosen = [i for i in indicators if i.key in keys]
    usable = [i for i in chosen if i.status == "ok" and i.value is not None]
    if not chosen:
        return ReportSection(title=title, available=False, unavailable_reason=unavailable_reason)
    items = [f"{i.label}: {_fmt(i.value, i.unit)}" for i in usable]
    if not items:
        # The indicators exist but none could be computed — state it honestly.
        reason = next(
            (i.limitations[0] for i in chosen if i.limitations),
            "Evidence was insufficient to compute this section.",
        )
        return ReportSection(title=title, available=False, unavailable_reason=reason)
    return ReportSection(title=title, available=True, body=available_note, items=items)


def _chart_from_series(title: str, unit: str, points: list, note: str | None = None) -> ReportChart:
    chart_points = [
        ReportChartPoint(
            label=p.timestamp.date().isoformat(),
            value=p.value,
        )
        for p in points
    ]
    return ReportChart(
        title=title,
        unit=unit,
        points=chart_points,
        available=bool(chart_points),
        note=note,
    )


async def build_report_payload(
    point: GeoPoint,
    *,
    name: str | None = None,
    label: str | None = None,
    resolved_place: PlaceResult | None = None,
    window_days: int = 30,
    include_ai: bool = True,
    summary: LocationSummary | None = None,
    comparison=None,
    forecast=None,
    weather=None,
    discharge=None,
    scenes=None,
    ai_report=None,
) -> ReportPayload:
    """Assemble the report payload from already-fetched analysis where supplied.

    Callers may pass pre-fetched analysis objects (the route does, so the report
    reflects exactly what the workspace shows); otherwise the summary is built
    here.
    """
    if summary is None:
        from app.services.summary import build_location_summary

        summary = await build_location_summary(
            point, label=label, resolved_place=resolved_place, window_days=window_days
        )

    generated_at = datetime.now(tz=timezone.utc)
    indicators = summary.indicators
    by_key = {i.key: i for i in indicators}

    # --- Analysis period: the observed window the summary used -------------
    today = generated_at.date()
    observed_end = today - timedelta(days=5)
    observed_start = observed_end - timedelta(days=max(7, window_days) - 1)

    # --- Key metrics ------------------------------------------------------
    metrics: list[ReportMetric] = []
    for key in (
        "rainfall_anomaly",
        "wet_day_fraction",
        "dry_day_count",
        "coverage",
        "temperature_anomaly",
        "hot_day_count",
        "forecast_7d_total",
        "river_discharge_ratio",
        "cross_check_delta",
    ):
        indicator = by_key.get(key)
        if indicator is not None:
            metrics.append(_metric_from_indicator(indicator))

    # --- Executive summary ------------------------------------------------
    ok_count = sum(1 for p in summary.providers if p.status.value == "ok")
    total_count = len(summary.providers)
    place_name = (resolved_place.name if resolved_place else None) or label or name or "selected location"
    exec_items: list[str] = [
        f"Study area: {name or place_name} at {point.latitude:.4f}, {point.longitude:.4f}.",
        f"Analysis period: {observed_start.isoformat()} to {observed_end.isoformat()} "
        f"({window_days} days requested).",
        f"{ok_count} of {total_count} data sources returned usable data for this period.",
    ]
    rainfall = by_key.get("rainfall_anomaly")
    if rainfall is not None and rainfall.status == "ok" and rainfall.value is not None:
        exec_items.append(
            f"Rainfall anomaly against the same period last year: "
            f"{_fmt(rainfall.value, rainfall.unit)}."
        )
    else:
        exec_items.append(
            "A rainfall anomaly could not be computed for this period (insufficient "
            "or incompatible evidence)."
        )
    exec_section = ReportSection(
        title="Executive summary",
        available=True,
        body=(
            "This report summarises the environmental evidence AquaNexus retrieved for the "
            "study area and period above. All values are traceable to the sources listed "
            "in this report; interpretations are labelled as such."
        ),
        items=exec_items,
    )

    # --- Thematic sections ------------------------------------------------
    observed_conditions = ReportSection(
        title="Observed environmental conditions",
        available=bool(summary.providers),
        body=(
            "Conditions are described from the sources that returned data for this "
            "period. Reanalysis and satellite estimates are not gauge measurements."
        ),
        items=[
            f"{p.provider_name}: {p.status.value}"
            + (f" — {p.message}" if p.message else "")
            for p in summary.providers
        ],
        unavailable_reason=None if summary.providers else "No provider reports were available.",
    )

    rainfall_findings = _section_from_indicators(
        "Rainfall",
        _RAINFALL_KEYS,
        indicators,
        available_note=(
            "Rainfall figures are reanalysis/forecast estimates for the grid cell "
            "containing the study point. The anomaly is a year-over-year comparison."
        ),
        unavailable_reason="No rainfall indicators were available for this period.",
    )

    heat_findings = _section_from_indicators(
        "Heat",
        _HEAT_KEYS,
        indicators,
        available_note=(
            "Temperature is ERA5 reanalysis. The anomaly is a mean difference against "
            "the same period last year; it is not a heatwave classification."
        ),
        unavailable_reason="No temperature evidence was available for this period.",
    )

    dry_findings = _section_from_indicators(
        "Dry conditions and water-stress signals",
        _DRY_KEYS,
        indicators,
        available_note=(
            "Dry-day counts and the wet-day fraction are threshold-dependent rainfall "
            "statistics. They are not a drought index, and rainfall alone cannot "
            "establish water scarcity."
        ),
        unavailable_reason="No dry-condition evidence was available for this period.",
    )

    # --- Flood: distinguish observation, modelled discharge, rainfall signal
    flood_items: list[str] = []
    discharge_indicator = by_key.get("river_discharge_ratio")
    if discharge_indicator is not None and discharge_indicator.status == "ok":
        flood_items.append(
            "Modelled river discharge vs. its same-day ensemble mean: "
            f"{_fmt(discharge_indicator.value, discharge_indicator.unit)} "
            "(GloFAS simulation, not a gauge reading)."
        )
    if discharge is not None and getattr(discharge, "points", None):
        valid = [p.discharge_m3s for p in discharge.points if p.discharge_m3s is not None]
        if valid:
            flood_items.append(
                f"Modelled discharge range over {discharge.start_date} to "
                f"{discharge.end_date}: {min(valid):.1f} to {max(valid):.1f} m3/s."
            )
    if forecast is not None and getattr(forecast, "total", None) is not None:
        flood_items.append(
            f"7-day forecast precipitation total: {forecast.total:.1f} mm "
            "(a rainfall-based flood-potential signal, not a flood forecast)."
        )
    flood_section = ReportSection(
        title="Potential flood indicators",
        available=bool(flood_items),
        body=(
            "AquaNexus does not operate a validated flood forecast. This section "
            "reports modelled discharge and rainfall-based flood potential, and "
            "distinguishes them from observed flooding."
        )
        if flood_items
        else None,
        items=flood_items,
        unavailable_reason=(
            None
            if flood_items
            else "No modelled discharge or rainfall-based flood signal was available."
        ),
    )

    # --- Surface water (satellite catalogue) ------------------------------
    if scenes is not None and getattr(scenes, "items", None) is not None:
        items = [
            f"{item.id}"
            + (f" — {item.acquired_at.date().isoformat()}" if item.acquired_at else "")
            + (
                f" — {item.cloud_cover:.0f}% cloud"
                if item.cloud_cover is not None
                else ""
            )
            for item in scenes.items[:12]
        ]
        surface_section = ReportSection(
            title="Surface water (satellite scene catalogue)",
            available=bool(items),
            body=(
                "Sentinel-2 scene metadata is listed for the study area. These are "
                "catalogue records, not processed imagery; water-body classification "
                "and change detection are not performed in this build."
            )
            if items
            else None,
            items=items,
            unavailable_reason=None if items else "No Sentinel-2 scenes matched this area and period.",
        )
    else:
        surface_section = ReportSection(
            title="Surface water (satellite scene catalogue)",
            available=False,
            unavailable_reason="The satellite catalogue was not reachable for this report.",
        )

    # --- Data quality -----------------------------------------------------
    coverage = by_key.get("coverage")
    quality_items = [
        f"{ok_count} of {total_count} sources returned usable data.",
    ]
    if coverage is not None:
        quality_items.append(f"Data coverage: {_fmt(coverage.value, coverage.unit)}.")
    quality_items.append(
        "Missing data is reported as unavailable and is never substituted with a value."
    )
    data_quality = ReportSection(
        title="Data quality, coverage and confidence",
        available=True,
        body=(
            "Confidence is bounded by the coverage and the classification of each "
            "source. Reanalysis, forecast, satellite estimate and simulation values "
            "are not interchangeable with direct measurements."
        ),
        items=quality_items,
    )

    # --- Follow-up --------------------------------------------------------
    follow_up = ReportSection(
        title="Recommended follow-up",
        available=True,
        items=[
            "Confirm rainfall against a national or regional gauge network where available.",
            "Compare the anomaly against a longer climate normal before drawing trend conclusions.",
            "Inspect Sentinel-2 imagery for the listed scenes where surface-water change matters.",
            "Consult local authorities for flood and water-supply conditions; AquaNexus is not an official warning service.",
        ],
    )

    # --- AI interpretation ------------------------------------------------
    ai_generated = bool(ai_report is not None and ai_report.status == "ok" and ai_report.narrative)
    if ai_generated:
        narrative = ai_report.narrative
        ai_items: list[str] = []
        if narrative.situation_summary:
            ai_items.append(narrative.situation_summary)
        ai_items.extend(narrative.observed_conditions)
        ai_items.extend(narrative.potential_concerns)
        ai_items.extend(narrative.confidence_and_limitations)
        ai_items.extend(narrative.investigate_next)
        ai_items.extend(narrative.recommended_next_steps)
        ai_section = ReportSection(
            title="AI-assisted interpretation (model-generated)",
            available=True,
            body=(
                f"Generated by {ai_report.provider}"
                + (f" ({ai_report.model})" if ai_report.model else "")
                + " from the evidence package above. This is interpretation, not a "
                "measurement and not an official warning."
            ),
            items=ai_items,
        )
    elif ai_report is not None and ai_report.status == "insufficient_evidence":
        ai_section = ReportSection(
            title="AI-assisted interpretation",
            available=False,
            unavailable_reason=(
                ai_report.message
                or "The evidence package was too thin to interpret; no narrative was generated."
            ),
        )
    elif ai_report is not None and ai_report.status == "unconfigured":
        ai_section = ReportSection(
            title="AI-assisted interpretation",
            available=False,
            unavailable_reason=(
                "No AI provider is configured for this deployment, so no narrative was "
                "generated. The verified indicators above stand on their own."
            ),
        )
    elif ai_report is not None:
        ai_section = ReportSection(
            title="AI-assisted interpretation",
            available=False,
            unavailable_reason=ai_report.message or "The AI provider did not return a usable narrative.",
        )
    else:
        ai_section = ReportSection(
            title="AI-assisted interpretation",
            available=False,
            unavailable_reason="AI interpretation was not requested for this report.",
        )

    # --- Charts -----------------------------------------------------------
    charts: list[ReportChart] = []
    if comparison is not None and getattr(comparison, "observed", None) is not None:
        charts.append(
            _chart_from_series(
                "Observed daily precipitation (reanalysis)",
                comparison.observed.unit,
                comparison.observed.points,
                note="ERA5 reanalysis daily totals for the analysis period.",
            )
        )
        charts.append(
            _chart_from_series(
                "Baseline daily precipitation (same period, prior year)",
                comparison.baseline.unit,
                comparison.baseline.points,
                note="Year-over-year baseline, same reanalysis product.",
            )
        )
    if discharge is not None and getattr(discharge, "points", None):
        charts.append(
            ReportChart(
                title="Modelled river discharge (GloFAS)",
                unit="m3/s",
                points=[
                    ReportChartPoint(
                        label=p.timestamp.date().isoformat(),
                        value=p.discharge_m3s,
                    )
                    for p in discharge.points
                ],
                available=True,
                note="Modelled discharge, not a gauge measurement.",
            )
        )

    # --- Sources and citations -------------------------------------------
    sources: list[ReportSource] = []
    citations: list[str] = []
    seen: set[str] = set()
    for report in summary.providers:
        if report.provider_id in seen:
            continue
        seen.add(report.provider_id)
        meta = provider_by_id(report.provider_id)
        sources.append(
            ReportSource(
                provider_id=report.provider_id,
                provider_name=report.provider_name,
                status=report.status.value,
                classification=report.classification,
                product=meta.product if meta else None,
                url=meta.url if meta else None,
                attribution=meta.attribution if meta else None,
                spatial_resolution=meta.spatial_resolution if meta else None,
                temporal_resolution=meta.temporal_resolution if meta else None,
                units=meta.units if meta else None,
                limitations=list(meta.limitations) if meta else [],
                message=report.message,
            )
        )
        if meta and meta.url:
            citations.append(f"{meta.name} — {meta.url}")
    if scenes is not None:
        meta = provider_by_id("cdse_stac")
        if meta and meta.url:
            citations.append(f"{meta.name} — {meta.url}")

    # --- Limitations ------------------------------------------------------
    limitations = list(summary.notes) + [
        "Rainfall deficit alone does not prove water scarcity; heavy rainfall alone "
        "does not prove that a flood occurred.",
        "Anomalies are year-over-year comparisons against the same calendar window, "
        "not multi-decade climate normals.",
        "Reanalysis, satellite estimate, forecast and simulation values are modelled "
        "products, not direct measurements.",
        "AquaNexus does not assess groundwater, reservoir storage, demand or infrastructure.",
    ]

    # --- Completeness -----------------------------------------------------
    # Three honest tiers, driven by what actually returned:
    #   complete — every required source returned usable data;
    #   partial  — the required historical rainfall returned, but at least one
    #              other source is missing, so some sections are unavailable;
    #   minimal  — the required historical rainfall itself is missing, so the
    #              report rests on little evidence and says so.
    archive_ok = any(
        p.provider_id == "open_meteo_archive" and p.status.value in {"ok", "partial"}
        for p in summary.providers
    )
    all_ok = bool(summary.providers) and all(p.status.value == "ok" for p in summary.providers)

    if not archive_ok:
        completeness = "minimal"
        completeness_note = (
            "Reported as MINIMAL: the required historical precipitation source did not "
            "return usable data for this period. Only the sections with real evidence are "
            "shown; the rest are marked unavailable. This is not a complete assessment."
        )
    elif all_ok:
        completeness = "complete"
        completeness_note = (
            "Reported as COMPLETE evidence: every source AquaNexus queries returned "
            "usable data for this period. It remains an environmental evidence summary, "
            "not a hydrological assessment, and no official warning is implied."
        )
    else:
        completeness = "partial"
        completeness_note = (
            "Reported as PARTIAL: the required historical precipitation returned, but at "
            "least one other source is unavailable, so some sections are marked "
            "unavailable. No official warning is implied."
        )

    return ReportPayload(
        report_id=f"AQN-{generated_at.strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}",
        generated_at=generated_at,
        study_area_name=name or place_name,
        location=point,
        resolved_place=resolved_place,
        analysis_start=observed_start,
        analysis_end=observed_end,
        window_days=window_days,
        completeness=completeness,
        completeness_note=completeness_note,
        executive_summary=exec_section,
        observed_conditions=observed_conditions,
        rainfall_findings=rainfall_findings,
        heat_findings=heat_findings,
        flood_findings=flood_section,
        surface_water_findings=surface_section,
        dry_condition_findings=dry_findings,
        data_quality=data_quality,
        follow_up=follow_up,
        ai_interpretation=ai_section,
        ai_generated=ai_generated,
        metrics=metrics,
        charts=charts,
        sources=sources,
        limitations=limitations,
        citations=citations,
    )

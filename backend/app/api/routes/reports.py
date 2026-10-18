"""Report generation routes.

``GET /reports/preview`` returns the structured payload the PDF is built from,
so the UI can show exactly what a report will contain before downloading.
``POST /reports`` renders and returns the branded AquaNexus PDF.

Both routes assemble the report from the *actual* analysis for the requested
location and period. When a source is unavailable the report says so; the
endpoint does not fail because one optional provider is down.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query, Response
from fastapi.responses import StreamingResponse

from app.errors import ValidationError
from app.models.aggregates import PrecipitationComparison
from app.models.common import BoundingBox, GeoPoint
from app.models.report import ReportPayload, ReportRequest
from app.providers import open_meteo
from app.providers.stac import search_scenes
from app.services.aggregation import aggregate_precipitation
from app.services.ai_analysis import analyze_location
from app.services.anomaly import compute_anomaly
from app.services.baseline import expected_window_days
from app.services.report_builder import build_report_payload
from app.services.report_pdf import render_report_pdf
from app.services.summary import build_location_summary

router = APIRouter(tags=["reports"])

MAX_WINDOW_DAYS = 90


async def _collect_analysis(point: GeoPoint, *, window_days: int, include_ai: bool) -> dict:
    """Fetch the analysis objects a report is assembled from.

    Every optional provider is fetched defensively: a failure yields ``None`` for
    that piece rather than failing the whole report. The report then states which
    sections are unavailable, so one down provider cannot break the download.
    """
    summary = await build_location_summary(point, window_days=window_days)

    today = datetime.now(tz=timezone.utc).date()
    end = today - timedelta(days=5)
    start = end - timedelta(days=max(7, window_days) - 1)

    comparison = None
    try:
        observed = await open_meteo.fetch_archive_precipitation(point, start=start, end=end)
        baseline_start = start.replace(year=start.year - 1)
        baseline_end = end.replace(year=end.year - 1)
        baseline = await open_meteo.fetch_archive_precipitation(
            point, start=baseline_start, end=baseline_end
        )
        observed_agg = aggregate_precipitation(
            observed.points, expected_days=expected_window_days(start, end)
        )
        baseline_agg = aggregate_precipitation(baseline.points)
        anomaly = compute_anomaly(
            observed_agg,
            baseline_agg,
            observed_classification=observed.provenance.classification,
            baseline_classification=baseline.provenance.classification,
        )
        comparison = PrecipitationComparison(
            location=point,
            observed=observed,
            baseline=baseline,
            baseline_years=[baseline_start.year],
            anomaly_mm=round(anomaly.anomaly_mm, 2),
            anomaly_percent=(
                round(anomaly.anomaly_percent, 1)
                if anomaly.anomaly_percent is not None
                else None
            ),
            classification={"band": anomaly.band, "label": anomaly.band_label},
            supported=True,
            notes=list(anomaly.notes),
        )
    except Exception:  # noqa: BLE001 - optional evidence for the report
        comparison = None

    forecast = None
    try:
        forecast = await open_meteo.fetch_forecast_precipitation(point, days=7)
    except Exception:  # noqa: BLE001
        forecast = None

    discharge = None
    try:
        discharge = await open_meteo.fetch_discharge_series(point, days=14)
    except Exception:  # noqa: BLE001
        discharge = None

    scenes = None
    try:
        radius = 0.25
        bbox = BoundingBox(
            west=max(-180.0, point.longitude - radius),
            south=max(-90.0, point.latitude - radius),
            east=min(180.0, point.longitude + radius),
            north=min(90.0, point.latitude + radius),
        )
        now = datetime.now(tz=timezone.utc)
        scenes = await search_scenes(
            bbox, start=now - timedelta(days=window_days), end=now, limit=12
        )
    except Exception:  # noqa: BLE001
        scenes = None

    ai_report = None
    if include_ai:
        try:
            ai_report = await analyze_location(point, window_days=window_days)
        except Exception:  # noqa: BLE001
            ai_report = None

    return {
        "summary": summary,
        "comparison": comparison,
        "forecast": forecast,
        "discharge": discharge,
        "scenes": scenes,
        "ai_report": ai_report,
    }


@router.get(
    "/reports/preview",
    response_model=ReportPayload,
    summary="Structured report payload (what the PDF will contain)",
)
async def report_preview(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    name: str | None = Query(None, max_length=120),
    window_days: int = Query(30, ge=7, le=MAX_WINDOW_DAYS),
    include_ai: bool = Query(True),
) -> ReportPayload:
    point = GeoPoint(latitude=latitude, longitude=longitude)
    analysis = await _collect_analysis(point, window_days=window_days, include_ai=include_ai)
    return await build_report_payload(
        point,
        name=name,
        window_days=window_days,
        include_ai=include_ai,
        **analysis,
    )


@router.post(
    "/reports",
    summary="Generate the branded AquaNexus PDF report",
    response_class=Response,
)
async def generate_report(payload: ReportRequest) -> StreamingResponse:
    if payload.window_days > MAX_WINDOW_DAYS:
        raise ValidationError(f"window_days must be <= {MAX_WINDOW_DAYS}.")
    point = GeoPoint(latitude=payload.latitude, longitude=payload.longitude)
    analysis = await _collect_analysis(
        point, window_days=payload.window_days, include_ai=payload.include_ai
    )
    report = await build_report_payload(
        point,
        name=payload.name,
        label=payload.label,
        window_days=payload.window_days,
        include_ai=payload.include_ai,
        **analysis,
    )
    pdf_bytes = render_report_pdf(report)
    filename = f"AquaNexus-{report.report_id}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Report-Id": report.report_id,
            "X-Report-Completeness": report.completeness,
        },
    )

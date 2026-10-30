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
from app.providers.water_bodies import find_water_bodies
from app.services.change_detection import detect_change
from app.services.flood_evidence import assess_flood_evidence
from app.services.outlook import build_outlook
from app.services.report_builder import build_report_payload
from app.services.report_images import collect_report_images
from app.services.report_pdf import render_report_pdf
from app.services.summary import build_location_summary
from app.services.water_presence import assess_water_presence

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

    # --- Local water-intelligence modules (each independently defensive) ---
    water_presence = None
    try:
        water_presence = await assess_water_presence(point)
    except Exception:  # noqa: BLE001
        water_presence = None

    water_bodies = None
    try:
        water_bodies = await find_water_bodies(point, radius_m=15_000, limit=15)
    except Exception:  # noqa: BLE001
        water_bodies = None

    flood_evidence = None
    try:
        flood_evidence = await assess_flood_evidence(point)
    except Exception:  # noqa: BLE001
        flood_evidence = None

    change_detection = None
    try:
        change_detection = await detect_change(point, search_days=180)
    except Exception:  # noqa: BLE001
        change_detection = None

    outlook = None
    try:
        outlook = await build_outlook(point)
    except Exception:  # noqa: BLE001
        outlook = None

    return {
        "summary": summary,
        "comparison": comparison,
        "forecast": forecast,
        "discharge": discharge,
        "scenes": scenes,
        "ai_report": ai_report,
        "water_presence": water_presence,
        "water_bodies": water_bodies,
        "flood_evidence": flood_evidence,
        "change_detection": change_detection,
        "outlook": outlook,
    }


def _image_candidates(scenes, change_detection) -> list[dict]:
    """Build report-image candidates from real catalogue previews.

    Sentinel-2 scene previews are used (they carry a provider-rendered thumbnail);
    the change-detection earlier/later scenes are preferred so the report shows
    the comparison the analysis is built on.
    """
    candidates: list[dict] = []
    seen: set[str] = set()

    def add(role: str, scene) -> None:
        url = getattr(scene, "thumbnail", None)
        if not url or url in seen:
            return
        seen.add(url)
        acquired = getattr(scene, "acquired_at", None)
        candidates.append(
            {
                "url": url,
                "title": f"Sentinel-2 {role} preview",
                "collection": getattr(scene, "collection", "") or "",
                "captured_at": acquired.date().isoformat() if acquired else None,
                "resolution": "native 10 m (Sentinel-2 L2A)",
                "note": (
                    "Provider-rendered catalogue preview. Not an AquaNexus "
                    "surface-water classification."
                ),
            }
        )

    if change_detection is not None:
        if change_detection.earlier is not None:
            add("earlier", change_detection.earlier)
        if change_detection.later is not None:
            add("later", change_detection.later)
    if scenes is not None and getattr(scenes, "items", None):
        for item in scenes.items:
            add("scene", item)
            if len(candidates) >= 4:
                break
    return candidates


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
    images, _blobs = await collect_report_images(
        _image_candidates(analysis.get("scenes"), analysis.get("change_detection"))
    )
    return await build_report_payload(
        point,
        name=name,
        window_days=window_days,
        include_ai=include_ai,
        images=images,
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
    images, image_blobs = await collect_report_images(
        _image_candidates(analysis.get("scenes"), analysis.get("change_detection"))
    )
    report = await build_report_payload(
        point,
        name=payload.name,
        label=payload.label,
        window_days=payload.window_days,
        include_ai=payload.include_ai,
        images=images,
        **analysis,
    )
    pdf_bytes = render_report_pdf(report, image_blobs=image_blobs)
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

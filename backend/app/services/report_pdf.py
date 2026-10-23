"""AquaNexus branded PDF report renderer.

Renders a :class:`ReportPayload` into a professional PDF using ReportLab. The
layout is deliberately restrained and scientific: a fixed brand header, a metric
table, vector charts drawn from the real series, per-section availability states
and a source/limitations appendix. Page numbers and a footer appear on every
page.

The renderer draws only what the payload contains. A section marked
``available=False`` is printed with its explicit reason rather than omitted, so
the document never implies evidence it does not have.
"""
from __future__ import annotations

import io
from datetime import datetime

from reportlab.graphics.shapes import Drawing, Line, PolyLine, String
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from app.models.report import ReportChart, ReportPayload, ReportSection, ReportSource

# --- Brand palette (restrained, scientific) -------------------------------
INK = colors.HexColor("#0d1b2a")
INK_SOFT = colors.HexColor("#40536b")
WATER = colors.HexColor("#12a3c9")
WATER_DEEP = colors.HexColor("#0b6f8c")
ACCENT = colors.HexColor("#0f766e")
RULE = colors.HexColor("#d5dde6")
BAND = colors.HexColor("#eef4f8")
MUTED = colors.HexColor("#8a99ab")
ALERT = colors.HexColor("#b45309")
CAUTION = colors.HexColor("#a16207")
GOOD = colors.HexColor("#15803d")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "AQTitle", parent=base["Title"], fontName="Helvetica-Bold",
            fontSize=20, leading=24, textColor=INK, alignment=0, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "AQSubtitle", parent=base["Normal"], fontName="Helvetica",
            fontSize=10.5, leading=14, textColor=INK_SOFT, spaceAfter=2,
        ),
        "h2": ParagraphStyle(
            "AQH2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12.5, leading=16, textColor=WATER_DEEP,
            spaceBefore=12, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "AQBody", parent=base["Normal"], fontName="Helvetica",
            fontSize=9.5, leading=13.5, textColor=INK,
        ),
        "small": ParagraphStyle(
            "AQSmall", parent=base["Normal"], fontName="Helvetica",
            fontSize=8, leading=11, textColor=INK_SOFT,
        ),
        "smallmuted": ParagraphStyle(
            "AQSmallMuted", parent=base["Normal"], fontName="Helvetica-Oblique",
            fontSize=8, leading=11, textColor=MUTED,
        ),
        "cell": ParagraphStyle(
            "AQCell", parent=base["Normal"], fontName="Helvetica",
            fontSize=8.5, leading=11.5, textColor=INK,
        ),
        "cellbold": ParagraphStyle(
            "AQCellBold", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8.5, leading=11.5, textColor=INK,
        ),
        "cellhead": ParagraphStyle(
            "AQCellHead", parent=base["Normal"], fontName="Helvetica-Bold",
            fontSize=8, leading=11, textColor=colors.white,
        ),
        "unavail": ParagraphStyle(
            "AQUnavail", parent=base["Normal"], fontName="Helvetica-Oblique",
            fontSize=8.5, leading=12, textColor=ALERT,
        ),
        "footer": ParagraphStyle(
            "AQFooter", parent=base["Normal"], fontName="Helvetica",
            fontSize=7.5, leading=9, textColor=MUTED,
        ),
    }


# Indicator keys whose value is a 0–1 fraction but is clearer as a percentage
# (mirrors the API/UI rule; ``river_discharge_ratio`` is deliberately excluded).
_FRACTION_KEYS = {"wet_day_fraction"}


def _fmt_value(value: float | None, unit: str, key: str | None = None) -> str:
    if value is None:
        return "unavailable"
    if key in _FRACTION_KEYS:
        return f"{value * 100:.1f}%"
    if unit == "%":
        return f"{value:.1f}%"
    if unit == "ratio":
        return f"{value:.2f}"
    if unit == "deg C":
        return f"{value:.1f} °C"
    if unit == "mm":
        return f"{value:.1f} mm"
    if unit == "m3/s":
        return f"{value:.1f} m³/s"
    if unit == "hours":
        return f"{value:.0f} h"
    if unit == "days":
        return f"{value:.0f}"
    return f"{value:g} {unit}".strip()


def _status_color(status: str) -> colors.Color:
    if status == "ok":
        return GOOD
    if status in {"partial", "stale", "insufficient_data"}:
        return CAUTION
    return ALERT


def _draw_logo(canvas, x: float, y: float, size: float = 11 * mm) -> None:
    """Draw the AquaNexus droplet mark (vector, no external asset)."""
    canvas.saveState()
    # Droplet: a circle with a pointed top.
    canvas.setFillColor(WATER)
    canvas.setStrokeColor(WATER_DEEP)
    canvas.setLineWidth(0.8)
    p = canvas.beginPath()
    cx = x + size / 2
    top = y + size
    p.moveTo(cx, top)
    p.curveTo(cx - size * 0.52, y + size * 0.52, x, y + size * 0.46, x, y + size * 0.30)
    p.curveTo(x, y + size * 0.12, cx - size * 0.22, y, cx, y)
    p.curveTo(cx + size * 0.22, y, x + size, y + size * 0.12, x + size, y + size * 0.30)
    p.curveTo(x + size, y + size * 0.46, cx + size * 0.52, y + size * 0.52, cx, top)
    canvas.drawPath(p, fill=1, stroke=1)
    # Inner wave highlight.
    canvas.setStrokeColor(colors.white)
    canvas.setLineWidth(1.1)
    w = canvas.beginPath()
    w.moveTo(x + size * 0.22, y + size * 0.34)
    w.curveTo(
        x + size * 0.36, y + size * 0.44,
        x + size * 0.64, y + size * 0.24,
        x + size * 0.78, y + size * 0.34,
    )
    canvas.drawPath(w, fill=0, stroke=1)
    canvas.restoreState()


def _chart_drawing(chart: ReportChart, styles) -> Drawing:
    """Build a compact vector line chart from real values.

    Drawn with reportlab primitives rather than the high-level chart widgets so
    the output is stable across reportlab versions and the axis labels are exact.
    """
    width = PAGE_W - 2 * MARGIN
    height = 62 * mm
    drawing = Drawing(width, height)

    values = [p.value for p in chart.points]
    usable = [v for v in values if v is not None]
    drawing.add(
        String(
            0, height - 10, f"{chart.title} ({chart.unit})",
            fontName="Helvetica-Bold", fontSize=9, fillColor=WATER_DEEP,
        )
    )
    if not usable:
        drawing.add(
            String(
                0, height / 2, "No values available for this series.",
                fontName="Helvetica-Oblique", fontSize=8.5, fillColor=MUTED,
            )
        )
        return drawing

    n = len(chart.points)
    left, right = 34.0, width - 8.0
    bottom, top = 20.0, height - 22.0
    lo, hi = min(usable), max(usable)
    if hi == lo:
        hi = lo + 1.0
    pad = (hi - lo) * 0.12
    vmin, vmax = lo - pad, hi + pad

    def y_of(value: float) -> float:
        return bottom + (value - vmin) / (vmax - vmin) * (top - bottom)

    def x_of(index: int) -> float:
        return left + (index / max(n - 1, 1)) * (right - left)

    # Horizontal gridlines with value labels.
    for step in range(5):
        value = vmin + (vmax - vmin) * step / 4
        y = y_of(value)
        drawing.add(
            Line(
                left, y, right, y,
                strokeColor=RULE, strokeWidth=0.4, strokeDashArray=[1.5, 2],
            )
        )
        drawing.add(
            String(
                left - 3, y - 2.4, f"{value:.0f}",
                fontName="Helvetica", fontSize=6.5, fillColor=INK_SOFT,
                textAnchor="end",
            )
        )

    # Axes.
    drawing.add(Line(left, bottom, right, bottom, strokeColor=INK_SOFT, strokeWidth=0.7))
    drawing.add(Line(left, bottom, left, top, strokeColor=INK_SOFT, strokeWidth=0.7))

    # The series, split into continuous segments so gaps are visibly gaps.
    segment: list[float] = []
    for index, value in enumerate(values):
        if value is None:
            if len(segment) >= 4:
                drawing.add(
                    PolyLine(
                        segment, strokeColor=WATER, strokeWidth=1.5,
                        fillColor=None, strokeLineJoin=1,
                    )
                )
            segment = []
            continue
        segment.extend([x_of(index), y_of(value)])
    if len(segment) >= 4:
        drawing.add(
            PolyLine(
                segment, strokeColor=WATER, strokeWidth=1.5,
                fillColor=None, strokeLineJoin=1,
            )
        )

    # Sparse x-axis labels: first, middle and last date.
    for index in sorted({0, n // 2, n - 1}):
        drawing.add(
            String(
                x_of(index), bottom - 11, chart.points[index].label[5:],
                fontName="Helvetica", fontSize=6.5, fillColor=INK_SOFT,
                textAnchor="middle",
            )
        )

    stats = (
        f"min {lo:.1f} · mean {sum(usable) / len(usable):.1f} · max {hi:.1f} {chart.unit}"
        f" · {len(usable)}/{n} days with values"
    )
    drawing.add(String(0, 4, stats, fontName="Helvetica", fontSize=7.5, fillColor=INK_SOFT))
    return drawing


def _section_flowables(section: ReportSection, styles) -> list:
    flow: list = [Paragraph(section.title, styles["h2"])]
    if section.available:
        if section.body:
            flow.append(Paragraph(section.body, styles["body"]))
        for item in section.items:
            flow.append(Paragraph(f"• {item}", styles["body"]))
    else:
        flow.append(
            Paragraph(
                f"Not available: {section.unavailable_reason or 'no evidence for this period.'}",
                styles["unavail"],
            )
        )
    flow.append(Spacer(1, 2))
    return flow


def _metrics_table(payload: ReportPayload, styles) -> Table:
    header = [
        Paragraph("Metric", styles["cellhead"]),
        Paragraph("Value", styles["cellhead"]),
        Paragraph("Class", styles["cellhead"]),
        Paragraph("Method / note", styles["cellhead"]),
    ]
    rows = [header]
    for metric in payload.metrics:
        rows.append(
            [
                Paragraph(metric.label, styles["cell"]),
                Paragraph(_fmt_value(metric.value, metric.unit, metric.key), styles["cellbold"]),
                Paragraph(
                    (metric.classification.value if metric.classification else "derived"),
                    styles["cell"],
                ),
                Paragraph(metric.note or (metric.method or ""), styles["small"]),
            ]
        )
    if len(rows) == 1:
        rows.append([Paragraph("No metrics available.", styles["cell"]), "", "", ""])
    table = Table(rows, colWidths=[52 * mm, 24 * mm, 24 * mm, None], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), WATER_DEEP),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BAND]),
            ]
        )
    )
    return table


def _sources_table(payload: ReportPayload, styles) -> Table:
    header = [
        Paragraph("Source", styles["cellhead"]),
        Paragraph("Status", styles["cellhead"]),
        Paragraph("Resolution", styles["cellhead"]),
        Paragraph("Attribution / limitations", styles["cellhead"]),
    ]
    rows = [header]
    for source in payload.sources:
        limitations = "; ".join(source.limitations[:2])
        detail = " · ".join(
            x for x in [source.attribution, limitations] if x
        ) or (source.message or "")
        rows.append(
            [
                Paragraph(source.provider_name, styles["cell"]),
                Paragraph(source.status, styles["cell"]),
                Paragraph(
                    " · ".join(
                        x
                        for x in [source.spatial_resolution, source.temporal_resolution]
                        if x
                    )
                    or "—",
                    styles["small"],
                ),
                Paragraph(detail or "—", styles["small"]),
            ]
        )
    table = Table(rows, colWidths=[40 * mm, 18 * mm, 34 * mm, None], repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), INK),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("GRID", (0, 0), (-1, -1), 0.4, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BAND]),
            ]
        )
    )
    return table


class _ReportDoc(BaseDocTemplate):
    """Doc template with a brand header and a page-numbered footer."""

    def __init__(self, buffer, payload: ReportPayload, styles):
        super().__init__(
            buffer,
            pagesize=A4,
            leftMargin=MARGIN,
            rightMargin=MARGIN,
            topMargin=MARGIN + 12 * mm,
            bottomMargin=MARGIN,
            title=f"AquaNexus Water Intelligence Report {payload.report_id}",
            author="AquaNexus",
            subject=f"Water intelligence report for {payload.study_area_name}",
        )
        self.payload = payload
        self.styles = styles
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="body",
            leftPadding=0,
            rightPadding=0,
            topPadding=0,
            bottomPadding=0,
        )
        self.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=self._decorate)])

    def _decorate(self, canvas, doc) -> None:
        canvas.saveState()
        # Header band.
        canvas.setFillColor(BAND)
        canvas.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, fill=1, stroke=0)
        _draw_logo(canvas, MARGIN, PAGE_H - 12 * mm, size=9 * mm)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 10.5)
        canvas.drawString(MARGIN + 12 * mm, PAGE_H - 9.2 * mm, "AquaNexus")
        canvas.setFillColor(INK_SOFT)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(
            MARGIN + 12 * mm, PAGE_H - 12 * mm, "Global Water Intelligence"
        )
        canvas.setFillColor(INK_SOFT)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawRightString(
            PAGE_W - MARGIN,
            PAGE_H - 9.2 * mm,
            f"Report {self.payload.report_id}",
        )
        canvas.drawRightString(
            PAGE_W - MARGIN,
            PAGE_H - 12 * mm,
            f"Generated {self.payload.generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
        )
        # Footer.
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, MARGIN - 5 * mm, PAGE_W - MARGIN, MARGIN - 5 * mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7)
        canvas.drawString(
            MARGIN,
            MARGIN - 9 * mm,
            "AquaNexus — evidence-based water intelligence. Not an official warning service.",
        )
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN - 9 * mm, f"Page {doc.page}")
        canvas.restoreState()


def render_report_pdf(payload: ReportPayload) -> bytes:
    """Render the payload to PDF bytes."""
    styles = _styles()
    buffer = io.BytesIO()
    doc = _ReportDoc(buffer, payload, styles)

    story: list = []
    story.append(Paragraph("Water Intelligence Report", styles["title"]))
    story.append(
        Paragraph(
            f"{payload.study_area_name} · "
            f"{payload.location.latitude:.4f}, {payload.location.longitude:.4f}",
            styles["subtitle"],
        )
    )
    story.append(
        Paragraph(
            f"Analysis period {payload.analysis_start.isoformat()} to "
            f"{payload.analysis_end.isoformat()} ({payload.window_days} days requested) · "
            f"Report ID {payload.report_id}",
            styles["small"],
        )
    )

    # Completeness banner — honest about what the report is.
    banner = Table(
        [[Paragraph(f"<b>{payload.completeness.upper()}</b> — {payload.completeness_note}", styles["small"])]],
        colWidths=[PAGE_W - 2 * MARGIN],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fdf3e3")),
                ("BOX", (0, 0), (-1, -1), 0.5, CAUTION),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(banner)

    story.extend(_section_flowables(payload.executive_summary, styles))

    story.append(Paragraph("Key metrics", styles["h2"]))
    story.append(_metrics_table(payload, styles))

    story.extend(_section_flowables(payload.observed_conditions, styles))
    story.extend(_section_flowables(payload.rainfall_findings, styles))
    story.extend(_section_flowables(payload.heat_findings, styles))
    story.extend(_section_flowables(payload.flood_findings, styles))
    story.extend(_section_flowables(payload.surface_water_findings, styles))
    story.extend(_section_flowables(payload.dry_condition_findings, styles))

    if payload.charts:
        story.append(Paragraph("Charts", styles["h2"]))
        for chart in payload.charts:
            story.append(KeepTogether([_chart_drawing(chart, styles), Spacer(1, 4)]))
            if chart.note:
                story.append(Paragraph(chart.note, styles["smallmuted"]))

    story.extend(_section_flowables(payload.data_quality, styles))
    story.extend(_section_flowables(payload.ai_interpretation, styles))
    story.extend(_section_flowables(payload.follow_up, styles))

    story.append(Paragraph("Data sources and methodology", styles["h2"]))
    story.append(
        Paragraph(
            "Values are reanalysis, forecast, satellite-estimate or simulation products "
            "as classified below. Each source carries its own resolution, units and "
            "limitations.",
            styles["body"],
        )
    )
    story.append(Spacer(1, 3))
    story.append(_sources_table(payload, styles))

    story.append(Paragraph("Limitations", styles["h2"]))
    for limitation in payload.limitations:
        story.append(Paragraph(f"• {limitation}", styles["body"]))

    if payload.citations:
        story.append(Paragraph("Citations", styles["h2"]))
        for citation in payload.citations:
            story.append(Paragraph(f"• {citation}", styles["small"]))

    doc.build(story)
    return buffer.getvalue()

"""AI analysis orchestration.

Builds a grounded evidence package from the same providers the rest of the
workspace uses, then asks the configured model to *interpret* it. The model is
never the source of a number: every factual value in the package comes from a
real provider response, and the package is returned to the client regardless of
whether the model is configured or reachable.

Failure handling is explicit: a missing credential yields ``unconfigured``, a
provider failure yields ``unavailable``, and in both cases the evidence package
is still returned so the UI can show real data and state what is missing.
"""
from __future__ import annotations

import asyncio

from app.config import get_settings
from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.ai import (
    AIAnalysisReport,
    AIEvidencePackage,
    AINarrative,
    EvidenceObservation,
)
from app.models.common import DataClassification, GeoPoint, PlaceResult, ProviderStatus
from app.providers import ai as ai_provider
from app.providers import open_meteo
from app.providers.stac import search_scenes
from app.models.common import BoundingBox
from app.services.summary import build_location_summary
from datetime import datetime, timedelta, timezone

logger = get_logger(__name__)

SYSTEM_PROMPT = (
    "You are the analysis assistant inside AquaNexus, a water-intelligence "
    "platform. You will receive an evidence package containing real environmental "
    "values, each with a unit, a period and a source. Rules you must follow:\n"
    "1. Use ONLY the values in the evidence package. Never invent, extrapolate or "
    "round in a way that changes meaning, and never state a number that is not in "
    "the package.\n"
    "2. Keep measurements and interpretation clearly separate. If you interpret, "
    "say so.\n"
    "3. Respect data classification: reanalysis is a model-informed record, "
    "forecast is modelled and not yet observed, simulation/modelled discharge is "
    "not a river-gauge reading, and satellite scenes are catalogue metadata, not "
    "processed imagery or confirmed water detection.\n"
    "4. Where evidence is missing, say so plainly instead of guessing. Rainfall "
    "alone does not establish water scarcity, and heavy rainfall alone does not "
    "establish that a flood occurred.\n"
    "5. Be proportionate and non-alarmist. Do not issue emergency warnings. You "
    "are not an official warning service.\n"
    "6. Respond with a single JSON object and nothing else."
)

SCHEMA_HINT = {
    "situation_summary": "one short paragraph on what the evidence currently indicates",
    "observed_conditions": ["verified readings with units and dates"],
    "recent_changes": ["trends supported by the available time series"],
    "potential_concerns": ["evidence-based issues worth attention"],
    "confidence_and_limitations": ["what is known, uncertain or unavailable"],
    "investigate_next": ["additional measurements or datasets that would help"],
    "recommended_next_steps": ["proportionate, evidence-based actions"],
}


def _fmt(value: float | None, digits: int = 1) -> str:
    return "n/a" if value is None else f"{value:.{digits}f}"


def _observation_from_indicator(indicator) -> EvidenceObservation:
    return EvidenceObservation(
        key=indicator.key,
        label=indicator.label,
        value=indicator.value,
        unit=indicator.unit,
        status=indicator.status,
        classification=indicator.classification,
        source="Location summary",
        method=indicator.method,
    )


async def build_evidence_package(
    point: GeoPoint,
    *,
    label: str | None = None,
    resolved_place: PlaceResult | None = None,
    window_days: int = 30,
) -> AIEvidencePackage:
    """Assemble the grounded evidence package from real provider responses."""
    end = datetime.now(tz=timezone.utc)
    start = end - timedelta(days=30)
    bbox = BoundingBox(
        west=max(-180.0, point.longitude - 0.1),
        south=max(-90.0, point.latitude - 0.1),
        east=min(180.0, point.longitude + 0.1),
        north=min(90.0, point.latitude + 0.1),
    )

    summary, weather, discharge, scenes = await asyncio.gather(
        _safe(build_location_summary(point, label=label, resolved_place=resolved_place,
                                    window_days=window_days)),
        _safe(open_meteo.fetch_weather_forecast(point, days=7)),
        _safe(open_meteo.fetch_discharge_series(point, days=14)),
        _safe(search_scenes(bbox, start=start, end=end, collection="sentinel-2-l2a", limit=12)),
    )

    observations: list[EvidenceObservation] = []
    available: list[str] = []
    missing: list[str] = []
    notes: list[str] = []

    # --- Location summary indicators (rainfall, coverage, discharge ratio) ---
    if summary is not None:
        for indicator in summary.indicators:
            observations.append(_observation_from_indicator(indicator))
        notes.extend(summary.notes)
        for report in summary.providers:
            if report.status == ProviderStatus.OK:
                available.append(report.provider_name)
            elif report.status == ProviderStatus.UNCONFIGURED:
                missing.append(f"{report.provider_name} (credential not configured)")
            else:
                missing.append(report.provider_name)

    # --- Weather (forecast) ---
    if weather is not None:
        available.append(weather.provider.name)
        if weather.current is not None:
            observations.append(
                EvidenceObservation(
                    key="current_temperature",
                    label="Current temperature (modelled)",
                    value=weather.current.temperature_c,
                    unit="°C",
                    classification=DataClassification.FORECAST,
                    period=weather.current.timestamp.isoformat(),
                    source=weather.provider.name,
                )
            )
            observations.append(
                EvidenceObservation(
                    key="current_wind",
                    label="Current wind speed (modelled)",
                    value=weather.current.wind_speed_kmh,
                    unit="km/h",
                    classification=DataClassification.FORECAST,
                    period=weather.current.timestamp.isoformat(),
                    source=weather.provider.name,
                )
            )
        if weather.daily:
            precip = [d.precipitation_sum_mm for d in weather.daily if d.precipitation_sum_mm is not None]
            if precip:
                observations.append(
                    EvidenceObservation(
                        key="forecast_7d_precip",
                        label="7-day forecast precipitation total (modelled)",
                        value=round(sum(precip), 1),
                        unit="mm",
                        classification=DataClassification.FORECAST,
                        period=f"{weather.daily[0].date} to {weather.daily[-1].date}",
                        source=weather.provider.name,
                    )
                )
            tmax = [d.temperature_max_c for d in weather.daily if d.temperature_max_c is not None]
            tmin = [d.temperature_min_c for d in weather.daily if d.temperature_min_c is not None]
            if tmax and tmin:
                observations.append(
                    EvidenceObservation(
                        key="forecast_temperature_range",
                        label="Forecast temperature range (modelled)",
                        value=round(max(tmax) - min(tmin), 1),
                        unit="°C",
                        classification=DataClassification.FORECAST,
                        period=f"{weather.daily[0].date} to {weather.daily[-1].date}",
                        source=weather.provider.name,
                    )
                )
    else:
        missing.append("Weather forecast")

    # --- River discharge (modelled) ---
    if discharge is not None and discharge.valid_days > 0:
        available.append(discharge.provider.name)
        values = [p.discharge_m3s for p in discharge.points if p.discharge_m3s is not None]
        if values:
            observations.append(
                EvidenceObservation(
                    key="modelled_discharge_range",
                    label="Modelled river discharge range (GloFAS)",
                    value=round(max(values) - min(values), 1),
                    unit="m3/s",
                    classification=DataClassification.SIMULATION,
                    period=f"{discharge.start_date} to {discharge.end_date}",
                    source=discharge.provider.name,
                    method="Range across the returned daily modelled values; not a gauge reading.",
                )
            )
            observations.append(
                EvidenceObservation(
                    key="modelled_discharge_peak",
                    label="Modelled peak daily discharge (GloFAS)",
                    value=round(max(values), 1),
                    unit="m3/s",
                    classification=DataClassification.SIMULATION,
                    period=f"{discharge.start_date} to {discharge.end_date}",
                    source=discharge.provider.name,
                )
            )
    else:
        missing.append("Modelled river discharge (no coverage at this location)")

    # --- Satellite catalogue (metadata only) ---
    if scenes is not None:
        available.append(scenes.provider.provider_name)
        observations.append(
            EvidenceObservation(
                key="satellite_scene_count",
                label="Sentinel-2 scenes in the last 30 days (catalogue metadata)",
                value=float(scenes.count),
                unit="scenes",
                classification=DataClassification.SATELLITE_ESTIMATE,
                period=f"{scenes.start.date()} to {scenes.end.date()}",
                source=scenes.provider.provider_name,
                method="STAC catalogue search count; metadata only, not processed imagery.",
            )
        )
    else:
        missing.append("Satellite catalogue search")

    providers = summary.providers if summary is not None else []
    return AIEvidencePackage(
        location=point,
        label=label,
        resolved_place=resolved_place,
        observations=observations,
        providers=providers,
        available=sorted(set(available)),
        missing=sorted(set(missing)),
        notes=notes,
    )


async def _safe(coro):
    try:
        return await coro
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("AI evidence source unavailable: %s", exc)
        return None


def _package_to_payload(package: AIEvidencePackage) -> dict:
    """Serialize the package for the model, bounded in size."""
    payload = {
        "location": {
            "latitude": package.location.latitude,
            "longitude": package.location.longitude,
            "place": package.resolved_place.name if package.resolved_place else package.label,
            "country": package.resolved_place.country if package.resolved_place else None,
        },
        "observations": [
            {
                "key": o.key,
                "label": o.label,
                "value": o.value,
                "unit": o.unit,
                "status": o.status,
                "classification": o.classification.value if o.classification else None,
                "period": o.period,
                "source": o.source,
            }
            for o in package.observations
        ],
        "available_sources": package.available,
        "missing_sources": package.missing,
        "notes": package.notes,
    }
    settings = get_settings()
    # Bound the prompt size defensively.
    import json

    blob = json.dumps(payload, ensure_ascii=False)
    if len(blob) > settings.ai_max_evidence_chars:
        payload["notes"] = payload["notes"][:5]
        payload["observations"] = payload["observations"][:40]
    return payload


def _parse_narrative(raw: dict) -> AINarrative:
    """Validate and coerce the model's JSON into the narrative schema.

    Unknown keys are dropped; missing keys become empty lists. Non-string list
    items are ignored so a malformed response degrades gracefully rather than
    rendering junk.
    """
    def as_str(value) -> str:
        return value.strip() if isinstance(value, str) else ""

    def as_list(value) -> list[str]:
        if not isinstance(value, list):
            return []
        return [v.strip() for v in value if isinstance(v, str) and v.strip()]

    return AINarrative(
        situation_summary=as_str(raw.get("situation_summary")),
        observed_conditions=as_list(raw.get("observed_conditions")),
        recent_changes=as_list(raw.get("recent_changes")),
        potential_concerns=as_list(raw.get("potential_concerns")),
        confidence_and_limitations=as_list(raw.get("confidence_and_limitations")),
        investigate_next=as_list(raw.get("investigate_next")),
        recommended_next_steps=as_list(raw.get("recommended_next_steps")),
    )


# Below this many usable (non-null, "ok") observations the evidence is too thin
# to interpret honestly, so no model call is made and an explicit
# ``insufficient_evidence`` result is returned instead of a speculative narrative.
MIN_EVIDENCE_OBSERVATIONS = 3


def _usable_observation_count(package: AIEvidencePackage) -> int:
    return sum(
        1
        for o in package.observations
        if o.value is not None and o.status in {"ok", "partial"}
    )


async def analyze_location(
    point: GeoPoint,
    *,
    label: str | None = None,
    resolved_place: PlaceResult | None = None,
    window_days: int = 30,
) -> AIAnalysisReport:
    """Build the evidence package and, if configured, an interpretation."""
    package = await build_evidence_package(
        point, label=label, resolved_place=resolved_place, window_days=window_days
    )
    settings = get_settings()

    usable = _usable_observation_count(package)
    if usable < MIN_EVIDENCE_OBSERVATIONS:
        # Refuse to interpret a thin package: a model asked to summarise almost
        # nothing will invent plausible-sounding context.
        return AIAnalysisReport(
            status="insufficient_evidence",
            provider=ai_provider.PROVIDER_NAME,
            model=None,
            evidence=package,
            message=(
                f"Only {usable} usable observation(s) were retrieved for this location and "
                f"period (minimum {MIN_EVIDENCE_OBSERVATIONS} required). No AI interpretation "
                "was generated; the evidence below is shown without a narrative."
            ),
            min_observations=MIN_EVIDENCE_OBSERVATIONS,
        )

    if not ai_provider.is_configured():
        return AIAnalysisReport(
            status="unconfigured",
            provider=ai_provider.PROVIDER_NAME,
            model=None,
            evidence=package,
            message=(
                "AI analysis is not configured for this deployment. Set an AI "
                "provider credential to enable interpretation; the evidence above "
                "is available without it."
            ),
            min_observations=MIN_EVIDENCE_OBSERVATIONS,
        )

    try:
        raw = await ai_provider.complete_json(
            system_prompt=SYSTEM_PROMPT,
            user_payload=_package_to_payload(package),
            schema_hint=SCHEMA_HINT,
        )
    except AquaNexusError as exc:
        return AIAnalysisReport(
            status="unavailable",
            provider=ai_provider.PROVIDER_NAME,
            model=settings.ai_model,
            evidence=package,
            message=exc.message,
            min_observations=MIN_EVIDENCE_OBSERVATIONS,
        )

    return AIAnalysisReport(
        status="ok",
        provider=ai_provider.PROVIDER_NAME,
        model=settings.ai_model,
        evidence=package,
        narrative=_parse_narrative(raw),
        min_observations=MIN_EVIDENCE_OBSERVATIONS,
    )

"""Surface-water presence assessment.

Answers "is surface water observable in the selected area?" by combining two
real, independent sources and stating exactly what each one can and cannot say:

1. **OpenStreetMap mapped water features** (Overpass). A real vector mapping
   dataset: if a water body is mapped at the location, water is observable
   there. It is mapping data, not a satellite detection and not a measurement.
2. **Copernicus Sentinel-2 scene availability** (CDSE STAC). Confirms whether
   optical imagery exists for the area and period. Imagery presence is
   *evidence availability*, not a water detection — so it is recorded as an
   observation with ``detected=None`` and never used to claim water.

The assessment deliberately distinguishes **missing coverage** from **absence**:
if a source did not return, the status is ``insufficient_evidence``, never
``no_water_detected``. Only when the mapping source responded successfully and
found nothing (and imagery coverage is understood) is "no water detected in
available evidence" reported.

Modelled or forecast water is never mixed in here; this module is about
observed/mapped surface water only.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from app.errors import AquaNexusError, ProviderError
from app.logging_config import get_logger
from app.models.common import BoundingBox, GeoPoint, ProviderReport, ProviderStatus
from app.models.water_intel import (
    WaterPresenceObservation,
    WaterPresenceResult,
    WaterPresenceStatus,
)
from app.providers import catalog
from app.providers.stac import search_scenes
from app.providers.water_bodies import find_water_bodies
from app.services.geometry import nearest_vertex_km

logger = get_logger(__name__)

# The mapping search radius for presence. Large enough to catch a lake or river
# that the point sits beside, small enough to stay a "local" statement.
PRESENCE_RADIUS_M = 10_000
# A satellite search box half-width for imagery availability.
SCENE_RADIUS_DEG = 0.15
SCENE_DAYS = 30

WATER_KINDS = {"water", "lake", "river", "reservoir", "riverbank", "wetland"}


async def assess_water_presence(
    point: GeoPoint,
    *,
    radius_m: int = PRESENCE_RADIUS_M,
) -> WaterPresenceResult:
    """Assess observable surface water near a point from real evidence."""
    observations: list[WaterPresenceObservation] = []
    providers: list[ProviderReport] = []
    notes: list[str] = []

    # --- 1. Mapped water features (OpenStreetMap) -------------------------
    mapping_ok = False
    water_bodies = []
    try:
        bodies_result = await find_water_bodies(point, radius_m=radius_m, limit=40)
        providers.append(bodies_result.provider)
        # "No mapped water" and "service unreachable" are different facts; the
        # provider status alone conflates them, so use the explicit flag.
        mapping_ok = bodies_result.service_reachable
        # Report the radius the lookup was actually built for: a cached result
        # may have been produced for a different (larger) radius than requested.
        lookup_radius_m = bodies_result.lookup_radius_m or radius_m
        if bodies_result.service_reachable:
            water_bodies = [b for b in bodies_result.bodies if b.kind in WATER_KINDS]
            total_area = sum(b.area_km2 or 0.0 for b in water_bodies)
            search_area = math.pi * (lookup_radius_m / 1000.0) ** 2
            coverage = min(1.0, total_area / search_area) if search_area else None
            nearest = (
                min(nearest_vertex_km(point, b.coordinates) for b in water_bodies)
                if water_bodies
                else None
            )
            observations.append(
                WaterPresenceObservation(
                    source_id=catalog.OSM_OVERPASS.id,
                    source_name=catalog.OSM_OVERPASS.name,
                    product=catalog.OSM_OVERPASS.product or "OpenStreetMap water features",
                    classification=catalog.OSM_OVERPASS.classification,
                    observed_at=None,
                    spatial_resolution=catalog.OSM_OVERPASS.spatial_resolution or "vector geometry",
                    method=(
                        f"Count of mapped water polygons (natural=water, landuse=reservoir, "
                        f"waterway=riverbank, natural=wetland) within {lookup_radius_m} m; nearest "
                        "straight-line distance to the nearest mapped outline."
                    ),
                    method_version="1.0",
                    detected=bool(water_bodies),
                    coverage_fraction=round(coverage, 4) if coverage is not None else None,
                    value=float(len(water_bodies)),
                    unit="features",
                    confidence="mapping completeness varies by region",
                    limitations=list(catalog.OSM_OVERPASS.limitations),
                    notes=(
                        [
                            f"Nearest mapped water feature is {nearest:.2f} km away."
                            if nearest is not None
                            else "No mapped water feature within the search radius."
                        ]
                    ),
                )
            )
        else:
            observations.append(
                WaterPresenceObservation(
                    source_id=catalog.OSM_OVERPASS.id,
                    source_name=catalog.OSM_OVERPASS.name,
                    product=catalog.OSM_OVERPASS.product or "OpenStreetMap water features",
                    classification=catalog.OSM_OVERPASS.classification,
                    spatial_resolution=catalog.OSM_OVERPASS.spatial_resolution or "vector geometry",
                    method="Mapped water-feature lookup within the search radius.",
                    detected=None,
                    limitations=list(catalog.OSM_OVERPASS.limitations),
                    notes=[bodies_result.provider.message or "No mapped water features returned."],
                )
            )
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("Water-presence mapping source unavailable: %s", exc)
        providers.append(
            ProviderReport(
                provider_id=catalog.OSM_OVERPASS.id,
                provider_name=catalog.OSM_OVERPASS.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
                classification=catalog.OSM_OVERPASS.classification,
            )
        )

    # --- 2. Optical imagery availability (CDSE STAC) ----------------------
    imagery_ok = False
    scene_count = 0
    try:
        now = datetime.now(tz=timezone.utc)
        bbox = BoundingBox(
            west=max(-180.0, point.longitude - SCENE_RADIUS_DEG),
            south=max(-90.0, point.latitude - SCENE_RADIUS_DEG),
            east=min(180.0, point.longitude + SCENE_RADIUS_DEG),
            north=min(90.0, point.latitude + SCENE_RADIUS_DEG),
        )
        scenes = await search_scenes(
            bbox, start=now - timedelta(days=SCENE_DAYS), end=now, limit=8
        )
        providers.append(scenes.provider)
        imagery_ok = True
        scene_count = scenes.count
        observations.append(
            WaterPresenceObservation(
                source_id=catalog.CDSE_STAC.id,
                source_name=catalog.CDSE_STAC.name,
                product=catalog.CDSE_STAC.product or "Sentinel-2 L2A",
                classification=catalog.CDSE_STAC.classification,
                observed_at=now,
                spatial_resolution=catalog.CDSE_STAC.spatial_resolution or "10/20/60 m",
                method=(
                    f"Count of Sentinel-2 scenes intersecting the area in the last "
                    f"{SCENE_DAYS} days. This measures imagery availability, not a water "
                    "detection: AquaNexus does not classify these pixels."
                ),
                method_version="1.0",
                detected=None,
                value=float(scene_count),
                unit="scenes",
                confidence=None,
                limitations=list(catalog.CDSE_STAC.limitations),
                notes=[
                    "Imagery availability is not a water observation; it only tells you "
                    "whether optical scenes exist for the area."
                ],
            )
        )
    except (AquaNexusError, ProviderError, ValueError) as exc:
        logger.info("Water-presence imagery source unavailable: %s", exc)
        providers.append(
            ProviderReport(
                provider_id=catalog.CDSE_STAC.id,
                provider_name=catalog.CDSE_STAC.name,
                status=ProviderStatus.UNAVAILABLE,
                message=str(exc),
                classification=catalog.CDSE_STAC.classification,
            )
        )

    # --- Combine into an honest status ------------------------------------
    mapping_detected = any(o.detected is True for o in observations)
    evidence_count = sum(1 for o in observations if o.detected is not None)

    if mapping_detected:
        status: WaterPresenceStatus = "water_detected"
        headline = "Surface water detected"
        detail = (
            f"{len(water_bodies)} mapped water feature(s) were found within "
            f"{lookup_radius_m // 1000} km of the selected point. This is mapping evidence "
            "(OpenStreetMap), not a satellite water classification."
        )
    elif mapping_ok and imagery_ok:
        status = "no_water_detected"
        headline = "No water detected in the available evidence"
        detail = (
            "The mapping source returned no water features within the search radius and "
            f"{scene_count} optical scene(s) exist for the area. Absence of mapped water "
            "is not proof that no water is present — small, seasonal or unmapped water is "
            "not always recorded."
        )
    elif mapping_ok:
        status = "partial_coverage"
        headline = "Partial evidence"
        detail = (
            "The mapping source returned no water features, but the satellite catalogue "
            "could not be queried, so coverage is incomplete. This is not a "
            "no-water statement."
        )
    else:
        status = "insufficient_evidence"
        headline = "Insufficient evidence"
        detail = (
            "Neither the mapping source nor the satellite catalogue returned usable data "
            "for this location, so no water-presence conclusion can be drawn."
        )

    notes.append(
        "Observed/mapped surface water is reported here only. Modelled or forecast water "
        "is never mixed into a presence statement."
    )
    notes.append(
        "Mapped water does not imply flooding; see Flood Intelligence for flood-related "
        "evidence."
    )

    return WaterPresenceResult(
        location=point,
        generated_at=datetime.now(tz=timezone.utc),
        status=status,
        headline=headline,
        detail=detail,
        observations=observations,
        providers=providers,
        evidence_count=evidence_count,
        notes=notes,
    )

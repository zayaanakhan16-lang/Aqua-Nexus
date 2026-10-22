"""Global water-body discovery from OpenStreetMap via the Overpass API.

Answers "what mapped water features are near this point?" using OpenStreetMap's
``natural=water``, ``waterway`` and reservoir geometries. This is a
**mapping/cartography** source, not a hydrological measurement: a feature being
present in OSM means a contributor mapped it, not that a gauge or satellite
confirmed water there. Every result is labelled accordingly.

Geometry is returned as real coordinates (``out geom``) so the frontend can draw
the actual outline rather than a bounding box. Antimeridian crossings and
degenerate rings are normalised here so the renderer never has to guess.
"""
from __future__ import annotations

import asyncio
import math
import time
from typing import Any

import httpx

from app.config import get_settings
from app.errors import ProviderError, ValidationError
from app.logging_config import get_logger
from app.models.common import BoundingBox, DataClassification, GeoPoint, ProviderReport, ProviderStatus
from app.models.water import WaterBody, WaterBodyResult
from app.providers import catalog

logger = get_logger(__name__)

PROVIDER = catalog.OSM_OVERPASS

# Bounded search: a point search is cheap and reliable, but an unbounded radius
# would let a single request ask Overpass for a continent. These caps keep every
# query polite and predictable.
MIN_RADIUS_M = 500
MAX_RADIUS_M = 50_000
DEFAULT_RADIUS_M = 15_000
MAX_BODIES = 60

# Public Overpass mirrors, tried in order. A single mirror is often at capacity
# (HTTP 502), so a request falls through to the next rather than failing.
MIRRORS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)

# One tag filter per query, in priority order. A single ``around`` clause with
# one tag is served reliably by the public endpoints; a union of several
# ``around`` clauses is routinely rejected with "502 Gateway Timeout", and some
# individual filters (riverbank, reservoir) are frequently at capacity. The
# first filter is therefore treated as the reliable primary and the rest as
# best-effort additions within a short time budget.
_AREA_FILTERS = (
    '["natural"="water"]',
    '["landuse"="reservoir"]',
    '["waterway"="riverbank"]',
    '["natural"="wetland"]',
)

# Total wall-clock budget for the whole lookup. Public Overpass mirrors can stall
# for tens of seconds; a bounded budget keeps the panel responsive and lets the
# UI show an honest "at capacity" state instead of hanging.
TOTAL_BUDGET_SECONDS = 20.0
# Per-attempt timeout. A mirror that has not answered in this long is treated as
# unavailable so the budget is not consumed by a single stalled host.
PER_ATTEMPT_SECONDS = 6.0


def _close_ring(coords: list[list[float]]) -> list[list[float]]:
    """Return a closed ring, or ``[]`` when the geometry is unusable."""
    if len(coords) < 4:
        return []
    if coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    return coords


def _normalize_geometry(geometry: list[dict[str, Any]]) -> list[list[float]]:
    """Convert Overpass ``out geom`` nodes into a closed ``[lon, lat]`` ring."""
    coords = [
        [round(float(node["lon"]), 6), round(float(node["lat"]), 6)]
        for node in geometry
        if node.get("lat") is not None and node.get("lon") is not None
    ]
    return _close_ring(coords)


def _bbox_of(coords: list[list[float]]) -> BoundingBox:
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return BoundingBox(west=min(lons), south=min(lats), east=max(lons), north=max(lats))


def _area_km2(coords: list[list[float]]) -> float | None:
    """Spherical-excess area of a lon/lat ring in km^2.

    Uses the standard geodesic polygon formula so a large lake's area is not
    distorted the way a naive planar approximation would be. Returns ``None``
    for a degenerate ring rather than reporting a fabricated zero.
    """
    if len(coords) < 4:
        return None
    radius_km = 6371.0088
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        # The spherical-excess formula needs the longitude *difference* in
        # radians; latitudes enter through sine, so they are converted in place.
        total += math.radians(lon2 - lon1) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
        )
    area = abs(total * radius_km * radius_km / 2.0)
    return round(area, 3) if area > 0 else None


def _water_kind(tags: dict[str, Any]) -> str:
    if tags.get("water") == "reservoir" or tags.get("landuse") == "reservoir":
        return "reservoir"
    if tags.get("natural") == "wetland":
        return "wetland"
    if tags.get("waterway") == "riverbank":
        return "riverbank"
    if tags.get("water") == "river":
        return "river"
    if tags.get("water") == "lake":
        return "lake"
    return "water"


def _normalize(element: dict[str, Any]) -> WaterBody | None:
    geometry = element.get("geometry")
    if not isinstance(geometry, list):
        return None
    coords = _normalize_geometry(geometry)
    if not coords:
        return None
    tags = element.get("tags") or {}
    name = tags.get("name") or tags.get("name:en")
    return WaterBody(
        id=f"{element.get('type', 'way')}/{element.get('id')}",
        name=name,
        kind=_water_kind(tags),
        coordinates=coords,
        bbox=_bbox_of(coords),
        area_km2=_area_km2(coords),
        tags={
            k: str(v)
            for k, v in tags.items()
            if k in ("name", "water", "natural", "landuse", "waterway", "intermittent")
        },
        source_id=PROVIDER.id,
    )


async def _run_query(
    client: httpx.AsyncClient, query: str, mirrors: tuple[str, ...]
) -> list[dict[str, Any]] | None:
    """Run one Overpass query, trying each mirror until one answers.

    Returns the element list, or ``None`` when every mirror failed. A 502 means
    the mirror is at capacity (transient), so it is skipped rather than treated
    as a hard error.
    """
    for mirror in mirrors:
        try:
            response = await asyncio.wait_for(
                client.post(mirror, data={"data": query}), timeout=PER_ATTEMPT_SECONDS
            )
            if response.status_code == 200:
                payload = response.json()
                return payload.get("elements") or []
            logger.info("Overpass mirror %s returned %s", mirror, response.status_code)
        except (httpx.HTTPError, ValueError, asyncio.TimeoutError) as exc:
            logger.info("Overpass mirror %s failed: %s", mirror, type(exc).__name__)
    return None


async def find_water_bodies(
    point: GeoPoint, *, radius_m: int = DEFAULT_RADIUS_M, limit: int = 25
) -> WaterBodyResult:
    """Find mapped water bodies within ``radius_m`` of a point."""
    if not (MIN_RADIUS_M <= radius_m <= MAX_RADIUS_M):
        raise ValidationError(
            f"radius_m must be between {MIN_RADIUS_M} and {MAX_RADIUS_M}."
        )
    limit = max(1, min(limit, MAX_BODIES))

    settings = get_settings()
    # Allow a deployment to override the mirror list via configuration while
    # keeping the public defaults.
    mirrors = MIRRORS
    configured = getattr(settings, "osm_overpass_url", None)
    if configured and configured not in mirrors:
        mirrors = (configured,) + mirrors

    bodies: dict[str, WaterBody] = {}
    any_success = False
    # Overpass rejects requests without an identifying User-Agent, so the shared
    # client's UA is sent explicitly here.
    async with httpx.AsyncClient(
        timeout=PER_ATTEMPT_SECONDS,
        headers={"User-Agent": settings.user_agent},
    ) as client:
        deadline = time.monotonic() + TOTAL_BUDGET_SECONDS
        for tag_filter in _AREA_FILTERS:
            remaining = deadline - time.monotonic()
            if remaining <= 1.0:
                logger.info("Overpass time budget exhausted before %s", tag_filter)
                break
            query = (
                f"[out:json][timeout:25];"
                f"way{tag_filter}(around:{radius_m},{point.latitude},{point.longitude});"
                f"out geom {MAX_BODIES};"
            )
            try:
                elements = await asyncio.wait_for(
                    _run_query(client, query, mirrors), timeout=remaining
                )
            except asyncio.TimeoutError:
                logger.info("Overpass query for %s exceeded the time budget", tag_filter)
                break
            if elements is None:
                continue
            any_success = True
            for element in elements:
                body = _normalize(element)
                if body is not None and body.id not in bodies:
                    bodies[body.id] = body
            # The primary filter returning data is enough to render the panel;
            # stop early rather than spending the whole budget on extras.
            if tag_filter == _AREA_FILTERS[0] and bodies:
                break

    if not any_success:
        return WaterBodyResult(
            location=point,
            radius_m=radius_m,
            count=0,
            bodies=[],
            provider=ProviderReport(
                provider_id=PROVIDER.id,
                provider_name=PROVIDER.name,
                status=ProviderStatus.UNAVAILABLE,
                message=(
                    "The OpenStreetMap water-feature service is at capacity and did "
                    "not answer. Try again shortly."
                ),
                classification=PROVIDER.classification,
            ),
            note=(
                "No water-feature data is shown because the OpenStreetMap Overpass "
                "service could not be reached. This is a service limitation, not a "
                "statement that the area has no water."
            ),
        )

    ordered = sorted(bodies.values(), key=lambda b: (b.area_km2 or 0.0), reverse=True)
    ordered = ordered[:limit]

    return WaterBodyResult(
        location=point,
        radius_m=radius_m,
        count=len(ordered),
        bodies=ordered,
        provider=ProviderReport(
            provider_id=PROVIDER.id,
            provider_name=PROVIDER.name,
            status=ProviderStatus.OK if ordered else ProviderStatus.UNAVAILABLE,
            message=None if ordered else "No mapped water features within this radius.",
            classification=PROVIDER.classification,
        ),
        note=(
            "Water features are from OpenStreetMap contributor mapping, not a "
            "hydrological survey or satellite water detection. A feature being "
            "listed means it is mapped; absence does not mean water is absent."
        ),
    )

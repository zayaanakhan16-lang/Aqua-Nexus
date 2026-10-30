"""Tests for the local water-intelligence modules.

Every provider is mocked, so these are deterministic and require no network.
They pin the scientific-integrity guarantees: missing coverage is never reported
as absence, rainfall is never reported as flooding, and a change analysis is
never claimed when two comparable scenes are not available.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from app.models.common import GeoPoint
from app.providers import water_bodies
from app.providers.water_bodies import _normalize
from app.services import change_detection, flood_evidence, outlook, water_presence

OVERPAST = "https://overpass-api.de/api/interpreter"
MIRROR_KUMI = "https://overpass.kumi.systems/api/interpreter"
MIRROR_COFFEE = "https://overpass.private.coffee/api/interpreter"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
CMR_URL = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search"

POINT = GeoPoint(latitude=-1.0, longitude=33.0)


def mock_overpass(return_value):
    """Mock every configured Overpass mirror, so a fall-through cannot escape."""
    for url in (OVERPAST, MIRROR_KUMI, MIRROR_COFFEE):
        respx.post(url).mock(return_value=return_value)


# --- Relation normalization (large lakes are OSM relations) ----------------


def test_normalize_relation_uses_largest_outer_ring():
    """A relation is normalized from its outer rings, not silently dropped."""
    element = {
        "type": "relation",
        "id": 2606941,
        "tags": {"natural": "water", "water": "lake", "name": "Lake Victoria"},
        "members": [
            {
                "type": "way",
                "role": "outer",
                "geometry": [
                    {"lat": -1.0, "lon": 33.0},
                    {"lat": -1.0, "lon": 33.2},
                    {"lat": -1.2, "lon": 33.2},
                    {"lat": -1.2, "lon": 33.0},
                    {"lat": -1.0, "lon": 33.0},
                ],
            },
            {
                "type": "way",
                "role": "outer",
                "geometry": [
                    {"lat": -1.05, "lon": 33.05},
                    {"lat": -1.05, "lon": 33.06},
                    {"lat": -1.06, "lon": 33.06},
                    {"lat": -1.06, "lon": 33.05},
                    {"lat": -1.05, "lon": 33.05},
                ],
            },
        ],
    }
    body = _normalize(element)
    assert body is not None
    assert body.id == "relation/2606941"
    assert body.name == "Lake Victoria"
    assert body.kind == "lake"
    # The larger outer ring wins.
    assert body.area_km2 is not None and body.area_km2 > 100


def test_normalize_way_still_supported():
    element = {
        "type": "way",
        "id": 1,
        "tags": {"natural": "water"},
        "geometry": [
            {"lat": 0.0, "lon": 0.0},
            {"lat": 0.0, "lon": 0.01},
            {"lat": 0.01, "lon": 0.01},
            {"lat": 0.01, "lon": 0.0},
            {"lat": 0.0, "lon": 0.0},
        ],
    }
    body = _normalize(element)
    assert body is not None and body.id == "way/1"


def test_normalize_rejects_degenerate_geometry():
    assert _normalize({"type": "way", "id": 2, "geometry": []}) is None
    assert _normalize({"type": "relation", "id": 3, "members": []}) is None


# --- Overpass mirror resilience ---------------------------------------------


@respx.mock
async def test_overpass_uses_first_mirror_that_answers_concurrently():
    """A stalled mirror must not delay a healthy one.

    The mirrors are queried in parallel, so the first success wins even when an
    earlier mirror in the list is unreachable. This pins the latency fix: with
    sequential mirror attempts a stalled host would burn the whole budget.
    """
    respx.post(OVERPAST).mock(side_effect=httpx.ConnectError("mirror down"))
    respx.post(MIRROR_KUMI).mock(
        return_value=httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "way",
                        "id": 77,
                        "tags": {"natural": "water", "name": "Fast mirror lake"},
                        "geometry": [
                            {"lat": -1.0, "lon": 33.0},
                            {"lat": -1.0, "lon": 33.01},
                            {"lat": -1.01, "lon": 33.01},
                            {"lat": -1.01, "lon": 33.0},
                            {"lat": -1.0, "lon": 33.0},
                        ],
                    }
                ]
            },
        )
    )
    respx.post(MIRROR_COFFEE).mock(side_effect=httpx.ConnectError("mirror down"))

    result = await water_bodies.find_water_bodies(POINT, radius_m=10_000, limit=10)
    assert result.service_reachable is True
    assert result.count == 1
    assert result.bodies[0].name == "Fast mirror lake"


@respx.mock
async def test_water_body_lookup_is_cached_across_callers():
    """A second caller with the same parameters must not re-query Overpass.

    The presence panel, the flood screen and the report all look up the same
    coordinates; caching keeps that to one provider round-trip.
    """
    route = respx.post(OVERPAST).mock(
        return_value=httpx.Response(200, json={"elements": []})
    )
    respx.post(MIRROR_KUMI).mock(return_value=httpx.Response(200, json={"elements": []}))
    respx.post(MIRROR_COFFEE).mock(return_value=httpx.Response(200, json={"elements": []}))

    first = await water_bodies.find_water_bodies(POINT, radius_m=10_000, limit=40)
    calls_after_first = route.call_count
    # A different limit must still be served from the same cached lookup.
    second = await water_bodies.find_water_bodies(POINT, radius_m=10_000, limit=25)

    assert route.call_count == calls_after_first
    assert second.service_reachable is True
    assert first.count == second.count == 0


@respx.mock
async def test_cached_result_reports_its_own_lookup_radius():
    """A cached result must report the radius it was built for.

    Different callers use different radii (presence 10 km, atlas 15 km). If a
    cached 15 km result were served to a 10 km caller, reporting the caller's
    radius would overstate the searched area, so the result carries its own.
    """
    respx.post(OVERPAST).mock(return_value=httpx.Response(200, json={"elements": []}))
    respx.post(MIRROR_KUMI).mock(return_value=httpx.Response(200, json={"elements": []}))
    respx.post(MIRROR_COFFEE).mock(return_value=httpx.Response(200, json={"elements": []}))

    first = await water_bodies.find_water_bodies(POINT, radius_m=15_000, limit=25)
    second = await water_bodies.find_water_bodies(POINT, radius_m=10_000, limit=25)

    assert first.lookup_radius_m == 15_000
    assert second.lookup_radius_m == 10_000


# --- Water presence ---------------------------------------------------------


@respx.mock
async def test_presence_detects_mapped_water():
    mock_overpass(
        return_value=httpx.Response(
            200,
            json={
                "elements": [
                    {
                        "type": "way",
                        "id": 10,
                        "tags": {"natural": "water", "name": "Pond"},
                        "geometry": [
                            {"lat": -1.0, "lon": 33.0},
                            {"lat": -1.0, "lon": 33.01},
                            {"lat": -1.01, "lon": 33.01},
                            {"lat": -1.01, "lon": 33.0},
                            {"lat": -1.0, "lon": 33.0},
                        ],
                    }
                ]
            },
        )
    )
    respx.post(STAC_URL).mock(return_value=httpx.Response(200, json={"features": []}))

    result = await water_presence.assess_water_presence(POINT)
    assert result.status == "water_detected"
    assert any(o.detected is True for o in result.observations)


@respx.mock
async def test_presence_missing_coverage_is_not_absence():
    """Both sources failing must yield insufficient_evidence, never no_water."""
    mock_overpass(return_value=httpx.Response(504))
    respx.post(STAC_URL).mock(return_value=httpx.Response(500))

    result = await water_presence.assess_water_presence(POINT)
    assert result.status == "insufficient_evidence"
    assert result.status != "no_water_detected"


@respx.mock
async def test_presence_empty_mapping_with_imagery_is_no_water():
    mock_overpass(
        return_value=httpx.Response(200, json={"elements": []})
    )
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "S2A_1",
                        "collection": "sentinel-2-l2a",
                        "bbox": [33.0, -1.1, 33.1, -1.0],
                        "properties": {"datetime": "2026-09-01T10:00:00Z"},
                    }
                ]
            },
        )
    )
    result = await water_presence.assess_water_presence(POINT)
    assert result.status == "no_water_detected"
    # Imagery availability is recorded but never as a water detection.
    imagery = [o for o in result.observations if o.source_id == "cdse_stac"]
    assert imagery and imagery[0].detected is None


# --- Flood evidence ---------------------------------------------------------


def _archive_payload(values: list[float | None]) -> dict:
    return {
        "daily": {
            "time": [f"2026-09-{i + 1:02d}" for i in range(len(values))],
            "precipitation_sum": values,
        }
    }


@respx.mock
async def test_flood_evidence_reports_rainfall_signal_not_flood():
    respx.get(ARCHIVE_URL).mock(
        return_value=httpx.Response(
            200,
            json=_archive_payload([30.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
        )
    )
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))
    mock_overpass(return_value=httpx.Response(200, json={"elements": []}))

    result = await flood_evidence.assess_flood_evidence(POINT)
    assert result.status == "heavy_rainfall_signal"
    heavy = next(i for i in result.items if i.key == "observed_heavy_rainfall")
    assert heavy.evidence_type == "rainfall_signal"
    assert heavy.value == 1.0
    assert "not proof" in result.detail.lower() or "not evidence" in result.detail.lower()
    assert "warning" in result.disclaimer.lower()


@respx.mock
async def test_flood_evidence_insufficient_when_all_sources_fail():
    for url in (ARCHIVE_URL, FORECAST_URL, FLOOD_URL):
        respx.get(url).mock(return_value=httpx.Response(500))
    mock_overpass(return_value=httpx.Response(500))

    result = await flood_evidence.assess_flood_evidence(POINT)
    assert result.status == "insufficient_data"


@respx.mock
async def test_flood_surface_water_context_is_unavailable_not_zero_when_service_fails():
    """A failed mapping lookup must not be reported as "0 features observed".

    The count is only an observation when the mapping service answered. When it
    did not, the item must be explicitly unavailable with a null value, so the
    UI and the report cannot present a service outage as a measured zero.
    """
    respx.get(ARCHIVE_URL).mock(
        return_value=httpx.Response(200, json=_archive_payload([0.0] * 14))
    )
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))
    mock_overpass(return_value=httpx.Response(504))

    result = await flood_evidence.assess_flood_evidence(POINT)
    item = next(i for i in result.items if i.key == "surface_water_context")
    assert item.status == "unavailable"
    assert item.value is None
    assert any("could not be reached" in lim.lower() for lim in item.limitations)


# --- Change detection -------------------------------------------------------


@respx.mock
async def test_change_detection_comparable_pair():
    features = [
        {
            "id": f"S2_{i}",
            "collection": "sentinel-2-l2a",
            "bbox": [33.0, -1.1, 33.1, -1.0],
            "properties": {"datetime": dt, "eo:cloud_cover": 5},
        }
        for i, dt in enumerate(["2026-04-01T10:00:00Z", "2026-07-01T10:00:00Z"])
    ]
    respx.post(STAC_URL).mock(return_value=httpx.Response(200, json={"features": features}))
    respx.post(CMR_URL).mock(return_value=httpx.Response(200, json={"features": []}))

    result = await change_detection.detect_change(POINT)
    assert result.comparable is True
    assert result.earlier is not None and result.later is not None
    assert result.earlier.acquired_at < result.later.acquired_at
    assert result.limitations  # comparability conditions are stated


@respx.mock
async def test_change_detection_not_comparable_with_one_scene():
    features = [
        {
            "id": "S2_only",
            "collection": "sentinel-2-l2a",
            "bbox": [33.0, -1.1, 33.1, -1.0],
            "properties": {"datetime": "2026-07-01T10:00:00Z", "eo:cloud_cover": 5},
        }
    ]
    respx.post(STAC_URL).mock(return_value=httpx.Response(200, json={"features": features}))
    respx.post(CMR_URL).mock(return_value=httpx.Response(200, json={"features": []}))

    result = await change_detection.detect_change(POINT)
    assert result.comparable is False
    assert "cannot be formed" in result.comparability_note or "Only one" in result.comparability_note


# --- Outlook ----------------------------------------------------------------


@respx.mock
async def test_outlook_signals_are_forecast_classified():
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": [f"2026-10-{i + 1:02d}" for i in range(14)],
                    "precipitation_sum": [0.0] * 7 + [25.0] * 3 + [0.0] * 4,
                }
            },
        )
    )
    result = await outlook.build_outlook(POINT)
    keys = {s.key for s in result.signals}
    assert "forecast_accumulation" in keys
    heavy = next(s for s in result.signals if s.key == "forecast_heavy_days")
    assert heavy.value == 3.0
    assert all(s.classification.value in {"forecast", "derived"} for s in result.signals)
    # A rainy run is identified from consecutive forecast days.
    assert any(p.kind == "rainy" for p in result.rainy_periods)


# --- API routes -------------------------------------------------------------


@respx.mock
async def test_new_routes_return_typed_payloads():
    from app.main import app

    mock_overpass(return_value=httpx.Response(200, json={"elements": []}))
    respx.post(STAC_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    respx.post(CMR_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    respx.get(ARCHIVE_URL).mock(return_value=httpx.Response(500))
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for path in (
            "/api/v1/water/presence?latitude=-1.0&longitude=33.0",
            "/api/v1/water/bodies/summary?latitude=-1.0&longitude=33.0",
            "/api/v1/flood/evidence?latitude=-1.0&longitude=33.0",
            "/api/v1/change/detection?latitude=-1.0&longitude=33.0",
            "/api/v1/outlook?latitude=-1.0&longitude=33.0",
        ):
            response = await client.get(path)
            assert response.status_code == 200, path
            assert isinstance(response.json(), dict)

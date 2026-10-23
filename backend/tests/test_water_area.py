"""Contract tests for the water area-selection route.

Regression guard for the `POST /api/v1/water/area` 404: the route must be
registered under the `/api/v1` prefix the frontend client actually calls, and a
valid ring must return a validated selection rather than a 404. These tests
pin the exact path so a router that is included without its prefix (or not
included at all) fails here instead of only at runtime.
"""
from __future__ import annotations

import httpx
import pytest

from app.main import app

# The path the frontend's `api.selectArea` issues (see frontend/src/lib/api.ts).
AREA_PATH = "/api/v1/water/area"

RING = [[3.3, 6.4], [3.5, 6.4], [3.5, 6.5], [3.3, 6.5], [3.3, 6.4]]


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def test_water_area_route_is_registered_at_the_v1_prefix():
    # A bare `/water/area` (missing the /api/v1 prefix) is exactly the mismatch
    # that produced the observed 404, so assert the prefixed path is present.
    paths = set(app.openapi()["paths"])
    assert AREA_PATH in paths
    assert "/water/area" not in paths
    assert "post" in app.openapi()["paths"][AREA_PATH]


async def test_water_area_post_is_not_a_404(client):
    r = await client.post(AREA_PATH, json={"coordinates": RING})
    assert r.status_code == 200, r.text


async def test_water_area_returns_a_validated_selection(client):
    r = await client.post(AREA_PATH, json={"coordinates": RING, "label": "Test ring"})
    assert r.status_code == 200, r.text
    body = r.json()
    # A drawn ring resolves to its centroid; the response must say so honestly.
    assert body["coverage"] == "bounding_box"
    assert body["area_km2"] > 0
    # The analysis point is the mean of the ring's vertices (the closed ring's
    # repeated first vertex is included), i.e. (3.3+3.5+3.5+3.3+3.3)/5 and
    # (6.4+6.4+6.5+6.5+6.4)/5. Pinned so a change to this is deliberate.
    assert body["analysis_point"]["latitude"] == pytest.approx(6.44, abs=0.001)
    assert body["analysis_point"]["longitude"] == pytest.approx(3.38, abs=0.001)
    assert body["label"] == "Test ring"
    assert body["bbox"]["west"] == pytest.approx(3.3)


async def test_water_area_rejects_a_degenerate_ring_with_422_not_404(client):
    # A bad geometry is a validation problem (422), never a routing miss (404).
    r = await client.post(AREA_PATH, json={"coordinates": [[0, 0], [0, 0], [0, 0]]})
    assert r.status_code == 422, r.text

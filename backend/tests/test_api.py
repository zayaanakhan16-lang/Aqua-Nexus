"""API contract tests.

The app is exercised through httpx's ASGI transport with upstream providers
mocked, so these tests validate routing, validation, response models and error
formatting without any live network dependency.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from app.main import app

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_health(client):
    r = await client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["service"]


async def test_readiness_lists_providers(client):
    r = await client.get("/api/v1/readiness")
    assert r.status_code == 200
    ids = {p["provider_id"] for p in r.json()["providers"]}
    assert {"open_meteo_archive", "nasa_power", "cdse_stac"} <= ids


async def test_providers_catalog_documents_attribution(client):
    r = await client.get("/api/v1/providers")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 6
    for p in body["providers"]:
        assert p["classification"]
        assert p["limitations"] is not None


@respx.mock
async def test_geocode_endpoint(client):
    respx.get(GEOCODE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 1,
                        "name": "Cairo",
                        "latitude": 30.06,
                        "longitude": 31.25,
                        "country": "Egypt",
                        "country_code": "EG",
                    }
                ]
            },
        )
    )
    r = await client.get("/api/v1/geocode", params={"q": "Cairo"})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert body["results"][0]["name"] == "Cairo"
    assert body["attribution"]


async def test_geocode_requires_query(client):
    r = await client.get("/api/v1/geocode")
    assert r.status_code == 422


async def test_geocode_rejects_bad_limit(client):
    r = await client.get("/api/v1/geocode", params={"q": "x", "limit": 999})
    assert r.status_code == 422


@respx.mock
async def test_forecast_series_contract(client):
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-09", "2026-10-10"],
                    "precipitation_sum": [0.0, 3.3],
                }
            },
        )
    )
    r = await client.get(
        "/api/v1/precipitation/forecast", params={"latitude": 10, "longitude": 20}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provenance"]["classification"] == "forecast"
    assert body["unit"] == "mm"
    assert len(body["points"]) == 2


@respx.mock
async def test_provider_outage_returns_structured_error(client):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(503))
    r = await client.get(
        "/api/v1/precipitation/forecast", params={"latitude": 10, "longitude": 20}
    )
    assert r.status_code == 502
    body = r.json()
    assert body["error"]["code"] == "provider_error"
    assert "provider" in body["error"]["details"]


async def test_coordinates_are_validated(client):
    r = await client.get(
        "/api/v1/precipitation/forecast", params={"latitude": 200, "longitude": 20}
    )
    assert r.status_code == 422


@respx.mock
async def test_location_summary_degrades_gracefully(client):
    # Archive works; flood and POWER fail. The summary must still be 200 with
    # honest per-provider unavailable states, never fabricated values.
    respx.get(ARCHIVE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": [f"2026-09-{d:02d}" for d in range(1, 31)],
                    "precipitation_sum": [1.0] * 30,
                }
            },
        )
    )
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={"daily": {"time": ["2026-10-09"], "precipitation_sum": [0.5]}},
        )
    )
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))
    respx.get(POWER_URL).mock(return_value=httpx.Response(500))

    r = await client.get(
        "/api/v1/location/summary", params={"latitude": 10, "longitude": 20}
    )
    assert r.status_code == 200
    body = r.json()
    statuses = {p["provider_id"]: p["status"] for p in body["providers"]}
    assert statuses["open_meteo_flood"] == "unavailable"
    assert statuses["nasa_power"] == "unavailable"
    assert statuses["open_meteo_archive"] in {"ok", "partial"}
    # The summary must not silently invent a discharge ratio.
    keys = {i["key"]: i for i in body["indicators"]}
    assert keys["river_discharge_ratio"]["status"] == "unavailable"


@respx.mock
async def test_stac_scenes_endpoint(client):
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "SCENE1",
                        "collection": "sentinel-2-l2a",
                        "properties": {"datetime": "2024-06-29T10:20:21Z"},
                    }
                ]
            },
        )
    )
    r = await client.get(
        "/api/v1/satellite/scenes", params={"latitude": 52.5, "longitude": 13.4}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    assert "not yet" in body["note"].lower()

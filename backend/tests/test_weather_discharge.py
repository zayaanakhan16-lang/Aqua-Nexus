"""Weather and river-discharge endpoint contract tests (providers mocked)."""
from __future__ import annotations

import httpx
import pytest
import respx

from app.main import app

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@respx.mock
async def test_weather_endpoint_normalizes_current_and_daily(client):
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "current": {
                    "time": "2026-10-12T09:00",
                    "temperature_2m": 14.2,
                    "apparent_temperature": 13.1,
                    "relative_humidity_2m": 71,
                    "precipitation": 0.0,
                    "wind_speed_10m": 12.4,
                    "weather_code": 3,
                },
                "daily": {
                    "time": ["2026-10-12", "2026-10-13"],
                    "temperature_2m_max": [16.0, 15.5],
                    "temperature_2m_min": [8.1, 7.9],
                    "precipitation_sum": [0.0, 2.4],
                    "wind_speed_10m_max": [20.0, 22.5],
                    "weather_code": [3, 61],
                },
            },
        )
    )
    r = await client.get("/api/v1/weather", params={"latitude": 52.5, "longitude": 13.4})
    assert r.status_code == 200
    body = r.json()
    assert body["provenance"]["classification"] == "forecast"
    assert body["current"]["temperature_c"] == 14.2
    assert len(body["daily"]) == 2
    assert body["daily"][1]["precipitation_sum_mm"] == 2.4


@respx.mock
async def test_weather_handles_missing_current(client):
    # Only daily data present: current must be null, not a fabricated value.
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-12"],
                    "temperature_2m_max": [16.0],
                    "temperature_2m_min": [8.0],
                    "precipitation_sum": [0.0],
                    "wind_speed_10m_max": [20.0],
                    "weather_code": [0],
                }
            },
        )
    )
    r = await client.get("/api/v1/weather", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 200
    assert r.json()["current"] is None


@respx.mock
async def test_weather_provider_failure_is_structured(client):
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(503))
    r = await client.get("/api/v1/weather", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 502
    assert r.json()["error"]["code"] == "provider_error"


@respx.mock
async def test_discharge_endpoint_normalizes_series(client):
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-10", "2026-10-11"],
                    "river_discharge": [120.5, 131.0],
                    "river_discharge_mean": [118.0, 128.0],
                    "river_discharge_median": [117.0, 127.5],
                }
            },
        )
    )
    r = await client.get("/api/v1/discharge", params={"latitude": 6.45, "longitude": 3.39})
    assert r.status_code == 200
    body = r.json()
    assert body["unit"] == "m3/s"
    assert body["provenance"]["classification"] == "simulation"
    assert body["valid_days"] == 2
    assert body["points"][1]["discharge_m3s"] == 131.0


@respx.mock
async def test_discharge_null_days_are_preserved(client):
    # A modelled river may have null values; they must stay null, never become 0.
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-10", "2026-10-11"],
                    "river_discharge": [None, 42.0],
                    "river_discharge_mean": [None, 40.0],
                    "river_discharge_median": [None, 39.0],
                }
            },
        )
    )
    r = await client.get("/api/v1/discharge", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["points"][0]["discharge_m3s"] is None
    assert body["missing_days"] == 1


@respx.mock
async def test_discharge_unavailable_when_no_values(client):
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(200, json={"daily": {"time": [], "river_discharge": []}})
    )
    r = await client.get("/api/v1/discharge", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "provider_unavailable"

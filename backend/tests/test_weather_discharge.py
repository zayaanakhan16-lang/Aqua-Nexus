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


# --- GloFAS integration: reanalysis vs forecast, ensemble spread, grid cell ----

@respx.mock
async def test_discharge_splits_reanalysis_and_forecast(client):
    """Each point must state whether it is reanalysis/hindcast or forecast.

    The provider uses one variable name for both windows, so the split has to be
    derived from the date relative to today and travel with the point.
    """
    from datetime import date, timedelta

    today = date.today()
    past = (today - timedelta(days=2)).isoformat()
    future = (today + timedelta(days=2)).isoformat()
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "latitude": -0.975,
                "longitude": 33.025,
                "daily": {
                    "time": [past, today.isoformat(), future],
                    "river_discharge": [1.0, 2.0, 3.0],
                    "river_discharge_mean": [1.1, 2.1, 3.1],
                    "river_discharge_median": [1.05, 2.05, 3.05],
                    "river_discharge_max": [1.5, 2.5, 3.5],
                    "river_discharge_min": [0.5, 1.5, 2.5],
                    "river_discharge_p25": [0.9, 1.9, 2.9],
                    "river_discharge_p75": [1.3, 2.3, 3.3],
                },
            },
        )
    )
    r = await client.get("/api/v1/discharge", params={"latitude": -1.0, "longitude": 33.0})
    assert r.status_code == 200
    body = r.json()
    flags = [p["is_forecast"] for p in body["points"]]
    assert flags == [False, True, True]
    assert body["historical_days"] == 1
    assert body["forecast_days"] == 2
    # Provider-resolved grid cell is reported, not silently dropped.
    assert body["grid_cell"]["latitude"] == -0.975
    assert body["grid_resolution_km"] == 5.0
    # Ensemble statistics are carried through for forecast uncertainty display.
    assert body["points"][2]["ensemble_p25_m3s"] == 2.9
    assert body["points"][2]["ensemble_p75_m3s"] == 3.3
    assert body["points"][2]["ensemble_max_m3s"] == 3.5
    assert body["model"] is not None


@respx.mock
async def test_flood_evidence_includes_discharge_series(client):
    """Flood evidence must expose the real GloFAS series, separate from water."""
    from datetime import date, timedelta

    today = date.today()
    past = (today - timedelta(days=1)).isoformat()
    future = (today + timedelta(days=1)).isoformat()
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "latitude": 51.5,
                "longitude": -0.1,
                "daily": {
                    "time": [past, today.isoformat(), future],
                    "river_discharge": [10.0, 12.0, 40.0],
                    "river_discharge_mean": [10.5, 12.5, 20.0],
                    "river_discharge_median": [10.2, 12.2, 19.0],
                    "river_discharge_max": [12.0, 13.0, 55.0],
                    "river_discharge_min": [9.0, 11.0, 30.0],
                    "river_discharge_p25": [10.0, 12.0, 35.0],
                    "river_discharge_p75": [11.0, 12.5, 45.0],
                },
            },
        )
    )
    # Flood evidence also queries rainfall and mapped water; mock them so the
    # test isolates the discharge path instead of hitting the network.
    respx.get("https://archive-api.open-meteo.com/v1/archive").mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-10", "2026-10-11"],
                    "precipitation_sum": [1.0, 2.0],
                }
            },
        )
    )
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-12"],
                    "precipitation_sum": [0.5],
                }
            },
        )
    )
    for url in (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ):
        respx.post(url).mock(return_value=httpx.Response(200, json={"elements": []}))
    r = await client.get("/api/v1/flood/evidence", params={"latitude": 51.5, "longitude": -0.1})
    assert r.status_code == 200
    body = r.json()
    series = body["discharge"]
    assert series is not None
    # today is treated as forecast, so only the day before it is historical.
    assert series["historical_days"] == 1
    assert series["forecast_days"] == 2
    keys = {i["key"] for i in body["items"]}
    assert "modelled_discharge_reanalysis" in keys
    assert "modelled_discharge_forecast" in keys
    assert "modelled_discharge_ensemble_spread" in keys
    # Discharge evidence is modelled: raw peaks are ``simulation`` and the
    # ratios/spread computed from them are ``derived``. Neither may ever be
    # labelled as an observation or a forecast measurement.
    by_key = {i["key"]: i for i in body["items"] if i["evidence_type"] == "discharge_signal"}
    assert by_key["modelled_discharge_reanalysis"]["classification"] == "simulation"
    assert by_key["modelled_discharge_forecast"]["classification"] == "simulation"
    assert by_key["modelled_discharge_ratio"]["classification"] == "derived"
    assert by_key["modelled_discharge_ensemble_spread"]["classification"] == "derived"
    for item in by_key.values():
        assert item["classification"] in {"simulation", "derived"}


@pytest.mark.live
async def test_live_flood_api_returns_real_discharge(client):
    """Integration test against the REAL Open-Meteo Flood API (GloFAS).

    No mocks: this exercises the actual provider response shape. Skipped when the
    network is unavailable so the suite stays green offline, but it is a genuine
    end-to-end check of the integration when run.
    """
    try:
        r = await client.get(
            "/api/v1/discharge",
            params={"latitude": -1.0, "longitude": 33.0, "days": 7, "past_days": 7},
        )
    except (httpx.HTTPError, OSError) as exc:  # pragma: no cover - offline
        pytest.skip(f"Live flood API unreachable: {exc}")
    if r.status_code == 503:
        pytest.skip("Live flood API returned no coverage for this point.")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["unit"] == "m3/s"
    assert body["provenance"]["classification"] == "simulation"
    assert body["points"], "real API returned no discharge points"
    assert body["historical_days"] + body["forecast_days"] == len(body["points"])
    # A real provider-resolved grid cell must be present.
    assert body["grid_cell"] is not None
    assert body["grid_resolution_km"] == 5.0
    # At least one value must be a real number (not null), proving live data.
    assert any(p["discharge_m3s"] is not None for p in body["points"])

"""AI analysis endpoint tests.

Upstream data providers and the AI provider are both mocked, so these tests
validate the evidence-package assembly, the narrative parsing, and the honest
unconfigured/unavailable states without any live network or credential.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from app.config import get_settings
from app.main import app

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _mock_data_providers() -> None:
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
            json={
                "current": {
                    "time": "2026-10-12T09:00",
                    "temperature_2m": 14.2,
                    "wind_speed_10m": 12.4,
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
    respx.get(POWER_URL).mock(return_value=httpx.Response(500))
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "SCENE1",
                        "collection": "sentinel-2-l2a",
                        "properties": {"datetime": "2026-06-29T10:20:21Z"},
                    }
                ]
            },
        )
    )


@respx.mock
async def test_ai_analysis_unconfigured_returns_evidence_only(client, monkeypatch):
    # With no AI credential the endpoint must be honest: unconfigured status,
    # no narrative, but a real evidence package.
    monkeypatch.delenv("AQUANEXUS_AI_API_KEY", raising=False)
    get_settings.cache_clear()
    _mock_data_providers()

    r = await client.get(
        "/api/v1/ai/analysis", params={"latitude": 10, "longitude": 20, "label": "Test"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "unconfigured"
    assert body["narrative"] is None
    assert body["message"]
    assert len(body["evidence"]["observations"]) > 0
    # The evidence package must be real: each observation carries a source, and
    # any non-null value carries a unit.
    for obs in body["evidence"]["observations"]:
        assert obs["source"]
        if obs["value"] is not None:
            assert obs["unit"]
    assert body["evidence"]["available"]


@respx.mock
async def test_ai_analysis_ok_uses_grounded_evidence(client, monkeypatch):
    monkeypatch.setenv("AQUANEXUS_AI_API_KEY", "test-key")
    monkeypatch.setenv("AQUANEXUS_AI_MODEL", "test-model")
    get_settings.cache_clear()
    _mock_data_providers()

    fake = {
        "situation_summary": "The reanalysis window is near normal.",
        "observed_conditions": ["Rainfall anomaly -12.0 mm"],
        "recent_changes": ["Below prior-year rainfall"],
        "potential_concerns": ["A rainfall deficit is present"],
        "confidence_and_limitations": ["Reanalysis, not gauge measurements"],
        "investigate_next": ["Local gauge records"],
        "recommended_next_steps": ["Continue monitoring"],
    }

    async def _fake_complete(**_kwargs):
        return fake

    monkeypatch.setattr("app.providers.ai.complete_json", _fake_complete)

    r = await client.get("/api/v1/ai/analysis", params={"latitude": 6.45, "longitude": 3.39})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["model"] == "test-model"
    assert body["narrative"]["situation_summary"].startswith("The reanalysis")
    assert body["narrative"]["potential_concerns"]
    # Evidence must carry classification and units, never bare numbers.
    for obs in body["evidence"]["observations"]:
        assert "source" in obs
        if obs["value"] is not None:
            assert obs["unit"] is not None


@respx.mock
async def test_ai_analysis_provider_failure_is_unavailable(client, monkeypatch):
    monkeypatch.setenv("AQUANEXUS_AI_API_KEY", "test-key")
    get_settings.cache_clear()
    _mock_data_providers()

    async def _boom(**_kwargs):
        from app.errors import ProviderError

        raise ProviderError("upstream failed")

    monkeypatch.setattr("app.providers.ai.complete_json", _boom)

    r = await client.get("/api/v1/ai/analysis", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "unavailable"
    assert body["narrative"] is None
    # The evidence package must survive a narrative failure.
    assert len(body["evidence"]["observations"]) > 0


@respx.mock
async def test_ai_analysis_narrative_drops_malformed_fields(client, monkeypatch):
    monkeypatch.setenv("AQUANEXUS_AI_API_KEY", "test-key")
    get_settings.cache_clear()
    _mock_data_providers()

    # A malformed model response (wrong types, non-string list items) must
    # degrade to a valid, mostly-empty narrative rather than crashing.
    async def _weird(**_kwargs):
        return {
            "situation_summary": 123,
            "observed_conditions": ["ok", 5, None, "  "],
            "recent_changes": "not a list",
            "unknown_key": "ignored",
        }

    monkeypatch.setattr("app.providers.ai.complete_json", _weird)

    r = await client.get("/api/v1/ai/analysis", params={"latitude": 1, "longitude": 2})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["narrative"]["situation_summary"] == ""
    assert body["narrative"]["observed_conditions"] == ["ok"]
    assert body["narrative"]["recent_changes"] == []

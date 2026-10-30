"""Groq AI provider configuration and fallback tests.

These tests cover the credential resolution rules (Groq preferred, generic
OpenAI-compatible endpoint only as an explicit alternative) and the honest
failure states. All network calls are mocked, so no live credential or network
access is required.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from app.config import get_settings
from app.errors import ProviderError, ProviderUnconfiguredError
from app.providers import ai as ai_provider

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"


@pytest.fixture(autouse=True)
def _clear_ai_env(monkeypatch):
    """Start every test from a known, credential-free state."""
    for var in (
        "GROQ_API_KEY",
        "GROQ_MODEL",
        "AQUANEXUS_GROQ_API_KEY",
        "AQUANEXUS_GROQ_MODEL",
        "AQUANEXUS_AI_API_KEY",
        "AQUANEXUS_AI_BASE_URL",
        "AQUANEXUS_AI_MODEL",
    ):
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_unprefixed_groq_api_key_is_read(monkeypatch):
    # The conventional, unprefixed GROQ_API_KEY must work without an
    # AquaNexus-specific variable, despite the AQUANEXUS_ env prefix.
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.groq_api_key == "gsk-test"
    assert settings.resolved_ai_provider() == (
        "groq",
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-120b",
    )
    assert settings.provider_configured("ai_analysis") is True


def test_prefixed_groq_api_key_alias_also_works(monkeypatch):
    monkeypatch.setenv("AQUANEXUS_GROQ_API_KEY", "gsk-prefixed")
    get_settings.cache_clear()
    assert get_settings().groq_api_key == "gsk-prefixed"


def test_groq_model_override_is_respected(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    monkeypatch.setenv("GROQ_MODEL", "openai/gpt-oss-120b")
    get_settings.cache_clear()
    assert get_settings().resolved_ai_provider()[2] == "openai/gpt-oss-120b"


def test_groq_takes_precedence_over_generic_endpoint(monkeypatch):
    # A deployment that sets both must not silently fall back to the generic
    # endpoint; Groq wins.
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    monkeypatch.setenv("AQUANEXUS_AI_API_KEY", "sk-generic")
    monkeypatch.setenv("AQUANEXUS_AI_MODEL", "gpt-4o-mini")
    get_settings.cache_clear()
    resolved = get_settings().resolved_ai_provider()
    assert resolved[0] == "groq"
    assert resolved[2] == "openai/gpt-oss-120b"
    assert get_settings().ai_credential() == "gsk-test"
    assert ai_provider.provider_name() == "Groq"


def test_no_credentials_reports_unconfigured(monkeypatch):
    get_settings.cache_clear()
    assert get_settings().resolved_ai_provider() is None
    assert ai_provider.is_configured() is False
    assert get_settings().provider_configured("ai_analysis") is False


async def test_complete_json_without_credential_raises_unconfigured():
    with pytest.raises(ProviderUnconfiguredError):
        await ai_provider.complete_json(
            system_prompt="s", user_payload={}, schema_hint={}
        )



@respx.mock
async def test_complete_json_posts_to_groq_endpoint(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    route = respx.post(GROQ_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": '{"situation_summary": "ok"}'}}
                ]
            },
        )
    )
    result = await ai_provider.complete_json(
        system_prompt="s", user_payload={"a": 1}, schema_hint={}
    )
    assert route.called
    assert result == {"situation_summary": "ok"}
    # The credential must travel as a bearer token, never in the body.
    request = route.calls[0].request
    assert request.headers["authorization"] == "Bearer gsk-test"
    assert b"gsk-test" not in request.content


@respx.mock
async def test_generic_endpoint_used_when_only_ai_key_set(monkeypatch):
    monkeypatch.setenv("AQUANEXUS_AI_API_KEY", "sk-generic")
    get_settings.cache_clear()
    route = respx.post(OPENAI_URL).mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": "{}"}}]}
        )
    )
    await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})
    assert route.called


@respx.mock
async def test_groq_rate_limit_is_reported_as_provider_error(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    respx.post(GROQ_URL).mock(return_value=httpx.Response(429, json={"error": "slow down"}))
    with pytest.raises(ProviderError) as exc:
        await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})
    assert exc.value.details.get("status") == 429
    # The upstream body must never be echoed back to the caller.
    assert "slow down" not in exc.value.message


@respx.mock
async def test_groq_rejected_credential_is_unconfigured(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-bad")
    get_settings.cache_clear()
    respx.post(GROQ_URL).mock(return_value=httpx.Response(401, json={"error": "invalid"}))
    with pytest.raises(ProviderUnconfiguredError):
        await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})


@respx.mock
async def test_groq_invalid_json_is_provider_error(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    respx.post(GROQ_URL).mock(
        return_value=httpx.Response(
            200, json={"choices": [{"message": {"content": "not json at all"}}]}
        )
    )
    with pytest.raises(ProviderError):
        await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})


@respx.mock
async def test_groq_timeout_is_provider_error(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    respx.post(GROQ_URL).mock(side_effect=httpx.ConnectTimeout("timed out"))
    with pytest.raises(ProviderError):
        await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})


@respx.mock
async def test_reasoning_think_block_is_stripped_before_parsing(monkeypatch):
    # A reasoning model (e.g. Qwen 3) may prefix the answer with a  thinking
    # block. The JSON inside must still be extracted rather than failing.
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    content = (
        " thinking\nWeighing the rainfall anomaly before answering.\n</think>\n"
        '{"situation_summary": "Below-baseline rainfall."}'
    )
    respx.post(GROQ_URL).mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": content}}]})
    )
    result = await ai_provider.complete_json(
        system_prompt="s", user_payload={}, schema_hint={}
    )
    assert result == {"situation_summary": "Below-baseline rainfall."}


@respx.mock
async def test_json_fenced_answer_is_parsed(monkeypatch):
    # A model that wraps its answer in a Markdown code fence must still work.
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    content = '```json\n{"situation_summary": "ok", "observed_conditions": []}\n```'
    respx.post(GROQ_URL).mock(
        return_value=httpx.Response(200, json={"choices": [{"message": {"content": content}}]})
    )
    result = await ai_provider.complete_json(
        system_prompt="s", user_payload={}, schema_hint={}
    )
    assert result["situation_summary"] == "ok"


@respx.mock
async def test_json_object_mode_rejected_falls_back(monkeypatch):
    # If the model rejects response_format=json_object, the provider retries
    # once without it and still returns the parsed object.
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    get_settings.cache_clear()
    route = respx.post(GROQ_URL).mock(
        side_effect=[
            httpx.Response(400, json={"error": {"message": "response_format is not supported"}}),
            httpx.Response(
                200, json={"choices": [{"message": {"content": '{"situation_summary": "ok"}'}}]}
            ),
        ]
    )
    result = await ai_provider.complete_json(
        system_prompt="s", user_payload={}, schema_hint={}
    )
    assert result == {"situation_summary": "ok"}
    assert route.call_count == 2
    # The retry must not send response_format, and must not leak the credential.
    retry_body = route.calls[1].request.content
    assert b"response_format" not in retry_body
    assert b"gsk-test" not in retry_body


@respx.mock
async def test_unknown_model_reports_actionable_error(monkeypatch):
    # An unrecognised model id must produce a clear, non-secret message that
    # names GROQ_MODEL instead of a bare "HTTP 400".
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    get_settings.cache_clear()
    respx.post(GROQ_URL).mock(
        return_value=httpx.Response(
            400,
            json={"error": {"message": "The model `llama-3.3-70b-versatile` does not exist"}},
        )
    )
    with pytest.raises(ProviderError) as exc:
        await ai_provider.complete_json(system_prompt="s", user_payload={}, schema_hint={})
    assert "GROQ_MODEL" in exc.value.message
    assert exc.value.details.get("model") == "llama-3.3-70b-versatile"
    assert "gsk-test" not in exc.value.message


# --- End-to-end endpoint behaviour -----------------------------------------

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"


@pytest.fixture
async def client():
    from app.main import app

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
                "current": {"time": "2026-10-12T09:00", "temperature_2m": 14.2, "wind_speed_10m": 12.4},
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
        return_value=httpx.Response(200, json={"features": [{"id": "S1", "properties": {"datetime": "2026-06-29T10:20:21Z"}}]})
    )

    # Local water-intelligence sources are now part of the evidence package, so
    # the Overpass mirrors must be mocked too (all of them, so a fall-through
    # cannot escape the mock router).
    for mirror in (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ):
        respx.post(mirror).mock(
            return_value=httpx.Response(200, json={"elements": []})
        )



@respx.mock
async def test_endpoint_reports_groq_and_grounds_the_narrative(client, monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "gsk-test")
    monkeypatch.setenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    get_settings.cache_clear()
    _mock_data_providers()

    captured: dict = {}

    async def _fake_complete(**kwargs):
        captured.update(kwargs)
        return {
            "situation_summary": "Below-baseline rainfall in the reanalysis window.",
            "observed_conditions": ["Rainfall anomaly -12.0 mm"],
            "recent_changes": [],
            "potential_concerns": [],
            "confidence_and_limitations": ["Reanalysis, not gauge data"],
            "investigate_next": ["Local gauge records"],
            "recommended_next_steps": [],
        }

    monkeypatch.setattr("app.providers.ai.complete_json", _fake_complete)

    r = await client.get("/api/v1/ai/analysis", params={"latitude": 6.45, "longitude": 3.39})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["provider"] == "Groq"
    assert body["model"] == "llama-3.3-70b-versatile"
    # The prompt the model received must contain the real evidence values, so
    # the narrative is grounded rather than free-form.
    payload = captured["user_payload"]
    assert payload["observations"]
    assert all(o["source"] for o in payload["observations"])


@respx.mock
async def test_report_still_works_without_ai(client, monkeypatch):
    # The core report generator must remain functional with no AI credential,
    # using a factual, non-AI summary instead of a model narrative.
    _mock_data_providers()
    r = await client.post(
        "/api/v1/reports",
        json={"latitude": 6.45, "longitude": 3.39, "window_days": 30, "include_ai": True},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 5000


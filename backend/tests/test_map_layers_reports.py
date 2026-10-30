"""Contract tests for the map-layer catalog and report generation routes.

The upstream providers are mocked with respx so the tests are deterministic.
They assert the two properties that matter for judging: a layer/report is only
advertised when the backend can actually deliver it, and one unavailable
provider degrades a report instead of failing it.
"""
from __future__ import annotations

import httpx
import pytest
import respx

from app.main import app

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"
GIBS_HOST = "https://gibs.earthdata.nasa.gov"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _archive_response(request: httpx.Request) -> httpx.Response:
    """Return a plausible daily series for whichever window/variables were asked."""
    from datetime import date as _date, timedelta as _td

    params = request.url.params
    start = _date.fromisoformat(params["start_date"])
    end = _date.fromisoformat(params["end_date"])
    days = (end - start).days + 1
    times = [(start + _td(days=i)).isoformat() for i in range(days)]
    requested = set((params.get("daily") or "").split(","))
    daily: dict[str, list] = {"time": times}
    if "precipitation_sum" in requested:
        daily["precipitation_sum"] = [1.5] * days
    if "temperature_2m_mean" in requested:
        daily["temperature_2m_mean"] = [12.0] * days
    if "temperature_2m_max" in requested:
        daily["temperature_2m_max"] = [18.0] * days
    return httpx.Response(200, json={"daily": daily})


def _mock_all_providers() -> None:
    respx.get(ARCHIVE_URL).mock(side_effect=_archive_response)
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2026-10-12", "2026-10-13"],
                    "precipitation_sum": [0.4, 1.1],
                }
            },
        )
    )
    respx.get(FLOOD_URL).mock(
        return_value=httpx.Response(
            200,
            json={"daily": {"time": ["2026-10-12"], "river_discharge": [12.0]}},
        )
    )
    respx.get(POWER_URL).mock(return_value=httpx.Response(500))
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(200, json={"features": []})
    )
    # The report now also assembles the local water-intelligence modules, which
    # query OpenStreetMap Overpass. All mirrors are mocked so a fall-through
    # cannot escape the mock router.
    for mirror in (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.private.coffee/api/interpreter",
    ):
        respx.post(mirror).mock(
            return_value=httpx.Response(200, json={"elements": []})
        )


@respx.mock
async def test_report_preview_includes_local_water_intelligence_sections(client):
    """The report must carry the water-presence, outlook and change sections."""
    _mock_all_providers()
    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 6.45, "longitude": 3.39, "include_ai": "false"},
    )
    assert r.status_code == 200
    body = r.json()
    for key in (
        "water_presence_findings",
        "change_detection_findings",
        "outlook_findings",
        "water_bodies_findings",
    ):
        assert key in body, key
        section = body[key]
        assert section is not None, key
        # Each section is either populated with items or honest about why not.
        assert section["available"] or section["unavailable_reason"]
    # The outlook must be labelled as forecast/derived, never as observation.
    outlook = body["outlook_findings"]
    assert outlook["available"] is True
    assert any("forecast" in item.lower() or "modelled" in item.lower() for item in outlook["items"])


@respx.mock
async def test_map_layers_catalog_reports_verified_layers(client):
    # Every layer probe is answered with a real-looking tile body.
    respx.get(url__startswith=f"{GIBS_HOST}/").mock(
        return_value=httpx.Response(200, content=b"\x89PNG\r\n\x1a\nfake")
    )
    r = await client.get("/api/v1/map/layers")
    assert r.status_code == 200
    body = r.json()
    assert body["available_count"] == len(body["layers"])
    assert len(body["layers"]) >= 5

    for layer in body["layers"]:
        # A layer must carry everything a legend and provenance panel needs.
        assert layer["units"]
        assert layer["spatial_resolution"]
        assert layer["source_name"]
        assert layer["legend_note"]
        assert layer["legend"]
        # A served layer must expose a usable tile template.
        assert layer["tile_template"]
        assert "{z}" in layer["tile_template"]
        assert "{x}" in layer["tile_template"]
        assert "{y}" in layer["tile_template"]
        assert layer["max_zoom"] >= 1


@respx.mock
async def test_map_layers_marks_unavailable_layer_instead_of_hiding_it(client):
    # GIBS refuses every probe: the layer must be returned, greyed, with a reason.
    respx.get(url__startswith=f"{GIBS_HOST}/").mock(return_value=httpx.Response(404))
    r = await client.get("/api/v1/map/layers")
    assert r.status_code == 200
    body = r.json()
    assert body["available_count"] == 0
    assert len(body["layers"]) >= 5
    for layer in body["layers"]:
        assert layer["available"] is False
        assert layer["unavailable_reason"]
        assert layer["tile_template"] is None


@respx.mock
async def test_map_layers_verify_false_skips_probing(client):
    # With verify=False no upstream probe should happen; respx would raise on an
    # unmocked call, so this also proves the probe is skipped.
    r = await client.get("/api/v1/map/layers", params={"verify": False})
    assert r.status_code == 200
    assert r.json()["available_count"] == len(r.json()["layers"])


@respx.mock
async def test_report_preview_contains_selected_area_and_real_metrics(client):
    _mock_all_providers()
    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 52.52, "longitude": 13.405, "name": "Berlin", "window_days": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["report_id"].startswith("AQN-")
    assert body["study_area_name"] == "Berlin"
    assert body["location"]["latitude"] == pytest.approx(52.52)
    # The report must reflect the requested window, not a fixed template.
    assert body["window_days"] == 30
    assert body["analysis_start"] < body["analysis_end"]
    # Metrics must be traceable, never bare numbers.
    assert body["metrics"]
    for metric in body["metrics"]:
        assert metric["key"]
        assert metric["label"]
        assert metric["method"]
    # A report must state its own completeness.
    assert body["completeness"] in {"complete", "partial", "minimal"}
    assert body["completeness_note"]


@respx.mock
async def test_report_preview_states_ai_unavailable_without_a_credential(client):
    _mock_all_providers()
    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 10.0, "longitude": 20.0, "window_days": 30},
    )
    assert r.status_code == 200
    body = r.json()
    # No AI key is configured in tests, so the narrative is absent but the
    # evidence-backed sections still exist.
    assert body["ai_generated"] is False
    assert body["ai_interpretation"]["available"] is False
    assert body["ai_interpretation"]["unavailable_reason"]


@respx.mock
async def test_report_preview_degrades_when_optional_providers_fail(client):
    # Archive works; flood and POWER fail; STAC fails. The report must still be
    # produced with the sections it can support.
    respx.get(ARCHIVE_URL).mock(side_effect=_archive_response)
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(503))
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))
    respx.get(POWER_URL).mock(return_value=httpx.Response(500))
    respx.post(STAC_URL).mock(return_value=httpx.Response(500))

    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 10.0, "longitude": 20.0, "window_days": 30},
    )
    assert r.status_code == 200
    body = r.json()
    # A section that lost its evidence must say so rather than be dropped.
    assert body["surface_water_findings"]["available"] is False
    assert body["surface_water_findings"]["unavailable_reason"]
    # Rainfall still has archive evidence.
    assert body["rainfall_findings"]["available"] is True


async def test_report_preview_validates_coordinates(client):
    r = await client.get(
        "/api/v1/reports/preview", params={"latitude": 200, "longitude": 20}
    )
    assert r.status_code == 422


async def test_report_preview_validates_window(client):
    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 10, "longitude": 20, "window_days": 500},
    )
    assert r.status_code == 422


@respx.mock
async def test_generate_report_returns_a_real_pdf(client):
    _mock_all_providers()
    r = await client.post(
        "/api/v1/reports",
        json={"latitude": 52.52, "longitude": 13.405, "name": "Berlin", "window_days": 30},
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    # The artefact must be identifiable and carry its completeness.
    assert r.headers["x-report-id"].startswith("AQN-")
    assert r.headers["x-report-completeness"] in {"complete", "partial", "minimal"}
    assert "attachment" in r.headers["content-disposition"]


async def test_generate_report_rejects_out_of_range_window(client):
    r = await client.post(
        "/api/v1/reports",
        json={"latitude": 10, "longitude": 20, "window_days": 200},
    )
    assert r.status_code == 422


@respx.mock
async def test_report_completeness_is_minimal_when_required_source_fails(client):
    # The required historical precipitation source is down: the report must be
    # labelled minimal rather than silently presented as complete.
    respx.get(ARCHIVE_URL).mock(return_value=httpx.Response(500))
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(500))
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))
    respx.get(POWER_URL).mock(return_value=httpx.Response(500))
    respx.post(STAC_URL).mock(return_value=httpx.Response(500))

    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 10.0, "longitude": 20.0, "window_days": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["completeness"] == "minimal"
    assert "MINIMAL" in body["completeness_note"]


@respx.mock
async def test_report_completeness_is_complete_when_all_sources_return(client):
    # Every source returns usable data: the report may be labelled complete.
    respx.get(ARCHIVE_URL).mock(side_effect=_archive_response)
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
                    "time": ["2026-10-12", "2026-10-13"],
                    "river_discharge": [12.0, 12.5],
                }
            },
        )
    )
    def _power_response(request: httpx.Request) -> httpx.Response:
        from datetime import datetime as _dt, timedelta as _td

        s = _dt.strptime(request.url.params["start"], "%Y%m%d").date()
        e = _dt.strptime(request.url.params["end"], "%Y%m%d").date()
        days = (e - s).days + 1
        series = {
            (s + _td(days=i)).strftime("%Y%m%d"): 1.4 for i in range(days)
        }
        return httpx.Response(
            200, json={"properties": {"parameter": {"PRECTOTCORR": series}}}
        )

    respx.get(POWER_URL).mock(side_effect=_power_response)
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(200, json={"features": []})
    )

    r = await client.get(
        "/api/v1/reports/preview",
        params={"latitude": 10.0, "longitude": 20.0, "window_days": 30},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["completeness"] == "complete"
    assert "COMPLETE" in body["completeness_note"]

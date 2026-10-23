"""NASA HLS (Harmonized Landsat Sentinel-2) discovery tests.

All network calls are mocked, so no Earthdata credential or live network access
is required. These tests pin the two rules that matter most for HLS: it is a
distinct source from Copernicus Sentinel-2, and discovery needs no credential.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
import respx

from app.config import get_settings
from app.errors import ProviderUnavailableError, ValidationError
from app.models.common import BoundingBox
from app.providers import hls

CMR_SEARCH_URL = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search"


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    """No Earthdata credential is present for these tests."""
    for var in (
        "AQUANEXUS_EARTHDATA_USERNAME",
        "AQUANEXUS_EARTHDATA_PASSWORD",
        "AQUANEXUS_EARTHDATA_TOKEN",
    ):
        monkeypatch.delenv(var, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _bbox() -> BoundingBox:
    return BoundingBox(west=36.6, south=-1.4, east=37.0, north=-1.1)


def _window() -> tuple[datetime, datetime]:
    end = datetime(2026, 10, 22, tzinfo=timezone.utc)
    return end - timedelta(days=120), end


def _cmr_payload() -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "id": "HLS.S30.T37MBU.2026184T074031.v2.0",
                "collection": "HLSS30_2.0",
                "bbox": [36.30, -1.90, 37.29, -0.90],
                "properties": {
                    "datetime": "2026-07-03T08:00:41.236Z",
                    "eo:cloud_cover": 4.0,
                },
            },
            {
                "id": "HLS.S30.T37MBU.2026177T073609.v2.0",
                "collection": "HLSS30_2.0",
                "bbox": [36.30, -1.90, 37.29, -0.90],
                "properties": {
                    "datetime": "2026-06-26T08:00:23.182Z",
                    "eo:cloud_cover": 47.0,
                },
            },
        ],
    }


@respx.mock
async def test_search_hls_returns_real_normalized_items():
    start, end = _window()
    route = respx.post(CMR_SEARCH_URL).mock(
        return_value=httpx.Response(200, json=_cmr_payload())
    )
    result = await hls.search_hls(_bbox(), start=start, end=end, collection=hls.COLLECTION_S30)

    assert route.called
    assert result.count == 2
    assert result.provider.status.value == "ok"
    # S30 must be labelled as Sentinel-2 sourced so it is never confused with a
    # native Copernicus scene.
    assert result.data_source == "Sentinel-2 (MSI)"
    assert result.items[0].data_source == "Sentinel-2 (MSI)"
    assert result.items[0].cloud_cover == 4.0
    assert result.items[0].acquired_at is not None
    # The 30 m harmonization caveat is always present.
    assert "30 m" in result.note
    assert "not a like-for-like replacement" in result.note


@respx.mock
async def test_search_hls_l30_is_labelled_landsat():
    start, end = _window()
    respx.post(CMR_SEARCH_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "HLS.L30.T37MBU.2026179T074232.v2.0",
                        "collection": "HLSL30_2.0",
                        "properties": {"datetime": "2026-06-28T07:42:32.115Z"},
                    }
                ]
            },
        )
    )
    result = await hls.search_hls(_bbox(), start=start, end=end, collection=hls.COLLECTION_L30)
    assert result.data_source == "Landsat 8/9 (OLI)"
    assert result.items[0].data_source == "Landsat 8/9 (OLI)"


@respx.mock
async def test_search_hls_uses_no_credential():
    # CMR STAC metadata search is anonymous: no Authorization header is sent and
    # no Earthdata variable is required.
    start, end = _window()
    route = respx.post(CMR_SEARCH_URL).mock(
        return_value=httpx.Response(200, json=_cmr_payload())
    )
    await hls.search_hls(_bbox(), start=start, end=end)
    request = route.calls[0].request
    assert "authorization" not in {k.lower() for k in request.headers.keys()}


async def test_unsupported_collection_is_rejected():
    start, end = _window()
    with pytest.raises(ValidationError):
        await hls.search_hls(_bbox(), start=start, end=end, collection="sentinel-2-l2a")


@respx.mock
async def test_cmr_failure_is_unavailable_not_fabricated():
    start, end = _window()
    respx.post(CMR_SEARCH_URL).mock(return_value=httpx.Response(503))
    with pytest.raises(ProviderUnavailableError):
        await hls.search_hls(_bbox(), start=start, end=end)


@respx.mock
async def test_empty_result_is_unavailable_with_message():
    start, end = _window()
    respx.post(CMR_SEARCH_URL).mock(return_value=httpx.Response(200, json={"features": []}))
    result = await hls.search_hls(_bbox(), start=start, end=end)
    assert result.count == 0
    assert result.provider.status.value == "unavailable"
    assert result.provider.message


# --- Endpoint behaviour -----------------------------------------------------


@pytest.fixture
async def client():
    from app.main import app

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@respx.mock
async def test_hls_endpoint_returns_items(client):
    respx.post(CMR_SEARCH_URL).mock(return_value=httpx.Response(200, json=_cmr_payload()))
    r = await client.get(
        "/api/v1/satellite/hls",
        params={"latitude": -1.28, "longitude": 36.81, "days": 120, "limit": 4},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert body["collection"] == "HLSS30_2.0"
    assert body["items"][0]["id"].startswith("HLS.S30.")


async def test_hls_endpoint_rejects_unknown_collection(client):
    r = await client.get(
        "/api/v1/satellite/hls",
        params={"latitude": -1.28, "longitude": 36.81, "collection": "not-a-collection"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


@respx.mock
async def test_hls_endpoint_reports_unavailable_on_cmr_failure(client):
    respx.post(CMR_SEARCH_URL).mock(return_value=httpx.Response(503))
    r = await client.get(
        "/api/v1/satellite/hls", params={"latitude": -1.28, "longitude": 36.81}
    )
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "provider_unavailable"

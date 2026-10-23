"""Regression tests for the ERA5 vs. MERRA-2 cross-source check.

The audited concern was a large, implausible `cross_check_delta` (e.g. -96%).
The arithmetic is correct; the divergence is real and is caused by NASA POWER
serving its *preliminary* near-real-time (GEOSIT) segment, which NASA itself
marks as subject to revision. The product must therefore withhold the
percentage in that case rather than publish a number that reflects the
product's provisional status.

These tests lock in: (a) the formula and its like-for-like date pairing, and
(b) the honest `insufficient_data` state when the POWER window is preliminary.
"""
from __future__ import annotations

from datetime import date, timedelta

import httpx
import pytest
import respx

from app.main import app

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"


@pytest.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _archive_response(request: httpx.Request) -> httpx.Response:
    params = request.url.params
    start = date.fromisoformat(params["start_date"])
    end = date.fromisoformat(params["end_date"])
    days = (end - start).days + 1
    times = [(start + timedelta(days=i)).isoformat() for i in range(days)]
    return httpx.Response(
        200,
        json={"daily": {"time": times, "precipitation_sum": [1.0] * days}},
    )


def _power_response(sources: list[str], value_mm: float = 1.0):
    """Build a NASA POWER payload for the window the backend requests."""
    # The backend requests a ~30-day window ending ~5 days before today.
    end = date.today() - timedelta(days=5)
    start = end - timedelta(days=29)
    days = (end - start).days + 1
    series = {
        (start + timedelta(days=i)).strftime("%Y%m%d"): value_mm for i in range(days)
    }
    return httpx.Response(
        200,
        json={
            "header": {"sources": sources},
            "properties": {"parameter": {"PRECTOTCORR": series}},
        },
    )


def _mock_supporting_providers() -> None:
    respx.get(ARCHIVE_URL).mock(side_effect=_archive_response)
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200, json={"daily": {"time": ["2026-10-12"], "precipitation_sum": [0.4]}}
        )
    )
    respx.get(FLOOD_URL).mock(return_value=httpx.Response(500))


def _cross_check(body: dict) -> dict:
    keys = {i["key"]: i for i in body["indicators"]}
    assert "cross_check_delta" in keys, "cross-check indicator must always be present"
    return keys["cross_check_delta"]


@respx.mock
async def test_cross_check_computes_the_documented_formula(client):
    # ERA5 constant 1.0 mm/day vs MERRA-2 constant 1.5 mm/day over the same
    # consolidated window: (1.0 - 1.5) / 1.5 * 100 = -33.3%.
    _mock_supporting_providers()
    respx.get(POWER_URL).mock(return_value=_power_response(["MERRA2"], value_mm=1.5))

    r = await client.get("/api/v1/location/summary", params={"latitude": 10, "longitude": 20})
    assert r.status_code == 200, r.text
    indicator = _cross_check(r.json())
    assert indicator["status"] == "ok"
    assert indicator["unit"] == "%"
    assert indicator["value"] == pytest.approx(-33.3, abs=0.1)


@respx.mock
async def test_preliminary_power_window_withholds_the_percentage(client):
    # GEOSIT marks NASA POWER's preliminary, near-real-time segment. Publishing
    # a percentage against it would report the product's provisional status as
    # if it were a real disagreement, so the value must be withheld.
    _mock_supporting_providers()
    respx.get(POWER_URL).mock(
        return_value=_power_response(["MERRA2", "GEOSIT"], value_mm=20.0)
    )

    r = await client.get("/api/v1/location/summary", params={"latitude": 10, "longitude": 20})
    assert r.status_code == 200, r.text
    indicator = _cross_check(r.json())
    assert indicator["status"] == "insufficient_data"
    assert indicator["value"] is None
    # The limitation must be explained, not left as a silent gap.
    joined = " ".join(indicator["limitations"]).lower()
    assert "preliminary" in joined or "subject to revision" in joined

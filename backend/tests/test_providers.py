"""Provider adapter tests using recorded, mocked HTTP responses."""
from __future__ import annotations

from datetime import date, datetime, timezone

import httpx
import pytest
import respx

from app.errors import ProviderError, ProviderTimeoutError, ValidationError
from app.models.common import BoundingBox, GeoPoint
from app.providers import geocoding, nasa_power, open_meteo, stac

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
STAC_URL = "https://stac.dataspace.copernicus.eu/v1/search"

POINT = GeoPoint(latitude=52.52, longitude=13.41)


@respx.mock
async def test_geocoding_normalizes_results():
    respx.get(GEOCODE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": 2950159,
                        "name": "Berlin",
                        "latitude": 52.52437,
                        "longitude": 13.41053,
                        "country": "Germany",
                        "country_code": "DE",
                        "admin1": "State of Berlin",
                        "timezone": "Europe/Berlin",
                        "population": 3426354,
                        "feature_code": "PPLC",
                    },
                    {"name": "Malformed - missing coords"},
                ]
            },
        )
    )
    results, report = await geocoding.search_places("Berlin")
    assert len(results) == 1  # malformed entry skipped, not fatal
    assert results[0].name == "Berlin"
    assert results[0].country_code == "DE"
    assert "Germany" in results[0].display_name
    assert report.status.value == "ok"


@respx.mock
async def test_geocoding_handles_provider_failure():
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(500))
    results, report = await geocoding.search_places("Nowhere")
    assert results == []
    assert report.status.value == "unavailable"


async def test_geocoding_rejects_blank_query():
    with pytest.raises(ValidationError):
        await geocoding.search_places("   ")


@respx.mock
async def test_forecast_parses_daily_series():
    respx.get(FORECAST_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily_units": {"precipitation_sum": "mm"},
                "daily": {
                    "time": ["2026-10-09", "2026-10-10"],
                    "precipitation_sum": [1.2, None],
                },
            },
        )
    )
    series = await open_meteo.fetch_forecast_precipitation(POINT, days=2)
    assert series.granularity == "daily"
    assert series.unit == "mm"
    assert series.points[0].value == pytest.approx(1.2)
    assert series.points[1].value is None
    assert series.missing_days == 1
    assert series.total == pytest.approx(1.2)
    assert series.provenance.classification.value == "forecast"


@respx.mock
async def test_archive_parses_and_classifies_as_reanalysis():
    respx.get(ARCHIVE_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "daily": {
                    "time": ["2024-01-01", "2024-01-02"],
                    "precipitation_sum": [0.0, 5.5],
                }
            },
        )
    )
    series = await open_meteo.fetch_archive_precipitation(
        POINT, start=date(2024, 1, 1), end=date(2024, 1, 2)
    )
    assert series.provenance.classification.value == "reanalysis"
    assert series.total == pytest.approx(5.5)


async def test_archive_rejects_inverted_range():
    with pytest.raises(ValidationError):
        await open_meteo.fetch_archive_precipitation(
            POINT, start=date(2024, 2, 1), end=date(2024, 1, 1)
        )


@respx.mock
async def test_nasa_power_fills_sentinel_values():
    respx.get(POWER_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "properties": {
                    "parameter": {
                        "PRECTOTCORR": {
                            "20240101": 0.93,
                            "20240102": -999.0,
                        }
                    }
                }
            },
        )
    )
    series = await nasa_power.fetch_precipitation(
        POINT, start=date(2024, 1, 1), end=date(2024, 1, 2)
    )
    assert series.points[0].value == pytest.approx(0.93)
    assert series.points[1].value is None  # -999.0 sentinel normalized to null
    assert series.missing_days == 1


@respx.mock
async def test_stac_search_normalizes_items():
    respx.post(STAC_URL).mock(
        return_value=httpx.Response(
            200,
            json={
                "features": [
                    {
                        "id": "S2A_MSIL2A_TEST",
                        "collection": "sentinel-2-l2a",
                        "bbox": [13.3, 52.4, 13.5, 52.6],
                        "properties": {
                            "datetime": "2024-06-29T10:20:21Z",
                            "eo:cloud_cover": 12.5,
                            "platform": "sentinel-2a",
                        },
                        "assets": {"thumbnail": {"href": "https://example/thumb.jpg"}},
                    }
                ]
            },
        )
    )
    result = await stac.search_scenes(
        BoundingBox(west=13.3, south=52.4, east=13.5, north=52.6),
        start=datetime(2024, 6, 1, tzinfo=timezone.utc),
        end=datetime(2024, 6, 30, tzinfo=timezone.utc),
    )
    assert result.count == 1
    assert result.items[0].id == "S2A_MSIL2A_TEST"
    assert result.items[0].cloud_cover == pytest.approx(12.5)


async def test_stac_rejects_unsupported_collection():
    with pytest.raises(ValidationError):
        await stac.search_scenes(
            BoundingBox(west=0, south=0, east=1, north=1),
            start=datetime(2024, 1, 1, tzinfo=timezone.utc),
            end=datetime(2024, 1, 2, tzinfo=timezone.utc),
            collection="not-a-real-collection",
        )


@respx.mock
async def test_timeout_surfaces_as_provider_timeout():
    respx.get(FORECAST_URL).mock(side_effect=httpx.ConnectTimeout("timed out"))
    with pytest.raises(ProviderTimeoutError):
        await open_meteo.fetch_forecast_precipitation(POINT, days=3)


@respx.mock
async def test_http_error_surfaces_as_provider_error():
    respx.get(FORECAST_URL).mock(return_value=httpx.Response(400))
    with pytest.raises(ProviderError):
        await open_meteo.fetch_forecast_precipitation(POINT, days=3)


@respx.mock
async def test_geocoder_distinguishes_no_results_from_failure():
    # An empty successful response is "no matches", not an outage.
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(200, json={"results": []}))
    results, report = await geocoding.search_places("zzzzzz")
    assert results == []
    assert "no matching places" in (report.message or "").lower()

    # A provider failure reads differently.
    respx.get(GEOCODE_URL).mock(return_value=httpx.Response(503))
    results, report = await geocoding.search_places("berlin")
    assert results == []
    assert "no matching places" not in (report.message or "").lower()


async def test_ttl_cache_coalesces_concurrent_identical_requests():
    from app.providers.base import TTLCache

    cache = TTLCache(ttl_seconds=60, max_entries=8)
    calls = {"n": 0}

    async def factory():
        calls["n"] += 1
        return "value"

    import asyncio

    results = await asyncio.gather(
        *(cache.get_or_set("ns", {"a": 1}, factory) for _ in range(5))
    )
    assert results == ["value"] * 5
    # Only the first caller should have performed the fetch.
    assert calls["n"] == 1


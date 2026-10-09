"""Regression tests for the NASA GPM IMERG Late Daily V07 adapter.

These tests are fully offline: they exercise the pure interpretation and
geospatial logic, the SigV4 signer's shape, and the retrieval plumbing with a
mocked credential endpoint and a mocked S3 object. No live NASA credentials are
required, and no network call is made.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

import httpx
import pytest
import respx

from app.errors import (
    ProviderUnavailableError,
    ProviderUnconfiguredError,
    ValidationError,
)
from app.models.common import BoundingBox, GeoPoint
from app.providers import gesdisc_credentials, imerg, sigv4
from app.providers.catalog import provider_by_id

DAY = date(2024, 3, 5)


def _grid() -> dict:
    return {
        "lat": [-10.0, -9.9, -9.8],
        "lon": [20.0, 20.1, 20.2],
        "precipitation": [
            [0.0, 12.5, -9999.900390625],
            [1.4, -9999.900390625, 30.0],
            [-9999.900390625, -9999.900390625, 0.0],
        ],
        "precipitation_cnt": [
            [48, 24, 0],
            [30, 0, 48],
            [0, 0, 20],
        ],
    }


# --------------------------------------------------------------------------- #
# Catalog / provenance                                                        #
# --------------------------------------------------------------------------- #


def test_catalog_entry_labels_satellite_estimate_and_doi() -> None:
    meta = provider_by_id("nasa_imerg_late_daily")
    assert meta is not None
    assert meta.classification.value == "satellite_estimate"
    assert "10.5067/GPM/IMERGDL/DAY/07" in (meta.url or "")
    assert meta.units and "mm/day" in meta.units
    # Must not be confused with reanalysis (ERA5) or observation (gauge).
    assert meta.classification.value not in {"reanalysis", "observation"}


# --------------------------------------------------------------------------- #
# Identifiers / URLs                                                          #
# --------------------------------------------------------------------------- #


def test_granule_key_matches_documented_layout() -> None:
    key = imerg.granule_key(DAY)
    assert key == (
        "GPM_L3/GPM_3IMERGDL.07/2024/03/"
        "3B-DAY-L.MS.MRG.3IMERG.20240305-S000000-E235959.V07B.nc4"
    )


def test_https_url_is_under_gesdisc_data_root() -> None:
    url = imerg.granule_https_url(DAY)
    assert url.startswith("https://data.gesdisc.earthdata.nasa.gov/data/")
    assert url.endswith(".V07B.nc4")


# --------------------------------------------------------------------------- #
# Value interpretation: fill vs valid dry                                     #
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "value,count,expected",
    [
        (0.0, 48, 0.0),              # valid dry day
        (12.5, 24, 12.5),           # valid wet day
        (0.0, 0, None),             # filled cell: NOT 0.0
        (-9999.900390625, 0, None),  # explicit fill
        (-9999.900390625, 10, None),  # fill value regardless of count
        (5.0, 0, None),             # value present but no valid retrievals
        (None, 48, None),           # missing value
        (float("nan"), 48, None),   # NaN
        ("not-a-number", 5, None),  # unparseable
    ],
)
def test_normalize_value_semantics(value, count, expected) -> None:
    assert imerg.normalize_value(value, count) == expected


def test_is_valid_observation_distinguishes_dry_from_filled() -> None:
    assert imerg.is_valid_observation(0.0, 48) is True
    assert imerg.is_valid_observation(0.0, 0) is False


# --------------------------------------------------------------------------- #
# Geospatial indexing                                                         #
# --------------------------------------------------------------------------- #


def test_nearest_index_picks_closest_cell() -> None:
    axis = [20.0, 20.1, 20.2]
    assert imerg.nearest_index(axis, 20.02) == 0
    assert imerg.nearest_index(axis, 20.14) == 1
    assert imerg.nearest_index(axis, 20.31) == 2


def test_nearest_index_rejects_empty_axis() -> None:
    with pytest.raises(ValidationError):
        imerg.nearest_index([], 0.0)


def test_bbox_index_bounds_contiguous() -> None:
    lat = [-10.0, -9.9, -9.8]
    lon = [20.0, 20.1, 20.2]
    bbox = BoundingBox(west=20.0, south=-10.0, east=20.1, north=-9.9)
    assert imerg.bbox_index_bounds(lat, lon, bbox) == (0, 1, 0, 1)


def test_bbox_crossing_antimeridian_is_rejected() -> None:
    lat = [-10.0, -9.9]
    lon = [179.0, 179.9]
    bbox = BoundingBox(west=179.0, south=-10.0, east=-179.0, north=-9.8)
    with pytest.raises(ValidationError):
        imerg.bbox_index_bounds(lat, lon, bbox)


# --------------------------------------------------------------------------- #
# Parsing a granule                                                           #
# --------------------------------------------------------------------------- #


def test_parse_requires_precipitation_count() -> None:
    data = _grid()
    data.pop("precipitation_cnt")
    with pytest.raises(ProviderUnavailableError):
        imerg.parse_imerg_dataset(data, day=DAY)


def test_parse_requires_precipitation_variable() -> None:
    data = _grid()
    data.pop("precipitation")
    with pytest.raises(ProviderUnavailableError):
        imerg.parse_imerg_dataset(data, day=DAY)


def test_point_sample_preserves_dry_and_filled() -> None:
    granule = imerg.parse_imerg_dataset(_grid(), day=DAY)

    dry = granule.point_sample(GeoPoint(latitude=-10.0, longitude=20.0))
    assert dry.value_mm_per_day == 0.0
    assert dry.half_hourly_count == 48

    wet = granule.point_sample(GeoPoint(latitude=-10.0, longitude=20.1))
    assert wet.value_mm_per_day == 12.5
    assert wet.half_hourly_count == 24

    filled = granule.point_sample(GeoPoint(latitude=-9.9, longitude=20.1))
    assert filled.value_mm_per_day is None
    assert filled.half_hourly_count == 0


def test_area_sample_is_validity_weighted_and_reports_coverage() -> None:
    granule = imerg.parse_imerg_dataset(_grid(), day=DAY)
    bbox = BoundingBox(west=20.0, south=-10.0, east=20.2, north=-9.8)
    sample = granule.area_sample(bbox)
    # Valid cells: 0.0, 12.5, 1.4, 30.0, 0.0 -> mean = 8.78; 4 of 9 filled.
    assert sample.valid_cells == 5
    assert sample.total_cells == 9
    assert sample.value_mm_per_day == pytest.approx(8.78, abs=0.01)
    assert sample.coverage_ratio == pytest.approx(5 / 9)


def test_area_sample_all_filled_returns_none() -> None:
    data = _grid()
    data["precipitation"] = [[-9999.9] * 3 for _ in range(3)]
    data["precipitation_cnt"] = [[0, 0, 0] for _ in range(3)]
    granule = imerg.parse_imerg_dataset(data, day=DAY)
    bbox = BoundingBox(west=20.0, south=-10.0, east=20.2, north=-9.8)
    sample = granule.area_sample(bbox)
    assert sample.value_mm_per_day is None
    assert sample.coverage_ratio == 0.0


def test_day_from_time_epoch() -> None:
    # 2024-03-05 is 16135 days after the 1980-01-06 IMERG epoch.
    epoch_day = (date(2024, 3, 5) - date(1980, 1, 6)).days
    assert imerg._day_from_time([float(epoch_day)]) == date(2024, 3, 5)


# --------------------------------------------------------------------------- #
# SigV4 signer                                                                #
# --------------------------------------------------------------------------- #


def test_sign_get_object_produces_wellformed_authorization() -> None:
    signed = sigv4.sign_get_object(
        bucket="gesdisc-cumulus-prod-protected",
        key=imerg.granule_key(DAY),
        access_key_id="AKIAIOSFODNN7EXAMPLE",
        secret_access_key="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        session_token="SESSIONTOKENEXAMPLE",
        region="us-west-2",
        endpoint_host="gesdisc-cumulus-prod-protected.s3.us-west-2.amazonaws.com",
        now=datetime(2024, 3, 5, 12, 0, 0, tzinfo=timezone.utc),
    )
    assert signed.amz_date == "20240305T120000Z"
    assert signed.authorization.startswith("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/")
    assert "SignedHeaders=host;x-amz-content-sha256;x-amz-date;x-amz-security-token" in signed.authorization
    assert "/us-west-2/s3/aws4_request" in signed.authorization
    assert "Signature=" in signed.authorization
    # Signature is a 64-char hex digest.
    signature = signed.authorization.rsplit("Signature=", 1)[1]
    int(signature, 16)
    assert len(signature) == 64


def test_sign_get_object_is_deterministic_for_fixed_time() -> None:
    kwargs = dict(
        bucket="b",
        key="k",
        access_key_id="AK",
        secret_access_key="SK",
        session_token="ST",
        region="us-west-2",
        endpoint_host="host",
        now=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    a = sigv4.sign_get_object(**kwargs)
    b = sigv4.sign_get_object(**kwargs)
    assert a.authorization == b.authorization


def test_canonical_uri_encodes_without_touching_slashes() -> None:
    assert sigv4.canonical_uri("/a/b c.nc4") == "/a/b%20c.nc4"


# --------------------------------------------------------------------------- #
# Credential manager (mocked OAuth exchange)                                  #
# --------------------------------------------------------------------------- #


@pytest.fixture(autouse=True)
def _clean_credentials():
    gesdisc_credentials.reset_cache()
    yield
    gesdisc_credentials.reset_cache()


def _settings_with_creds(settings):
    settings.earthdata_username = "test-user"
    settings.earthdata_password = "test-pass"
    return settings


async def test_unconfigured_credentials_raise_unconfigured() -> None:
    from app.config import get_settings

    settings = get_settings()
    previous_user, previous_pass = settings.earthdata_username, settings.earthdata_password
    settings.earthdata_username = None
    settings.earthdata_password = None
    try:
        with pytest.raises(ProviderUnconfiguredError):
            await gesdisc_credentials.get_s3_credentials()
    finally:
        settings.earthdata_username = previous_user
        settings.earthdata_password = previous_pass


@respx.mock
async def test_credential_exchange_and_cache() -> None:
    from app.config import get_settings

    settings = _settings_with_creds(get_settings())
    original = settings.gesdisc_s3credentials_url
    settings.gesdisc_s3credentials_url = "https://gesdisc.test/s3credentials"
    try:
        # First call -> EDL redirect; the authenticated second call -> STS keys.
        creds_route = respx.get("https://gesdisc.test/s3credentials").mock(
            side_effect=[
                httpx.Response(
                    302, headers={"location": "https://urs.test/oauth/authorize?x=1"}
                ),
                httpx.Response(
                    200,
                    json={
                        "accessKeyId": "AKIA",
                        "secretAccessKey": "SECRET",
                        "sessionToken": "TOKEN",
                        "expiration": "2024-03-05T13:00:00+00:00",
                    },
                ),
            ]
        )
        respx.post("https://urs.test/oauth/authorize?x=1").mock(
            return_value=httpx.Response(302, headers={"location": "https://urs.test/redirect"})
        )
        respx.get("https://urs.test/redirect").mock(
            return_value=httpx.Response(200, headers={"set-cookie": "accessToken=abc123; Path=/"})
        )

        creds = await gesdisc_credentials.get_s3_credentials(
            now=datetime(2024, 3, 5, 12, 0, tzinfo=timezone.utc)
        )
        assert creds.access_key_id == "AKIA"
        assert creds.session_token == "TOKEN"
        assert creds_route.call_count == 2  # redirect + authenticated call

        # A second call within the validity window must NOT hit the network again.
        again = await gesdisc_credentials.get_s3_credentials(
            now=datetime(2024, 3, 5, 12, 10, tzinfo=timezone.utc)
        )
        assert again.access_key_id == "AKIA"
        assert creds_route.call_count == 2
    finally:
        settings.gesdisc_s3credentials_url = original


async def test_credentials_near_expiry_are_not_reused() -> None:
    creds = gesdisc_credentials.S3Credentials(
        access_key_id="a",
        secret_access_key="b",
        session_token="c",
        expiration=datetime(2024, 3, 5, 12, 0, tzinfo=timezone.utc),
    )
    # 12:00 minus the 5-minute margin is already past => must refresh.
    assert creds.is_valid(now=datetime(2024, 3, 5, 11, 56, tzinfo=timezone.utc)) is False
    assert creds.is_valid(now=datetime(2024, 3, 5, 11, 50, tzinfo=timezone.utc)) is True


def test_expiration_parse_handles_space_separator() -> None:
    parsed = gesdisc_credentials._parse_expiration("2021-01-27 00:50:09+00:00")
    assert parsed == datetime(2021, 1, 27, 0, 50, 9, tzinfo=timezone.utc)


# --------------------------------------------------------------------------- #
# Retrieval range guards                                                      #
# --------------------------------------------------------------------------- #


async def test_range_too_large_is_rejected() -> None:
    from app.config import get_settings

    settings = get_settings()
    previous = settings.imerg_max_days
    settings.imerg_max_days = 10
    try:
        with pytest.raises(ValidationError):
            await imerg.fetch_point_series(
                GeoPoint(latitude=0.0, longitude=0.0),
                start=date(2024, 1, 1),
                end=date(2024, 3, 1),
            )
    finally:
        settings.imerg_max_days = previous


async def test_reversed_range_is_rejected() -> None:
    with pytest.raises(ValidationError):
        await imerg.fetch_point_series(
            GeoPoint(latitude=0.0, longitude=0.0),
            start=date(2024, 3, 5),
            end=date(2024, 3, 4),
        )

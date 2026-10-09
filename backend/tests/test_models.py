"""Tests for domain models, timestamp/unit normalization and config."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.config import Settings
from app.models.common import (
    DataClassification,
    GeoPoint,
    Provenance,
    ProviderMetadata,
    TimeSeriesPoint,
    utcnow,
)


def test_geo_point_bounds():
    GeoPoint(latitude=0, longitude=0)
    GeoPoint(latitude=-90, longitude=180)
    with pytest.raises(PydanticValidationError):
        GeoPoint(latitude=91, longitude=0)
    with pytest.raises(PydanticValidationError):
        GeoPoint(latitude=0, longitude=-181)


def test_utcnow_is_timezone_aware_utc():
    now = utcnow()
    assert now.tzinfo is not None
    assert now.utcoffset().total_seconds() == 0


def test_provenance_defaults_to_utc_now():
    p = Provenance(
        source_id="x",
        source_name="X",
        classification=DataClassification.REANALYSIS,
    )
    assert p.retrieved_at.tzinfo is not None


def test_timeseries_point_accepts_null_value():
    point = TimeSeriesPoint(
        timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc), value=None, unit="mm"
    )
    assert point.value is None


def test_provider_metadata_limitations_default_empty():
    meta = ProviderMetadata(
        id="p", name="P", classification=DataClassification.FORECAST
    )
    assert meta.limitations == []


def test_settings_cors_parsing():
    s = Settings(cors_origins="http://a.com, http://b.com ,")
    assert s.cors_origin_list == ["http://a.com", "http://b.com"]


def test_settings_log_level_normalized():
    s = Settings(log_level="debug")
    assert s.log_level == "DEBUG"


def test_settings_provider_configured():
    s = Settings(cdse_username="u", cdse_password="p", earthdata_token="t")
    assert s.provider_configured("cdse_stac_auth") is True
    assert s.provider_configured("earthdata") is True
    empty = Settings()
    assert empty.provider_configured("cdse_stac_auth") is False
    assert empty.provider_configured("open_meteo_flood") is True  # no credential needed

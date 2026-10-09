"""Centralized application configuration.

All credentials and tunables are read from the environment exactly once at
startup. Nothing here is ever exposed to the browser bundle: the frontend only
ever talks to this backend, never to a data provider directly.
"""
from __future__ import annotations

import functools
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the AquaNexus API.

    Every field has a safe default so the application runs without a single
    optional credential. Providers that need a key report an explicit
    ``unconfigured`` state instead of failing the whole app.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="AQUANEXUS_",
        extra="ignore",
    )

    # --- General ---
    environment: Literal["development", "staging", "production"] = "development"
    log_level: str = "INFO"
    api_title: str = "AquaNexus API"
    api_version: str = "0.1.0"

    # Network policy: comma-separated origins for CORS. Local dev defaults.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- HTTP client ---
    provider_timeout_seconds: float = 20.0
    provider_max_retries: int = 2
    user_agent: str = "AquaNexus/0.1 (+https://github.com/zayaanakhan16-lang/Aqua-Nexus)"

    # --- Caching ---
    cache_ttl_seconds: int = 300
    cache_max_entries: int = 512

    # --- Optional provider credentials ---
    # NASA POWER is public; the key is only used if a deployment fronts it.
    nasa_power_api_key: str | None = None
    # Copernicus Data Space Ecosystem: needed only for authenticated STAC
    # downloads (search itself is anonymous).
    cdse_username: str | None = None
    cdse_password: str | None = None
    # NASA Earthdata: needed for GPM IMERG downloads (not for POWER).
    earthdata_token: str | None = None
    # Optional geocoding fallback (e.g. a commercial geocoder).
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"

    # Base URLs (overridable so tests can point at local fixtures).
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_climate_url: str = "https://climate-api.open-meteo.com/v1/climate"
    open_meteo_flood_url: str = "https://flood-api.open-meteo.com/v1/flood"
    open_meteo_geocoding_url: str = "https://geocoding-api.open-meteo.com/v1/search"
    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    cdse_stac_url: str = "https://stac.dataspace.copernicus.eu/v1/search"

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def provider_configured(self, name: str) -> bool:
        """Return whether a credential-gated provider has what it needs."""
        requirements = {
            "cdse_stac_auth": bool(self.cdse_username and self.cdse_password),
            "earthdata": bool(self.earthdata_token),
        }
        return requirements.get(name, True)


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()

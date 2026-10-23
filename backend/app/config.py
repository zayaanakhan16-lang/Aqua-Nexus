"""Centralized application configuration.

All credentials and tunables are read from the environment exactly once at
startup. Nothing here is ever exposed to the browser bundle: the frontend only
ever talks to this backend, never to a data provider directly.
"""
from __future__ import annotations

import functools
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the environment files from this module's location rather than the
# current working directory. A relative ``.env`` only resolves when the process
# is launched from ``backend/``; starting uvicorn from the repository root would
# otherwise silently load nothing and every credential would look unset.
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime configuration for the AquaNexus API.

    Every field has a safe default so the application runs without a single
    optional credential. Providers that need a key report an explicit
    ``unconfigured`` state instead of failing the whole app.
    """

    # Files are listed lowest-priority first: a later file overrides an earlier
    # one, and real environment variables always win over every file. The
    # repository-root entries let a single ``.env``/``.env.local`` configure the
    # whole workspace; ``backend/.env`` remains the most specific and therefore
    # the authoritative location for server-side secrets.
    model_config = SettingsConfigDict(
        env_file=(
            _REPO_ROOT / ".env.local",
            _REPO_ROOT / ".env",
            _BACKEND_DIR / ".env",
        ),
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

    # --- Persistence ---
    # Directory for lightweight, file-backed application state (saved study
    # areas). Relative paths resolve against the backend working directory.
    # This holds only user-authored labels and coordinates, never credentials.
    data_dir: str = "data"

    # --- Optional provider credentials ---
    # NASA POWER is public; the key is only used if a deployment fronts it.
    nasa_power_api_key: str | None = None
    # Copernicus Data Space Ecosystem: needed only for authenticated STAC
    # downloads (search itself is anonymous).
    cdse_username: str | None = None
    cdse_password: str | None = None
    # NASA Earthdata token (personal access token). Needed for authenticated
    # NASA GPM IMERG access. Create at https://urs.earthdata.nasa.gov/.
    earthdata_token: str | None = None
    # NASA Earthdata username/password (Earthdata Login). Used ONLY server-side
    # to obtain short-lived (1-hour) AWS STS credentials from the GES DISC
    # /s3credentials endpoint. Never logged, never sent to the browser.
    earthdata_username: str | None = None
    earthdata_password: str | None = None

    # GPM IMERG (GES DISC) access configuration.
    # Bucket/prefix are stable and documented; endpoints are overridable so
    # tests can point at local fixtures.
    gesdisc_s3credentials_url: str = "https://data.gesdisc.earthdata.nasa.gov/s3credentials"
    gesdisc_https_data_url: str = "https://data.gesdisc.earthdata.nasa.gov/data"
    gesdisc_opendap_url: str = "https://opendap.earthdata.nasa.gov"
    gesdisc_s3_bucket: str = "gesdisc-cumulus-prod-protected"
    gesdisc_imerg_prefix: str = "GPM_L3/GPM_3IMERGDL.07"
    gesdisc_s3_region: str = "us-west-2"
    gesdisc_s3_endpoint: str = "https://gesdisc-cumulus-prod-protected.s3.us-west-2.amazonaws.com"
    imerg_short_name: str = "GPM_3IMERGDL"
    imerg_version: str = "07"
    # Bounded download: never exceed this many bytes for a single granule.
    imerg_max_download_bytes: int = 64 * 1024 * 1024
    # Bounded date range per request (the Late Daily product is 1998-present).
    imerg_max_days: int = 366

    # Optional geocoding fallback (e.g. a commercial geocoder).
    nominatim_base_url: str = "https://nominatim.openstreetmap.org"

    # --- AI analysis provider (optional) ---
    # Groq is the preferred provider. Its credential is read from the
    # conventional, unprefixed ``GROQ_API_KEY`` / ``GROQ_MODEL`` so a standard
    # Groq setup needs no AquaNexus-specific variable. With no key set the AI
    # Analysis feature reports an explicit ``unconfigured`` state and the rest
    # of the application keeps working. Keys are used server-side only and are
    # never sent to the browser or logged.
    # ``validation_alias`` also accepts the prefixed AQUANEXUS_GROQ_* spelling,
    # so either convention works and the unprefixed one is tried first.
    groq_api_key: str | None = Field(
        default=None, validation_alias=AliasChoices("GROQ_API_KEY", "AQUANEXUS_GROQ_API_KEY")
    )
    # Default to a model Groq currently serves. ``qwen/qwen3-32b`` (the previous
    # default) was retired on 2026-07-17 and ``llama-3.3-70b-versatile`` is an
    # Enterprise-only listing, so either would fail with HTTP 400 on a
    # developer-plan key. Groq's documented replacement is ``openai/gpt-oss-120b``,
    # which is an active hosted model. Override with GROQ_MODEL for any other id
    # the deployment's plan serves.
    groq_model: str = Field(
        default="openai/gpt-oss-120b",
        validation_alias=AliasChoices("GROQ_MODEL", "AQUANEXUS_GROQ_MODEL"),
    )
    groq_base_url: str = "https://api.groq.com/openai/v1"

    # Generic OpenAI-compatible endpoint. Used only when no Groq credential is
    # configured, so a deployment that sets GROQ_API_KEY never silently falls
    # back to a different provider.
    ai_api_key: str | None = None
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 45.0
    ai_max_evidence_chars: int = 12000

    # Base URLs (overridable so tests can point at local fixtures).
    open_meteo_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    open_meteo_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    open_meteo_climate_url: str = "https://climate-api.open-meteo.com/v1/climate"
    open_meteo_flood_url: str = "https://flood-api.open-meteo.com/v1/flood"
    open_meteo_geocoding_url: str = "https://geocoding-api.open-meteo.com/v1/search"
    nasa_power_url: str = "https://power.larc.nasa.gov/api/temporal/daily/point"
    cdse_stac_url: str = "https://stac.dataspace.copernicus.eu/v1/search"
    # NASA CMR STAC (LP DAAC "LPCLOUD" provider) for Harmonized Landsat
    # Sentinel-2 (HLS) product discovery. Metadata search is anonymous, so no
    # Earthdata credential is required to discover HLS granules.
    cmr_hls_stac_url: str = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD"
    # NASA GIBS WMTS endpoint for real global raster map layers (key-free).
    gibs_wmts_url: str = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best"
    # OpenStreetMap Overpass API for mapped water-feature geometry (key-free).
    osm_overpass_url: str = "https://overpass-api.de/api/interpreter"

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
            # IMERG retrieval needs the EDL username/password pair used to
            # obtain short-lived S3 credentials (a bare token is not sufficient
            # for the /s3credentials exchange).
            "nasa_imerg": bool(self.earthdata_username and self.earthdata_password),
            "ai_analysis": bool(self.groq_api_key or self.ai_api_key),
        }
        return requirements.get(name, True)

    def resolved_ai_provider(self) -> tuple[str, str, str] | None:
        """Resolve the active AI provider as ``(name, base_url, model)``.

        Groq wins when its credential is present; the generic OpenAI-compatible
        endpoint is used only as an explicit alternative. Returns ``None`` when
        neither is configured, so callers can report an honest unconfigured
        state instead of guessing an endpoint.
        """
        if self.groq_api_key:
            return ("groq", self.groq_base_url, self.groq_model)
        if self.ai_api_key:
            return ("openai_compatible", self.ai_base_url, self.ai_model)
        return None

    def ai_credential(self) -> str | None:
        """The credential for the resolved AI provider, or ``None``."""
        if self.groq_api_key:
            return self.groq_api_key
        return self.ai_api_key

    def resolved_ai_model(self) -> str | None:
        """Model id for the resolved AI provider, or ``None`` if unconfigured."""
        resolved = self.resolved_ai_provider()
        return resolved[2] if resolved else None


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()

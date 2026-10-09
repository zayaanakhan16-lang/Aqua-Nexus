"""Health, readiness, and metadata routes."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.config import get_settings
from app.models.aggregates import HealthResponse, ReadinessResponse
from app.models.common import (
    DataClassification,
    ProviderReport,
    ProviderStatus,
)
from app.providers.catalog import ALL_PROVIDERS

router = APIRouter(tags=["system"])

# Providers that work without any credential; kept explicit so readiness is honest.
_CREDENTIAL_FREE = {
    "open_meteo_geocoding",
    "open_meteo_forecast",
    "open_meteo_archive",
    "open_meteo_climate",
    "open_meteo_flood",
    "nasa_power",
    "cdse_stac",
}


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
async def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        service=settings.api_title,
        version=settings.api_version,
        environment=settings.environment,
        time_utc=datetime.now(tz=timezone.utc),
    )


@router.get("/readiness", response_model=ReadinessResponse, summary="Provider readiness")
async def readiness() -> ReadinessResponse:
    """Report provider *configuration* separately from live *availability*.

    This endpoint performs no network calls, so it must not claim a provider is
    reachable. Providers that need no credential report ``configured`` (carried on
    the ``ok`` status); credential-gated providers report ``unconfigured``. Actual
    availability is observed per request in ``/location/summary``.
    """
    settings = get_settings()
    reports: list[ProviderReport] = []
    for provider in ALL_PROVIDERS:
        requires_credential = provider.id not in _CREDENTIAL_FREE
        if requires_credential:
            configured = settings.provider_configured(_credential_key_for(provider.id))
            status = ProviderStatus.OK if configured else ProviderStatus.UNCONFIGURED
            message = None if configured else "Requires configuration (credential not set)."
        else:
            status = ProviderStatus.OK
            message = "No credential required; availability is checked per request."
        reports.append(
            ProviderReport(
                provider_id=provider.id,
                provider_name=provider.name,
                status=status,
                message=message,
                classification=provider.classification,
            )
        )
    return ReadinessResponse(status="ok", providers=reports)


def _credential_key_for(provider_id: str) -> str:
    """Map a provider id to the credential key understood by ``Settings``."""
    if provider_id.startswith("cdse"):
        return "cdse_stac_auth"
    if "imerg" in provider_id:
        return "nasa_imerg"
    if provider_id.startswith("earthdata") or "earthdata" in provider_id:
        return "earthdata"
    return provider_id


@router.get("/providers", summary="Provider catalog with provenance metadata")
async def providers() -> dict:
    return {
        "count": len(ALL_PROVIDERS),
        "providers": [p.model_dump(mode="json") for p in ALL_PROVIDERS],
        "classifications": [c.value for c in DataClassification],
    }

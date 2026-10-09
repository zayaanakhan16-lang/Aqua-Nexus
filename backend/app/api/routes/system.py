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
    reports: list[ProviderReport] = []
    for provider in ALL_PROVIDERS:
        is_free = provider.id in _CREDENTIAL_FREE
        reports.append(
            ProviderReport(
                provider_id=provider.id,
                provider_name=provider.name,
                status=ProviderStatus.OK if is_free else ProviderStatus.UNCONFIGURED,
                message=None if is_free else "Requires configuration.",
                classification=provider.classification,
            )
        )
    return ReadinessResponse(status="ok", providers=reports)


@router.get("/providers", summary="Provider catalog with provenance metadata")
async def providers() -> dict:
    return {
        "count": len(ALL_PROVIDERS),
        "providers": [p.model_dump(mode="json") for p in ALL_PROVIDERS],
        "classifications": [c.value for c in DataClassification],
    }

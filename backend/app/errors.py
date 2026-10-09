"""Explicit, typed error hierarchy and a uniform API error payload.

Provider failures are never swallowed into fabricated data. They surface as a
structured error the frontend can render as an honest "unavailable" state.
"""
from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AquaNexusError(Exception):
    """Base class for all application errors."""

    status_code: int = 500
    code: str = "internal_error"

    def __init__(self, message: str, *, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_payload(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class ValidationError(AquaNexusError):
    status_code = 422
    code = "validation_error"


class NotFoundError(AquaNexusError):
    status_code = 404
    code = "not_found"


class ProviderError(AquaNexusError):
    """A data provider failed, timed out, or returned an invalid payload."""

    status_code = 502
    code = "provider_error"


class ProviderTimeoutError(ProviderError):
    status_code = 504
    code = "provider_timeout"


class ProviderUnavailableError(ProviderError):
    """The provider is reachable in principle but returned no usable data."""

    status_code = 503
    code = "provider_unavailable"


class ProviderUnconfiguredError(ProviderError):
    """A required credential is missing for this provider."""

    status_code = 501
    code = "provider_unconfigured"


class InsufficientDataError(AquaNexusError):
    """An analysis was requested without enough evidence to compute it."""

    status_code = 422
    code = "insufficient_data"


async def aquanexus_exception_handler(_: Request, exc: AquaNexusError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_payload())

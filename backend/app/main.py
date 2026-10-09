"""AquaNexus FastAPI application factory."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import AquaNexusError, aquanexus_exception_handler
from app.logging_config import configure_logging, get_logger
from app.providers.base import close_client

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level)
    logger.info("AquaNexus API starting (env=%s)", settings.environment)
    yield
    await close_client()
    logger.info("AquaNexus API stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.api_title,
        version=settings.api_version,
        description=(
            "Global water intelligence API. Every response carries provenance and "
            "data-classification metadata. Provider failures surface as explicit "
            "error states; values are never fabricated."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AquaNexusError, aquanexus_exception_handler)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:  # pragma: no cover
        logger.exception("Unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected server error occurred.",
                    "details": {},
                }
            },
        )

    from app.api.routes import geography, precipitation, satellite, system

    app.include_router(system.router, prefix="/api/v1")
    app.include_router(geography.router, prefix="/api/v1")
    app.include_router(precipitation.router, prefix="/api/v1")
    app.include_router(satellite.router, prefix="/api/v1")

    return app


app = create_app()

"""Global map-layer catalog route.

Serves the catalog of real global raster layers (NASA GIBS WMTS) the deployment
can currently render, with verified availability, legend and provenance. The
frontend builds its layer selector and legends from this response, so the set of
layers shown always matches what the backend can actually deliver.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.models.layers import MapLayerCatalog
from app.services.map_layers import build_layer_catalog

router = APIRouter(tags=["map"])


@router.get(
    "/map/layers",
    response_model=MapLayerCatalog,
    summary="Global raster map-layer catalog (NASA GIBS)",
)
async def map_layers(
    verify: bool = Query(
        True,
        description="Probe each layer's availability against GIBS before returning it.",
    ),
) -> MapLayerCatalog:
    return await build_layer_catalog(verify=verify)

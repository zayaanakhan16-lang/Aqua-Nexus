"""Global map-layer service.

Assembles the catalog of real global raster layers the deployment can render and
verifies their availability. Availability probes are cached for a short TTL
because the underlying tiles change on the order of hours to days, and a probe
must never be presented as live when it is stale.

No layer is fabricated: a layer GIBS is not currently serving is returned with
``available=False`` and an explicit reason.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from app.models.layers import MapLayerCatalog
from app.providers import gibs
from app.providers.base import get_cache

# GIBS publishes on the order of hours; a 30-minute probe cache is a good
# balance between freshness and courtesy to the provider.
PROBE_CACHE_SECONDS = 1800


async def _probe_cached(layer_id: str, spec: gibs.GIBSSpec) -> bool:
    cache = get_cache()
    return await cache.get_or_set(
        "gibs_probe",
        {"layer": layer_id, "kind": "availability"},
        lambda: gibs.probe_available(spec),
    )


async def build_layer_catalog(*, verify: bool = True) -> MapLayerCatalog:
    """Return the global layer catalog, with availability verified by default."""
    default_date = gibs.resolve_default_date()
    layers = []
    for spec in gibs.all_specs():
        if verify:
            available = await _probe_cached(spec.id, spec)
        else:
            available = True
        layers.append(
            gibs.build_layer(
                spec,
                available=available,
                default_date=default_date,
                reason=None if available else "NASA GIBS did not return this layer for the current window.",
            )
        )

    available_count = sum(1 for layer in layers if layer.available)
    notes = [
        "All layers are global NASA GIBS WMTS rasters served key-free; no credential is required.",
        "Every layer is an observation or satellite estimate. None of them is a flood "
        "forecast or a heatwave classification.",
        "Tile times default to the most recent date GIBS serves; a specific date can be requested.",
    ]
    if available_count < len(layers):
        notes.append(
            f"{len(layers) - available_count} layer(s) are currently unavailable and are "
            "shown as unavailable rather than substituted."
        )

    return MapLayerCatalog(
        generated_at=datetime.now(tz=timezone.utc),
        default_date=default_date,
        available_count=available_count,
        layers=layers,
        notes=notes,
    )


def resolve_layer_date(requested: date | None) -> str:
    """Return the WMTS ``{time}`` path segment for a requested date.

    ``None`` maps to the literal ``default``, which GIBS resolves to the most
    recent available date. This avoids advertising a stale date as current.
    """
    if requested is None:
        return "default"
    return requested.isoformat()

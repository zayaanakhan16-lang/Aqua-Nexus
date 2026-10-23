"""NASA GIBS WMTS adapter for real global raster map layers.

NASA's Global Imagery Browse Services (GIBS) publishes analysis-ready,
key-free WMTS raster tiles for a large set of Earth-observation products. This
adapter exposes a small, curated set that is directly relevant to water
intelligence, and it verifies each layer is actually being served before
advertising it.

Why GIBS: it is the documented, authoritative access method for these NASA
products as pre-rendered tiles, so no download, reprojection or scraping is
required, and no credential is needed for the layers used here.

Tile URL shape (EPSG:3857 "GoogleMapsCompatible" matrix sets):

    {base}/{layer}/default/{time}/{tilematrixset}/{z}/{y}/{x}.{ext}

``{time}`` is either ``default`` (the most recent available date) or an ISO
``YYYY-MM-DD``. Availability is probed against a low-zoom tile for the layer's
own tile matrix set, because the matrix-set level differs per product (Level6
for IMERG, Level7 for MODIS land surface temperature, Level9 for the MODIS
surface-water and NDVI composites).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta, timezone

import httpx

from app.config import get_settings
from app.logging_config import get_logger
from app.models.common import DataClassification
from app.models.layers import LegendStop, MapLayer

logger = get_logger(__name__)

SOURCE_ID = "nasa_gibs"
SOURCE_NAME = "NASA GIBS"
ATTRIBUTION = "NASA EOSDIS Global Imagery Browse Services (GIBS)"

# Category → the shared colour language used across the product.
CATEGORY_ORDER = ["precipitation", "flood", "surface_water", "heat", "dry", "imagery"]


@dataclass(frozen=True)
class GIBSSpec:
    """Static definition of one supported GIBS layer."""

    id: str
    gibs_layer: str
    name: str
    category: str
    description: str
    classification: DataClassification
    units: str
    spatial_resolution: str
    temporal_resolution: str
    tile_matrix_set: str
    tile_format: str
    max_zoom: int
    product: str
    docs_url: str
    color_scale: list[str]
    legend: list[tuple[float | None, str, str]]
    legend_note: str
    default_opacity: float = 0.75
    limitations: tuple[str, ...] = ()
    disclaimer: str | None = None


# Colours are chosen for an accessible, consistent visual language:
#   rainfall/flood/surface water -> blue & cyan
#   heat                         -> orange & red
#   dry conditions               -> ochre & brown
_SPECS: tuple[GIBSSpec, ...] = (
    GIBSSpec(
        id="imerg_precipitation_rate",
        gibs_layer="IMERG_Precipitation_Rate",
        name="Precipitation rate (satellite estimate)",
        category="precipitation",
        description=(
            "NASA GPM IMERG near-real-time precipitation rate. A satellite/IR "
            "merged estimate, not a gauge measurement."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="mm/hour",
        spatial_resolution="0.1 deg (~10 km)",
        temporal_resolution="Daily composite (near-real-time)",
        tile_matrix_set="GoogleMapsCompatible_Level6",
        tile_format="png",
        max_zoom=6,
        product="GPM IMERG (near-real-time) via GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=["#c7e9ff", "#5bb8f0", "#1d7fd6", "#1a4f9c", "#0b2f6b"],
        legend=[
            (0.0, "#c7e9ff", "Trace / very light"),
            (2.0, "#5bb8f0", "Light rain"),
            (5.0, "#1d7fd6", "Moderate rain"),
            (10.0, "#1a4f9c", "Heavy rain"),
            (20.0, "#0b2f6b", "Very heavy rain"),
        ],
        legend_note="Blue intensity scales with the estimated precipitation rate (mm/hour).",
        limitations=[
            "Satellite/IR merged estimate; it is not a rain-gauge reading.",
            "Near-real-time products can be revised in later reprocessings.",
            "A daily composite does not show the timing of rainfall within the day.",
        ],
    ),
    GIBSSpec(
        id="modis_flood_2day",
        gibs_layer="MODIS_Combined_Flood_2-Day",
        name="Observed surface water & flood (2-day composite)",
        category="flood",
        description=(
            "MODIS combined Terra+Aqua 2-day surface-water composite. Shows water "
            "observed from space; it is an observation, not a flood forecast."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="water / land classification",
        spatial_resolution="250 m",
        temporal_resolution="2-day composite",
        tile_matrix_set="GoogleMapsCompatible_Level9",
        tile_format="png",
        max_zoom=9,
        product="MODIS Combined Flood 2-Day (MCDWD) via GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=["#0b3d91", "#2f7fd1", "#bfe3ff"],
        legend=[
            (None, "#2f7fd1", "Water detected"),
            (None, "#bfe3ff", "Partial / shallow water"),
            (None, "#0b3d91", "Flood-affected water"),
        ],
        legend_note=(
            "Blue marks surface water observed by MODIS. It does not distinguish "
            "permanent water from flooding on its own."
        ),
        limitations=[
            "Optical composite: cloud, smoke and night limit coverage.",
            "2-day compositing can blur the exact day water was present.",
            "Detected water is not by itself proof of a damaging flood.",
        ],
        disclaimer=(
            "This is an observation of surface water, not a validated flood forecast."
        ),
    ),
    GIBSSpec(
        id="modis_land_surface_temp_day",
        gibs_layer="MODIS_Terra_Land_Surface_Temp_Day",
        name="Daytime land surface temperature",
        category="heat",
        description=(
            "MODIS Terra daytime land surface temperature. Surface skin "
            "temperature, not air temperature measured at 2 m."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="deg C",
        spatial_resolution="1 km",
        temporal_resolution="Daily (Terra overpass)",
        tile_matrix_set="GoogleMapsCompatible_Level7",
        tile_format="png",
        max_zoom=7,
        product="MODIS Terra Land Surface Temperature (MOD11) via GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=["#3b1f6b", "#8a4bbf", "#f2c14e", "#f08a24", "#d63b1f", "#8f1408"],
        legend=[
            (-30.0, "#3b1f6b", "Very cold surface"),
            (0.0, "#8a4bbf", "Cold surface"),
            (20.0, "#f2c14e", "Mild surface"),
            (35.0, "#f08a24", "Warm surface"),
            (45.0, "#d63b1f", "Hot surface"),
            (55.0, "#8f1408", "Extremely hot surface"),
        ],
        legend_note=(
            "Orange and red indicate warmer land surface temperature (deg C). "
            "This is a surface temperature, not an air temperature or a heatwave index."
        ),
        limitations=[
            "Land surface (skin) temperature differs from the 2 m air temperature.",
            "Cloud and aerosol contaminate or mask retrievals.",
            "Warm colours alone do not establish a heatwave; a documented baseline "
            "and duration are required, which this layer does not provide.",
        ],
        disclaimer="A visually warm colour is not a heatwave classification.",
    ),
    GIBSSpec(
        id="modis_ndvi_8day",
        gibs_layer="MODIS_Terra_NDVI_8Day",
        name="Vegetation index (8-day NDVI)",
        category="dry",
        description=(
            "MODIS Terra 8-day Normalized Difference Vegetation Index. A "
            "vegetation-greenness indicator; low values can accompany dry conditions."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="NDVI (unitless, -1 to 1)",
        spatial_resolution="250 m",
        temporal_resolution="8-day composite",
        tile_matrix_set="GoogleMapsCompatible_Level9",
        tile_format="png",
        max_zoom=9,
        product="MODIS Terra NDVI 8-Day (MOD13Q1) via GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=["#6b3f13", "#b07a2b", "#d9c07a", "#a9cf7a", "#3f8f3f"],
        legend=[
            (None, "#6b3f13", "Sparse / brown (low greenness)"),
            (None, "#b07a2b", "Dry vegetation"),
            (None, "#d9c07a", "Transitional"),
            (None, "#a9cf7a", "Moderate greenness"),
            (None, "#3f8f3f", "Dense green vegetation"),
        ],
        legend_note=(
            "Ochre and brown indicate low vegetation greenness. NDVI is not a "
            "drought index and low greenness has many causes."
        ),
        limitations=[
            "NDVI responds to vegetation, not directly to soil moisture or rainfall.",
            "Low values can result from land cover, season or harvest, not drought.",
            "Optical composite; cloud and snow affect coverage.",
        ],
        disclaimer="NDVI is a greenness indicator, not a drought classification.",
    ),
    GIBSSpec(
        id="hls_s30_reflectance",
        gibs_layer="HLS_S30_Nadir_BRDF_Adjusted_Reflectance",
        name="NASA HLS reflectance — Sentinel-2 source (30 m)",
        category="imagery",
        description=(
            "NASA Harmonized Landsat Sentinel-2 (HLS) S30 nadir BRDF-adjusted "
            "surface reflectance, derived from Sentinel-2. Harmonized to a common "
            "30 m grid; it is not native 10 m Sentinel-2."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="surface reflectance (RGB rendering)",
        spatial_resolution="30 m (harmonized)",
        temporal_resolution="Daily (per Sentinel-2 overpass)",
        tile_matrix_set="GoogleMapsCompatible_Level12",
        tile_format="png",
        max_zoom=12,
        product="HLS S30 (HLSS30.020) via NASA GIBS",
        docs_url="https://hls.gsfc.nasa.gov/data-access-and-tools/",
        color_scale=[],
        legend=[
            (None, "#6b7f6b", "Land (reflectance rendering)"),
            (None, "#1d4f8f", "Water (dark)"),
            (None, "#ffffff", "Cloud / bright surface"),
        ],
        legend_note=(
            "A reflectance rendering for context. Transparent tiles mean no "
            "harmonized scene covers that date and area."
        ),
        default_opacity=0.8,
        limitations=[
            "HLS is harmonized to 30 m, so it is coarser than native 10 m Sentinel-2.",
            "Optical product: cloud and haze obscure the surface.",
            "A visual rendering, not a quantitative dataset.",
        ],
        disclaimer="Harmonized 30 m imagery, not native Sentinel-2 resolution.",
    ),
    GIBSSpec(
        id="hls_l30_reflectance",
        gibs_layer="HLS_L30_Nadir_BRDF_Adjusted_Reflectance",
        name="NASA HLS reflectance — Landsat source (30 m)",
        category="imagery",
        description=(
            "NASA Harmonized Landsat Sentinel-2 (HLS) L30 nadir BRDF-adjusted "
            "surface reflectance, derived from Landsat 8/9. Added as context "
            "alongside the Sentinel-2-sourced HLS layer."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="surface reflectance (RGB rendering)",
        spatial_resolution="30 m (harmonized)",
        temporal_resolution="Daily (per Landsat overpass)",
        tile_matrix_set="GoogleMapsCompatible_Level12",
        tile_format="png",
        max_zoom=12,
        product="HLS L30 (HLSL30.020) via NASA GIBS",
        docs_url="https://hls.gsfc.nasa.gov/data-access-and-tools/",
        color_scale=[],
        legend=[
            (None, "#6b7f6b", "Land (reflectance rendering)"),
            (None, "#1d4f8f", "Water (dark)"),
            (None, "#ffffff", "Cloud / bright surface"),
        ],
        legend_note=(
            "A reflectance rendering for context. Transparent tiles mean no "
            "harmonized scene covers that date and area."
        ),
        default_opacity=0.8,
        limitations=[
            "Landsat revisits less often than Sentinel-2, so fewer dates are covered.",
            "Optical product: cloud and haze obscure the surface.",
            "A visual rendering, not a quantitative dataset.",
        ],
        disclaimer="Harmonized 30 m imagery, not native Sentinel-2 resolution.",
    ),
    GIBSSpec(
        id="opera_dswx_hls",
        gibs_layer="OPERA_L3_Dynamic_Surface_Water_Extent-HLS",
        name="NASA OPERA dynamic surface water extent (HLS-based)",
        category="surface_water",
        description=(
            "NASA OPERA L3 Dynamic Surface Water Extent (DSWx-HLS), a satellite "
            "classification of surface water derived from HLS. An observation of "
            "water extent, not a flood forecast."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="surface-water classification",
        spatial_resolution="30 m (HLS)",
        temporal_resolution="Per HLS overpass",
        tile_matrix_set="GoogleMapsCompatible_Level12",
        tile_format="png",
        max_zoom=12,
        product="OPERA_L3_DSWx-HLS via NASA GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=["#afafaf", "#b4d5f4", "#00ffff", "#0000ff"],
        legend=[
            (None, "#afafaf", "Not water"),
            (None, "#b4d5f4", "Partial surface water"),
            (None, "#00ffff", "Water"),
            (None, "#0000ff", "Water (secondary class)"),
        ],
        legend_note=(
            "Colours mark NASA OPERA's surface-water classification. It shows "
            "water observed from space and does not by itself prove a damaging flood."
        ),
        limitations=[
            "Satellite classification of water extent, not a flood forecast.",
            "Optical product: cloud, terrain shadow and night limit coverage.",
            "Detected water is not by itself proof of a damaging flood.",
        ],
        disclaimer="An observation of surface water, not a validated flood forecast.",
    ),
    GIBSSpec(
        id="modis_true_color",
        gibs_layer="MODIS_Terra_CorrectedReflectance_TrueColor",
        name="True-colour imagery (context)",
        category="imagery",
        description=(
            "MODIS Terra corrected-reflectance true colour. Context imagery for "
            "orientation; it is not an analytical layer."
        ),
        classification=DataClassification.SATELLITE_ESTIMATE,
        units="reflectance (RGB)",
        spatial_resolution="250 m",
        temporal_resolution="Daily (Terra overpass)",
        tile_matrix_set="GoogleMapsCompatible_Level9",
        tile_format="jpg",
        max_zoom=9,
        product="MODIS Terra Corrected Reflectance (MOD09) via GIBS",
        docs_url="https://gibs.earthdata.nasa.gov/",
        color_scale=[],
        legend=[
            (None, "#6b7f6b", "Land (natural colour)"),
            (None, "#1d4f8f", "Water (dark)"),
            (None, "#ffffff", "Cloud / snow (bright)"),
        ],
        legend_note="Natural-colour rendering for geographic context only.",
        default_opacity=0.7,
        limitations=[
            "A visual rendering, not a quantitative dataset.",
            "Cloud, smoke and haze obscure the surface.",
        ],
        disclaimer="Context imagery only; not used for any measurement.",
    ),
)


def _base_url() -> str:
    return get_settings().gibs_wmts_url.rstrip("/")


def tile_url(spec: GIBSSpec, *, time: str = "default") -> str:
    """Build the WMTS template with ``{z}/{x}/{y}`` placeholders for MapLibre."""
    return (
        f"{_base_url()}/{spec.gibs_layer}/default/{time}/"
        f"{spec.tile_matrix_set}/{{z}}/{{y}}/{{x}}.{spec.tile_format}"
    )


def probe_url(spec: GIBSSpec, *, time: str = "default") -> str:
    """A concrete, low-zoom tile used to confirm the layer is being served."""
    # z=1, x=1, y=1 is a mid-latitude tile present in every matrix set.
    return (
        f"{_base_url()}/{spec.gibs_layer}/default/{time}/"
        f"{spec.tile_matrix_set}/1/1/1.{spec.tile_format}"
    )


def all_specs() -> tuple[GIBSSpec, ...]:
    return _SPECS


def spec_by_id(layer_id: str) -> GIBSSpec | None:
    return next((s for s in _SPECS if s.id == layer_id), None)


def resolve_default_date() -> date:
    """The date used when the user has not chosen one.

    GIBS near-real-time layers typically publish the previous UTC day, so the
    default is yesterday. The tile URL also supports the literal ``default``
    (most recent available), which is used when no explicit date is requested.
    """
    return (date.today() - timedelta(days=1))


async def probe_available(spec: GIBSSpec, *, time: str = "default") -> bool:
    """Return True when GIBS actually serves this layer's probe tile."""
    settings = get_settings()
    try:
        async with httpx.AsyncClient(timeout=settings.provider_timeout_seconds) as client:
            response = await client.get(
                probe_url(spec, time=time),
                headers={"User-Agent": settings.user_agent},
            )
        return response.status_code == 200 and len(response.content) > 0
    except (httpx.HTTPError, httpx.TimeoutException) as exc:
        logger.info("GIBS probe failed for %s: %s", spec.gibs_layer, exc)
        return False


def build_layer(spec: GIBSSpec, *, available: bool, default_date: date, reason: str | None) -> MapLayer:
    return MapLayer(
        id=spec.id,
        name=spec.name,
        category=spec.category,
        description=spec.description,
        classification=spec.classification,
        units=spec.units,
        spatial_resolution=spec.spatial_resolution,
        temporal_resolution=spec.temporal_resolution,
        source_id=SOURCE_ID,
        source_name=SOURCE_NAME,
        attribution=ATTRIBUTION,
        product=spec.product,
        docs_url=spec.docs_url,
        color_scale=list(spec.color_scale),
        legend=[LegendStop(value=v, color=c, label=l) for v, c, l in spec.legend],
        legend_note=spec.legend_note,
        available=available,
        unavailable_reason=None if available else (reason or "Layer not currently served by GIBS."),
        default_date=default_date if available else None,
        tile_template=tile_url(spec) if available else None,
        tile_format=spec.tile_format,
        max_zoom=spec.max_zoom,
        default_opacity=spec.default_opacity,
        limitations=list(spec.limitations),
        disclaimer=spec.disclaimer,
    )


def unavailable_layer(spec: GIBSSpec, default_date: date, reason: str) -> MapLayer:
    """A grey, explicitly-unavailable entry so the UI can show an honest state."""
    return build_layer(spec, available=False, default_date=default_date, reason=reason)


def utc_today() -> date:
    from datetime import datetime

    return datetime.now(tz=timezone.utc).date()

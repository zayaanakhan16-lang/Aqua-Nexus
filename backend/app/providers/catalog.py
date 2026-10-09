"""Canonical provider catalog.

Each entry documents the real product, resolution, units, coverage, latency,
limitations and attribution. This is the single source of truth for how a
source is described in the UI; it is intentionally conservative.
"""
from __future__ import annotations

from app.models.common import DataClassification, ProviderMetadata

# --- Geographic search ---
OPEN_METEO_GEOCODING = ProviderMetadata(
    id="open_meteo_geocoding",
    name="Open-Meteo Geocoding",
    product="Open-Meteo Geocoding API",
    version="v1",
    url="https://open-meteo.com/en/docs/geocoding-api",
    attribution="Geocoding by Open-Meteo (data from GeoNames)",
    license="Free for non-commercial use; attributions required",
    classification=DataClassification.OBSERVATION,
    spatial_resolution="Point (gazetteer)",
    temporal_resolution="Static gazetteer",
    units="lat/lon degrees",
    coverage_note="Global gazetteer of cities, towns and named features.",
    limitations=[
        "Gazetteer lookup only; does not confirm hydrological relevance.",
        "Not every small settlement or hydronym is indexed.",
    ],
)

# --- Precipitation: near-real-time / forecast ---
OPEN_METEO_FORECAST = ProviderMetadata(
    id="open_meteo_forecast",
    name="Open-Meteo Forecast",
    product="Open-Meteo Weather Forecast API",
    version="v1",
    url="https://open-meteo.com/en/docs",
    attribution="Weather data by Open-Meteo.com (ICON, GFS and other models)",
    license="Free for non-commercial use; CC-BY-4.0 attribution",
    classification=DataClassification.FORECAST,
    spatial_resolution="~1-11 km depending on model",
    temporal_resolution="Hourly / daily",
    units="mm",
    latency_note="Real-time model output, refreshed as models update.",
    coverage_note="Global land and coastal areas.",
    limitations=[
        "Model forecast, not a measurement of what occurred.",
        "Accuracy degrades with lead time and in complex terrain.",
        "Convective precipitation can be spatially displaced.",
    ],
)

# --- Precipitation: recent past ---
OPEN_METEO_ARCHIVE = ProviderMetadata(
    id="open_meteo_archive",
    name="Open-Meteo Historical Weather",
    product="Open-Meteo ERA5 / ERA5-Land archive",
    version="v1",
    url="https://open-meteo.com/en/docs/historical-weather-api",
    attribution="Contains modified Copernicus Climate Change Service information (ERA5)",
    license="ERA5: Copernicus licence; served via Open-Meteo non-commercial terms",
    classification=DataClassification.REANALYSIS,
    spatial_resolution="~9 km (ERA5) / ~11 km (ERA5-Land)",
    temporal_resolution="Hourly / daily",
    units="mm",
    latency_note="~5 days behind real time.",
    coverage_note="Global, 1940 to near-present.",
    limitations=[
        "Reanalysis blends a model with observations; it is not a pure gauge record.",
        "Smoothed relative to point measurements, especially in mountain terrain.",
        "Not a substitute for national gauge networks.",
    ],
)

# --- Precipitation: climate baseline for anomalies ---
OPEN_METEO_CLIMATE = ProviderMetadata(
    id="open_meteo_climate",
    name="Open-Meteo Climate API",
    product="Open-Meteo downscaled CMIP6 / HighResMIP",
    version="v1",
    url="https://open-meteo.com/en/docs/climate-api",
    attribution="Climate data via Open-Meteo (CMIP6 downscaled)",
    license="Free for non-commercial use; model-dependent licensing",
    classification=DataClassification.SIMULATION,
    spatial_resolution="~10-25 km",
    temporal_resolution="Daily",
    units="mm",
    coverage_note="Global, historical and projection periods, model-dependent.",
    limitations=[
        "Climate model output, not observations; treat as a modelled baseline.",
        "Different models disagree; results are dependency-sensitive.",
        "Use the same model consistently when comparing periods.",
    ],
)

# --- River discharge ---
OPEN_METEO_FLOOD = ProviderMetadata(
    id="open_meteo_flood",
    name="Open-Meteo Flood",
    product="Open-Meteo Flood API (GloFAS v4)",
    version="v1",
    url="https://open-meteo.com/en/docs/flood-api",
    attribution="River discharge based on GloFAS (Copernicus Emergency Management Service)",
    license="Free for non-commercial use; GloFAS attribution required",
    classification=DataClassification.SIMULATION,
    spatial_resolution="~5 km (GloFAS river network)",
    temporal_resolution="Daily",
    units="m3/s",
    latency_note="Forecast from model initial conditions.",
    coverage_note="Global river network as modelled in GloFAS.",
    limitations=[
        "Modelled discharge, not a gauge measurement.",
        "Small or unmonitored catchments may be poorly represented.",
        "Values are grid-cell averages along the modelled river network.",
    ],
)

# --- Satellite catalogue ---
CDSE_STAC = ProviderMetadata(
    id="cdse_stac",
    name="Copernicus Data Space STAC",
    product="Sentinel-2 L2A (and other collections)",
    version="STAC 1.0",
    url="https://dataspace.copernicus.eu/",
    attribution="Contains modified Copernicus Sentinel data",
    license="Copernicus Sentinel Data: free, open, attribution required",
    classification=DataClassification.SATELLITE_ESTIMATE,
    spatial_resolution="10/20/60 m (Sentinel-2)",
    temporal_resolution="~5-day revisit",
    units="scene metadata",
    latency_note="New acquisitions appear within hours to days.",
    coverage_note="Global land and coastal waters (Sentinel-2 coverage).",
    limitations=[
        "Catalogue search returns scene metadata, not analysis-ready imagery.",
        "Optical imagery is cloud-affected during overcast periods.",
        "Water-body classification and change detection are not yet implemented.",
    ],
)

# --- NASA POWER (independent precipitation cross-check) ---
NASA_POWER = ProviderMetadata(
    id="nasa_power",
    name="NASA POWER",
    product="NASA POWER Daily (MERRA-2)",
    version="v2",
    url="https://power.larc.nasa.gov/",
    attribution="NASA Prediction Of Worldwide Energy Resources (POWER) project",
    license="NASA open data; no restriction",
    classification=DataClassification.REANALYSIS,
    spatial_resolution="~0.5 x 0.625 deg (MERRA-2)",
    temporal_resolution="Daily",
    units="mm/day",
    latency_note="A few days behind real time.",
    coverage_note="Global, 1981 to near-present.",
    limitations=[
        "Reanalysis product; coarse relative to point measurements.",
        "Intended as an independent cross-check, not a gauge record.",
    ],
)

# --- Satellite precipitation estimate: NASA GPM IMERG (Late Daily V07) ---
GPM_IMERG_LATE_DAILY = ProviderMetadata(
    id="nasa_imerg_late_daily",
    name="NASA GPM IMERG Late Daily",
    product="GPM IMERG Late Precipitation L3 1 day 0.1 x 0.1 degree V07",
    version="V07 (GPM_3IMERGDL)",
    url="https://doi.org/10.5067/GPM/IMERGDL/DAY/07",
    attribution="NASA GPM IMERG (GES DISC)",
    license="Creative Commons Attribution 4.0 (CC-BY-4.0)",
    classification=DataClassification.SATELLITE_ESTIMATE,
    spatial_resolution="0.1 x 0.1 degree (~10 x 10 km)",
    temporal_resolution="Daily (UTC)",
    units="mm/day (daily mean rate)",
    latency_note="Late Run, ~14 h after UTC day close.",
    coverage_note=(
        "Global, 1998-01-01 to near-present. Full skill 60N-60S; lower skill over "
        "frozen surfaces, complex terrain and coasts."
    ),
    limitations=[
        "Satellite/infrared estimate, not a gauge measurement.",
        "Value is a daily mean rate (mean valid half-hourly rate x 24), not an accumulated total.",
        "Grid cells with precipitation_cnt=0 are fill (-9999.9): no estimate, never 0 mm.",
        "Requires NASA Earthdata credentials; retrieval is server-side only.",
    ],
)

ALL_PROVIDERS = [
    OPEN_METEO_GEOCODING,
    OPEN_METEO_FORECAST,
    OPEN_METEO_ARCHIVE,
    OPEN_METEO_CLIMATE,
    OPEN_METEO_FLOOD,
    CDSE_STAC,
    NASA_POWER,
    GPM_IMERG_LATE_DAILY,
]


def provider_by_id(provider_id: str) -> ProviderMetadata | None:
    return next((p for p in ALL_PROVIDERS if p.id == provider_id), None)

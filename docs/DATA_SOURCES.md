# Data sources

AquaNexus integrates genuine, credential-free data sources by default. Each
source below is described with the facts the UI actually uses: product,
resolution, units, latency, coverage, licensing and limitations. The canonical
record lives in `backend/app/providers/catalog.py`; this document mirrors it for
readers.

> Endpoints and terms change. Provider facts should be re-verified against the
> linked documentation before production use.

---

## A. Geographic search

**Open-Meteo Geocoding API** — `open_meteo_geocoding`
<https://open-meteo.com/en/docs/geocoding-api>

- Classification: point / gazetteer lookup
- Resolution: point (lat/lon)
- Coverage: global gazetteer (data from GeoNames)
- Auth: **none**
- Attribution: "Geocoding by Open-Meteo (data from GeoNames)"
- Limitations: gazetteer lookup only; not every settlement or hydronym is indexed.

AquaNexus also parses raw coordinates (`"52.52, 13.40"`) without any network
call, so a location can always be selected even when a dataset does not cover it.

---

## B. Precipitation — forecast

**Open-Meteo Weather Forecast API** — `open_meteo_forecast`
<https://open-meteo.com/en/docs>

- Classification: **forecast**
- Resolution: ~1–11 km depending on model (ICON, GFS, …)
- Temporal: hourly / daily
- Units: mm
- Coverage: global land and coastal areas
- Auth: **none**
- Limitations: model forecast, not a measurement; accuracy degrades with lead
  time and complex terrain; convective precipitation can be displaced.

Forecasts are kept visually and structurally separate from observations.

---

## C. Precipitation — recent past (reanalysis)

**Open-Meteo Historical Weather API (ERA5 / ERA5-Land)** — `open_meteo_archive`
<https://open-meteo.com/en/docs/historical-weather-api>

- Classification: **reanalysis**
- Resolution: ~9 km (ERA5) / ~11 km (ERA5-Land)
- Temporal: hourly / daily
- Units: mm
- Coverage: global, 1940 → near-present
- Latency: ~5 days behind real time
- Auth: **none**
- Attribution: "Contains modified Copernicus Climate Change Service information (ERA5)"
- Limitations: blends a model with observations; smoothed relative to point
  gauges, especially in mountains; not a substitute for national gauge networks.

This is the workhorse for the observed rainfall series and the baseline window.

---

## D. Precipitation — climate baseline (modelled)

**Open-Meteo Climate API (downscaled CMIP6 / HighResMIP)** — `open_meteo_climate`
<https://open-meteo.com/en/docs/climate-api>

- Classification: **simulation**
- Resolution: ~10–25 km
- Units: mm
- Coverage: global, historical and projection periods, model-dependent
- Auth: **none**
- Limitations: climate-model output, not observations; models disagree; use the
  same model consistently when comparing periods.

The adapter exists and is catalogued; the anomaly baseline currently uses the
ERA5 reanalysis for like-for-like comparison. A dedicated CDS baseline is the
next planned upgrade (see README).

---

## E. River discharge — modelled

**Open-Meteo Flood API (GloFAS v4)** — `open_meteo_flood`
<https://open-meteo.com/en/docs/flood-api>

- Classification: **simulation** (modelled, not gauged)
- Resolution: ~5 km modelled river network
- Temporal: daily
- Units: m³/s
- Coverage: global river network as modelled in GloFAS
- Auth: **none**
- Attribution: "River discharge based on GloFAS (Copernicus Emergency Management Service)"
- Limitations: modelled discharge, not a gauge measurement; small or unmonitored
  catchments may be poorly represented; values are grid-cell averages.

The hydrological **interface** is modular so a regional gauge network can be
added later — but no provider covering one country is ever presented as a global
monitoring network.

---

## F. Satellite imagery — catalogue search

**Copernicus Data Space Ecosystem STAC** — `cdse_stac`
<https://dataspace.copernicus.eu/> · <https://documentation.dataspace.copernicus.eu/>

- Classification: **satellite_estimate**
- Product: Sentinel-2 L2A (and other collections)
- Resolution: 10 / 20 / 60 m
- Temporal: ~5-day revisit
- Coverage: global land and coastal waters
- Auth: **anonymous search supported** (a token is only needed for authenticated
  asset downloads, which this stage does not perform)
- Attribution: "Contains modified Copernicus Sentinel data"
- Limitations: catalogue search returns **scene metadata, not analysis-ready
  imagery**; optical scenes are cloud-affected; water-body classification and
  change detection are **not implemented**.

AquaNexus queries the catalogue by geographic extent and acquisition time and
renders footprints from real scene metadata. It does not claim to analyse the
imagery.

---

## G. Independent cross-check

**NASA POWER Daily (MERRA-2)** — `nasa_power`
<https://power.larc.nasa.gov/>

- Classification: **reanalysis**
- Resolution: ~0.5 × 0.625°
- Temporal: daily
- Units: mm/day
- Coverage: global, 1981 → near-present
- Auth: **none**
- Limitations: coarse reanalysis; intended as an independent cross-check, not a
  gauge record.

Used to compute `cross_check_delta` — a sanity signal on the ERA5 series, not a
correction.

---

## Data classification taxonomy

| Classification | Meaning |
| --- | --- |
| `observation` | Measured directly by an instrument or gauge. |
| `satellite_estimate` | Derived from remote sensing; not a point measurement. |
| `reanalysis` | Model reconstruction constrained by observations. |
| `forecast` | Modelled prediction of what may occur. |
| `derived` | Computed by AquaNexus from the listed inputs. |
| `simulation` | Scenario or model output, not a measurement. |
| `demonstration` | Synthetic value shown only to illustrate the interface. |

Every API response carries the source name, observation/forecast timestamp,
retrieval timestamp, unit, resolution, product identifier, method and
classification.

## Credential-gated sources (optional)

These are documented and adapter-ready but not required to run AquaNexus:

- **NASA GPM IMERG** (near-real-time satellite precipitation) — needs a NASA
  Earthdata token for downloads. `AQUANEXUS_EARTHDATA_TOKEN`.
- **Copernicus Data Space authenticated downloads** —
  `AQUANEXUS_CDSE_USERNAME` / `AQUANEXUS_CDSE_PASSWORD`.
- **Copernicus Climate Data Store** — planned adapter.

When a credential is absent, the provider reports `unconfigured`; it is never
silently skipped and never replaced with fabricated data.

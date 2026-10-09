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

## H. Satellite precipitation — NASA GPM IMERG Late Daily V07

**GPM IMERG Late Precipitation L3 1 day 0.1° × 0.1° V07** — `nasa_imerg_late_daily`
DOI: <https://doi.org/10.5067/GPM/IMERGDL/DAY/07> · GES DISC · CC-BY-4.0

- Classification: **satellite_estimate** (never `reanalysis` or `observation`;
  this is deliberately distinct from the ERA5/MERRA-2 reanalysis series).
- Resolution: 0.1° × 0.1° (~10 × 10 km); daily (UTC).
- Units: **mm/day — a daily *mean rate***, derived as the mean of the valid
  half-hourly (mm/hour) rates in a cell multiplied by 24. It is **not** an
  accumulated daily total.
- Coverage: global, 1998-01-01 → near-present. Full skill 60°N–60°S; lower skill
  over frozen surfaces, complex terrain and coasts.
- Latency: **Late Run, ~14 h** after the UTC day closes (a couple of minutes
  after the last half-hourly granule is archived).
- Auth: **NASA Earthdata Login** (required). Retrieval is server-side only.

**Object layout (verified against GES DISC / CMR):**

```
s3://gesdisc-cumulus-prod-protected/GPM_L3/GPM_3IMERGDL.07/YYYY/MM/
    3B-DAY-L.MS.MRG.3IMERG.YYYYMMDD-S000000-E235959.V07B.nc4
```

- Region `us-west-2`. Anonymous HTTPS mirror:
  `https://data.gesdisc.earthdata.nasa.gov/data/GPM_L3/GPM_3IMERGDL.07/…`.
- Format: **NetCDF4**. Variables: `precipitation` (mm/day, `float32`, fill
  **-9999.900390625**), `precipitation_cnt` (valid half-hourly retrievals,
  0–48), `MWprecipitation`/`MWprecipitation_cnt`, `randomError`,
  `probabilityLiquidPrecipitation`, `lat`, `lon`, `time`
  (days since 1980-01-06 UTC).

**Value interpretation — the part that is easy to get wrong:**

- `precipitation_cnt == 0` means the cell was **filled**: there is no estimate.
  AquaNexus returns `None` and **never** 0 mm.
- `precipitation_cnt > 0` with value `0.0` is a **valid dry day** and is kept as
  0.0 mm/day.
- The count is preserved as a quality metric and drives area coverage
  (`valid_cells / total_cells`); a partly-filled box is never shown as complete.

**Access model:** AquaNexus signs S3 `GetObject` requests with AWS Signature
Version 4 using short-lived STS credentials obtained from the GES DISC
`/s3credentials` endpoint via Earthdata Login. Credentials are **valid for 1
hour** (AWS role-chaining limit) and are cached in memory and refreshed
proactively before expiry. Downloads are bounded by
`AQUANEXUS_IMERG_MAX_DOWNLOAD_BYTES` and per-request ranges by
`AQUANEXUS_IMERG_MAX_DAYS`. Reading the granules requires the optional
`imerg` extra (`xarray` + `h5netcdf`).

**Limitations**

- Satellite/IR merged estimate, not a gauge measurement.
- Changing constellation over time can introduce artifacts in multi-year studies.
- Spatial subsetting uses OPeNDAP/grid-index selection; antimeridian-crossing
  boxes are rejected rather than silently mis-sampled.



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

- **NASA GPM IMERG Late Daily V07** (satellite precipitation estimate) — needs
  NASA Earthdata Login. Set `AQUANEXUS_EARTHDATA_USERNAME` and
  `AQUANEXUS_EARTHDATA_PASSWORD` (server-side only; used to obtain short-lived
  1-hour S3 credentials). Also install the optional reader:
  `pip install -e "backend[imerg]"`.
- **Copernicus Data Space authenticated downloads** —
  `AQUANEXUS_CDSE_USERNAME` / `AQUANEXUS_CDSE_PASSWORD`.
- **Copernicus Climate Data Store** — planned adapter.

When a credential is absent, the provider reports `unconfigured`; it is never
silently skipped and never replaced with fabricated data.

### Setting the Earthdata credentials safely (Windows)

Do not paste credentials into chat, source files, or example env files. Use one
of the following, all of which keep values out of version control:

PowerShell (current session only):

```powershell
$env:AQUANEXUS_EARTHDATA_USERNAME = Read-Host "Earthdata username"
$env:AQUANEXUS_EARTHDATA_PASSWORD = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
```

Persisted for your user account (not the machine, not committed):

```powershell
[Environment]::SetEnvironmentVariable("AQUANEXUS_EARTHDATA_USERNAME", "your-user", "User")
[Environment]::SetEnvironmentVariable("AQUANEXUS_EARTHDATA_PASSWORD", "your-pass", "User")
# Open a new shell so the new user variables are visible.
```

Or copy `.env.example` to `backend/.env` and fill the two values locally. `.env`
is git-ignored. Verify configuration without revealing secrets:

```powershell
curl http://localhost:8000/api/v1/readiness   # nasa_imerg should be "ok"
```

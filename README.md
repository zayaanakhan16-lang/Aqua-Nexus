# AquaNexus — Global Water Intelligence Platform

**Understand Water. Detect Risks. Find Solutions.**

AquaNexus is a worldwide geospatial intelligence workspace for investigating water
conditions. It combines satellite-era rainfall, reanalysis history, weather
forecasts, modelled river discharge, satellite scene imagery, NASA global raster
layers, and global place search into one traceable interface, and it turns a
selected study area into a branded, downloadable PDF report.

It is built to be **scientifically honest**: every value carries a source, a
timestamp, a unit, a resolution and a data classification. When a dataset does
not cover a location, AquaNexus says so instead of inventing a number.

> Rainfall deficits alone do not prove water scarcity; heavy rainfall does not
> automatically mean a flood occurred. AquaNexus presents evidence and its
> limits, not unsupported certainty.

---

## What is implemented

| Area | Status | Notes |
| --- | --- | --- |
| Global interactive map (MapLibre GL) | **Complete** | Key-free OpenFreeMap style, pan/zoom, click-to-select, marker |
| Non-WebGL 2D map fallback | **Complete** | Raster slippy map (OSM tiles, no WebGL) with pan/zoom/click-select when GL cannot start |
| Global place + coordinate search | **Complete** | Open-Meteo Geocoding; coordinate parser works offline |
| Global raster data layers | **Complete** | NASA GIBS WMTS (key-free): IMERG precipitation, MODIS surface water/flood, MODIS land-surface temperature, MODIS NDVI, true colour. Each is probed live; unserved layers are shown greyed with a reason |
| Map layer legends + visual language | **Complete** | Per-layer colour legend, units, resolution, source and attribution drawn from the same catalog the tiles come from |
| Precipitation time series | **Complete** | 30/60/90-day windows via Open-Meteo Archive (ERA5) |
| Historical baseline comparison + anomaly | **Complete** | Same-number-of-days baseline from prior year(s) |
| 7-day precipitation forecast | **Complete** | Open-Meteo Forecast, kept separate from history |
| Weather conditions + daily forecast | **Complete** | Open-Meteo Forecast; labelled modelled, never observed |
| Modelled river discharge | **Complete** | Open-Meteo Flood (GloFAS), reported as modelled |
| Heat indicator | **Complete** | ERA5 daily mean air temperature; anomaly vs. the same window last year (not a heatwave classification) |
| Dry-condition indicator | **Complete** | Dry-day count and wet-day fraction; documented as threshold-dependent rainfall statistics, not a drought index |
| NASA POWER cross-check | **Complete** | Independent reanalysis corroboration, reported as a shared-valid-date delta |
| Satellite scene search + imagery | **Complete** | Copernicus CDSE STAC (anonymous); scene metadata **and** the catalogue's rendered preview thumbnail |
| Saved study areas (persistence) | **Complete** | JSON-file store behind `/api/v1/study-areas`; CRUD + per-area workspace |
| Evidence-grounded AI analysis | **Complete (optional)** | Groq-powered narrative over the real location summary; reports `unconfigured` without `GROQ_API_KEY` and `insufficient_evidence` when the package is too thin to interpret |
| Professional PDF report | **Complete** | Server-rendered branded PDF from the *actual* selected area, period and analysis; preview endpoint shows exactly what the PDF contains |
| Data provenance + classification | **Complete** | Observations, reanalysis, forecasts, derived, simulation |
| Water-body change detection | **Planned** | No verified processing pipeline yet; not claimed |
| Flood prediction model | **Not provided** | Explicitly out of scope; flood section reports modelled discharge and rainfall-based potential only |

Every row above reflects code that runs. Nothing is presented as live that is
not actually connected.

---

## Architecture

```
frontend/  Next.js 14 (App Router) · React · TypeScript (strict) · Tailwind · MapLibre GL · ECharts · Zod
backend/   FastAPI · Pydantic · HTTPX · modular providers + analysis services · Pytest
```

```
Browser ──▶ Next.js app shell (Landing / Intelligence Home / Explore / Study Areas)
                │  same-origin route-handler proxy  /api/v1/*  ──▶  FastAPI
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    ▼                   ▼                   ▼
                              Provider adapters   Analysis services   Provenance models
                              (Open-Meteo, NASA   (aggregation,        (source, time,
                               POWER, CDSE STAC,   anomaly,            classification,
                               geocoding, GloFAS)  indicators,          quality)
                                                   summary)
```

Key decisions:

- **Provider logic never lives in route handlers.** Routes validate input,
  call a service, and return a typed model.
- **Science never lives in React.** Aggregation, anomaly and indicator maths
  are pure Python functions with their own tests.
- **The frontend validates every response with Zod.** A drifting contract
  becomes a typed error, not a silent bad render.
- **Same-origin API proxy.** The browser only talks to Next.js; a catch-all
  route handler forwards `/api/v1/*` to the backend origin, configured
  server-side. An unreachable backend returns a structured `503`
  (`backend_unreachable`) instead of a bare `500`, so the UI can show an honest
  "API unreachable" state. No credentials reach the client bundle.
- **The map never depends on WebGL.** MapLibre GL is the primary renderer, but a
  real raster slippy map takes over automatically when a WebGL context cannot be
  created, so pan/zoom/select keep working.
- **Persistence is a small file-backed store.** Saved study areas live in a
  JSON file behind `/api/v1/study-areas`; no database is introduced until
  geographic queries genuinely need PostGIS.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for module-by-module detail,
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for provider facts, and
[`docs/SCIENCE.md`](docs/SCIENCE.md) for formulas, baselines and limitations.

---

## Quick start

Requirements: **Node ≥ 20** and **Python ≥ 3.11**. No API keys are required to
run the full application.

### 1. Backend (FastAPI, port 8000)

```bash
cd backend
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs> · health: <http://localhost:8000/api/v1/health>

### 2. Frontend (Next.js, port 3000)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000  → landing page; app under /home
```

The frontend proxies `/api/*` to `http://localhost:8000` by default via the
route handler at `frontend/src/app/api/v1/[...path]/route.ts`. If the backend
runs elsewhere, set `AQUANEXUS_BACKEND_ORIGIN` (server-side only).

### 3. Configuration

Copy `.env.example` to `backend/.env` (and/or `frontend/.env.local`). All
variables are optional for the default experience — every credential-gated
provider simply reports `unconfigured`. Never commit a filled `.env`.

To enable AI analysis, set `GROQ_API_KEY` (and optionally `GROQ_MODEL`, default
`llama-3.3-70b-versatile`) in `backend/.env`. AquaNexus uses Groq's
OpenAI-compatible chat-completions endpoint; a non-Groq OpenAI-compatible
endpoint can be configured with `AQUANEXUS_AI_*`, but it is used only when
`GROQ_API_KEY` is unset. With no AI credential the application and the PDF
report stay fully functional, using a factual non-AI summary instead.

---

## Judge walkthrough (2 minutes)

1. Open <http://localhost:3000>. The animated Earth globe loads, then the
   **landing page** explains the product.
2. Enter the app at **/home** (Intelligence Home): identity, data-source
   availability and saved study areas (a real first-run empty state).
3. Go to **Explore**. The global map is shown immediately, with a layer catalog.
   Open the **Global Layers** tab: each layer shows its units, resolution,
   source, live availability and colour legend. Select one to draw it over the
   map, and change its date and opacity.
4. Search for a place (e.g. *Lagos*), or click anywhere on the map. The
   workspace loads that location's real analysis: overview indicators, weather,
   precipitation with a year-over-year anomaly, Water Stress, modelled
   discharge, and the Sentinel-2 scene list **with rendered previews**.
5. Open the **AI Analysis** tab. Without `GROQ_API_KEY` it reports
   `unconfigured` and still shows the grounded evidence package; with a Groq key
   it produces a structured, evidence-cited narrative.
6. Open the **Report** tab. The preview shows exactly what the PDF will contain
   for this area and period. Click **Download PDF report** for the branded
   AquaNexus PDF.
7. Optionally **save the study area** and revisit it later from /study-areas.

---

## Verification commands

Backend:

```bash
cd backend && . .venv/bin/activate
pytest -q                 # 128 tests
```

Frontend:

```bash
cd frontend
npm run typecheck         # tsc --noEmit
npm run lint              # eslint via next lint
npm test                  # vitest, 72 tests
npm run build             # next build
```

### Real-provider smoke test (distinct from automated tests)

Automated tests mock every provider. To exercise the live network paths, run a
smoke test against a real location, e.g. Lagos (6.45, 3.39):

```bash
cd backend && . .venv/bin/activate
python - <<'PY'
import asyncio, httpx
from app.main import app

async def main():
    t = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=t, base_url="http://t", timeout=60) as c:
        for path, params in [
            ("/api/v1/health", {}),
            ("/api/v1/geocode", {"q": "Lagos"}),
            ("/api/v1/precipitation/historical", {"latitude": 6.45, "longitude": 3.39, "days": 30}),
            ("/api/v1/location/summary", {"latitude": 6.45, "longitude": 3.39}),
        ]:
            r = await c.get(path, params=params)
            print(path, r.status_code)
asyncio.run(main())
PY
```

Last verified: all four endpoints returned `200`, and the summary reported
`open_meteo_archive`, `open_meteo_forecast`, `open_meteo_flood` and
`nasa_power` as `ok`.

---

## Security & secrets

- No secret is ever read by the browser. Only `NEXT_PUBLIC_API_BASE_URL`
  (a non-secret URL) is a client-exposed variable.
- Credentials are named `AQUANEXUS_*` and read server-side only.
- `.env` files are git-ignored; `.env.example` holds placeholders only.
- Logs never include credential values.

To add a credential later (for example a NASA Earthdata token for GPM IMERG
downloads), add the variable to `backend/.env` on the server — do not paste keys
into chat, source files or commits.

---

## Known limitations

- **Latency.** Open-Meteo Archive (ERA5) lags roughly 5 days; GIBS near-real-time
  layers publish roughly one day behind. Neither is a live feed.
- **Anomaly baseline.** Anomalies compare like-for-like day counts against the
  same calendar window of a prior year. They are only produced when both the
  observed and baseline series are complete and share a compatible
  classification. No anomaly is emitted otherwise.
- **Discharge is modelled, not gauged.** GloFAS via Open-Meteo is a model
  product; it is labelled as modelled, never as a gauge reading.
- **No point measurements.** There is no global in-situ gauge network in this
  build. The provider interface exists, but no worldwide gauge aggregation is
  claimed.
- **Satellite layers are estimates, not ground truth.** GIBS rasters are
  pre-rendered satellite products (IMERG, MODIS). A warm colour is a land-surface
  temperature, not an air temperature or a heatwave; low NDVI is a greenness
  signal, not a drought index; detected water is an observation, not a flood
  forecast. Each layer states these limits in its own legend panel.
- **Sentinel-2 shows catalogue imagery, not derived products.** The Satellite
  Explorer lists real scene records and the catalogue's rendered preview
  thumbnail. AquaNexus does **not** download or process Level-2A bands, so it
  makes no water-body classification or change-detection claim.
- **Provider coverage varies.** Some small islands and high latitudes have
  thinner data. The UI surfaces coverage rather than hiding gaps.

## Next highest-priority engineering tasks

1. Download and process Sentinel-2 L2A bands (NDWI/MNDWI) with cloud masking for
   genuine surface-water change detection between dates.
2. Add a Copernicus CDS adapter for genuine historical precipitation baselines
   with explicit dataset versioning.
3. Introduce a bounded cache (respecting provider terms) for repeated viewports.
4. Add a regional gauge provider (starting with a well-documented open network)
   behind the existing hydrological interface.
5. Move the study-area store from a single JSON file to a transactional database
   (PostGIS) once multi-user or geographic-query needs arise.

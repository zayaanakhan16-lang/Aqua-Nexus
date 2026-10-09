# AquaNexus — Global Water Intelligence Platform

**Understand Water. Detect Risks. Find Solutions.**

AquaNexus is a worldwide geospatial intelligence workspace for investigating water
conditions. It combines satellite-era rainfall, reanalysis history, weather
forecasts, modelled river discharge, satellite scene catalogue metadata, and
global place search into one traceable interface.

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
| Global place + coordinate search | **Complete** | Open-Meteo Geocoding; coordinate parser works offline |
| Precipitation time series | **Complete** | 30/60/90-day windows via Open-Meteo Archive (ERA5) |
| Historical baseline comparison + anomaly | **Complete** | Same-number-of-days baseline from prior year(s) |
| 7-day precipitation forecast | **Complete** | Open-Meteo Forecast, kept separate from history |
| Modelled river discharge | **Complete** | Open-Meteo Flood (GloFAS), reported as modelled |
| NASA POWER cross-check | **Complete** | Independent reanalysis corroboration |
| Satellite scene catalogue search | **Complete (metadata only)** | Copernicus CDSE STAC, anonymous |
| Data provenance + classification | **Complete** | Observations, reanalysis, forecasts, derived, simulation |
| Water-body change detection | **Planned** | No verified processing pipeline yet; not claimed |
| Flood prediction model | **Not provided** | Explicitly out of scope; not claimed |
| Saved workspaces / persistence | **Planned** | In-memory only today; no database introduced yet |

Every row above reflects code that runs. Nothing is presented as live that is
not actually connected.

---

## Architecture

```
frontend/  Next.js 14 (App Router) · React · TypeScript (strict) · Tailwind · MapLibre GL · ECharts · Zod
backend/   FastAPI · Pydantic · HTTPX · modular providers + analysis services · Pytest
```

```
Browser ──▶ Next.js /atlas (UI, React context workspace store)
                │  same-origin rewrite  /api/*  ──▶  FastAPI  /api/v1/*
                                                        │
                                    ┌───────────────────┼───────────────────┐
                                    ▼                   ▼                   ▼
                              Provider adapters   Analysis services   Provenance models
                              (Open-Meteo, NASA   (aggregation,        (source, time,
                               POWER, CDSE STAC,   anomaly,            classification,
                               geocoding)          indicators,          quality)
                                                   summary)
```

Key decisions:

- **Provider logic never lives in route handlers.** Routes validate input,
  call a service, and return a typed model.
- **Science never lives in React.** Aggregation, anomaly and indicator maths
  are pure Python functions with their own tests.
- **The frontend validates every response with Zod.** A drifting contract
  becomes a typed error, not a silent bad render.
- **Same-origin API proxy.** The browser only talks to Next.js; the backend
  origin is configured server-side. No credentials reach the client bundle.
- **No database yet.** Persistence is intentionally deferred until saved
  workspaces or geographic queries genuinely need PostGIS.

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
npm run dev          # http://localhost:3000  → redirects to /atlas
```

The frontend proxies `/api/*` to `http://localhost:8000` by default. If the
backend runs elsewhere, set `AQUANEXUS_BACKEND_ORIGIN` (see
`frontend/next.config.mjs`).

### 3. Configuration

Copy `.env.example` to `backend/.env` (and/or `frontend/.env.local`). All
variables are optional for the default experience — every credential-gated
provider simply reports `unconfigured`. Never commit a filled `.env`.

---

## Verification commands

Backend:

```bash
cd backend && . .venv/bin/activate
pytest -q                 # 45 tests
```

Frontend:

```bash
cd frontend
npm run typecheck         # tsc --noEmit
npm run lint              # eslint via next lint
npm test                  # vitest, 26 tests
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

- **Latency.** Open-Meteo Archive (ERA5) lags roughly 5 days; near-real-time
  satellite estimates (GPM IMERG) are not downloaded as rasters in this stage.
- **Anomaly baseline.** Anomalies compare like-for-like day counts against the
  same calendar window of a prior year. They are only produced when both the
  observed and baseline series are complete and share a compatible
  classification. No anomaly is emitted otherwise.
- **Discharge is modelled, not gauged.** GloFAS via Open-Meteo is a model
  product; it is labelled as modelled, never as a gauge reading.
- **No point measurements.** There is no global in-situ gauge network in this
  build. The provider interface exists, but no worldwide gauge aggregation is
  claimed.
- **Satellite layer shows catalogue metadata only.** Scene footprints and
  acquisition dates — no water-body classification or change detection yet.
- **Provider coverage varies.** Some small islands and high latitudes have
  thinner data. The UI surfaces coverage rather than hiding gaps.

## Next highest-priority engineering tasks

1. Add a Copernicus CDS adapter for genuine historical precipitation baselines
   with explicit dataset versioning.
2. Implement tiled precipitation raster overlays (GPM IMERG / ERA5-Land) for the
   map, with honest zoom-dependent coverage.
3. Introduce a bounded cache (respecting provider terms) for repeated viewports.
4. Add a regional gauge provider (starting with a well-documented open network)
   behind the existing hydrological interface.
5. Persist saved workspaces — the first genuine use for PostGIS.

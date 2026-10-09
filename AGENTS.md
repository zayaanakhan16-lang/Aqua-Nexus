# AGENTS.md — AquaNexus repository notes

Persistent context for agents working in this repository. Keep it short and
factual; update it when conventions change.

## What this is

AquaNexus — a global water intelligence platform. FastAPI backend + Next.js
frontend. Provenance-first: every value carries source, timestamp, unit,
resolution, method and a data classification. Never fabricate readings; emit an
explicit unavailable/`insufficient_data` state instead.

## Layout

- `backend/` — FastAPI app. `app/api/routes` (thin), `app/providers` (one
  adapter per source, catalog in `providers/catalog.py`), `app/services`
  (aggregation, anomaly, indicators, summary), `app/models` (domain models).
- `frontend/` — Next.js 14 App Router. `src/lib` (api client, Zod schemas,
  workspace store, helpers), `src/components/{map,charts,panels,ui}`.
- `docs/` — ARCHITECTURE.md, DATA_SOURCES.md, SCIENCE.md.

## Single-branch rule

All work stays on the `aquanexus-build` branch. Do not create feature branches.
Never force-push. Commit milestones.

## Commands

Backend (venv at `backend/.venv`):
```bash
cd backend && . .venv/bin/activate
python -m pytest -q
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm run typecheck && npm run lint && npm test && npm run build
npm run dev            # port 3000
```

## Verified state

- Backend: 97 pytest tests pass (includes the IMERG adapter suite). Frontend:
  30 vitest tests pass; typecheck, lint and `next build` all clean.
- Live smoke test (real network, not mocked) verified 200 for `/health`,
  `/geocode`, `/precipitation/historical`, `/precipitation/comparison`,
  `/readiness` and `/location/summary`.
- `/readiness` reports `nasa_imerg_late_daily` as `unconfigured` unless
  Earthdata Login credentials are set. Live authenticated retrieval is **not**
  yet verified in this environment (see below).

## NASA GPM IMERG Late Daily V07 (credential-gated)

- Adapter: `providers/imerg.py`; signer `providers/sigv4.py`; credential
  handling `providers/gesdisc_credentials.py`; catalog entry
  `GPM_IMERG_LATE_DAILY` (`nasa_imerg_late_daily`).
- **Value semantics (critical):** `precipitation` is **mm/day** (a daily *mean
  rate*, mean valid half-hourly rate × 24). `precipitation_cnt == 0` ⇒ filled
  cell ⇒ `None`, **never 0 mm**. `count > 0` with `0.0` ⇒ valid dry day ⇒ keep
  `0.0`. Count is preserved and drives coverage.
- Object layout:
  `gesdisc-cumulus-prod-protected/GPM_L3/GPM_3IMERGDL.07/YYYY/MM/3B-DAY-L.MS.MRG.3IMERG.YYYYMMDD-S000000-E235959.V07B.nc4`
  (region `us-west-2`, NetCDF4, fill `-9999.900390625`).
- Credentials: EDL username/password → `/s3credentials` → AWS STS keys **valid
  1 hour**; cached in memory, refreshed before expiry. Never logged, never
  client-side.
- Needs the optional reader: `pip install -e "backend[imerg]"` (`xarray`,
  `h5netcdf`). The base app runs without it.
- **Blocker to record honestly:** no Earthdata credentials and no NetCDF reader
  are present here, and both HTTPS/OPeNDAP return `302 → EDL login`, so
  authenticated retrieval and spatial subsetting are **unverified live**. Do
  not wire a map layer for IMERG until a real authenticated fetch + georeference
  has been observed.

## Conventions and gotchas

- All timestamps are UTC and timezone-aware internally. Precipitation in mm,
  discharge in m³/s. Reject unit mismatches before arithmetic.
- Coverage is measured against the **expected calendar window** (`expected_days`),
  never just the number of points returned: a provider that omits a day must not
  have that omission inflate coverage.
- A `null` daily value means "missing", never zero. Never impute 0.0 for a
  missing day in a baseline — only use 0.0 when the product genuinely reported 0.0.
- Forecast freshness is anchored to the **first** forecast day; distinct
  freshness keys (`observed_freshness`, `forecast_freshness`) keep the two from
  masking each other.
- A zero/negative baseline gives an **undefined** anomaly percentage (`null`,
  band `undefined_baseline`) and falls back to millimetres — never 0% / "near normal".
- The comparison is **year-over-year** (same calendar window, prior year,
  leap-safe), explicitly not a 30-year climate normal.
- Cross-source checks pair only on dates valid in **both** products and apply
  the coverage gate to that subset.
- `river_discharge_mean` from the Open-Meteo Flood API is a same-day ensemble
  statistic, not a historical mean.
- Anomaly baselines must be classification-compatible (see
  `services/anomaly.py`); never difference a forecast against climatology.
- Frontend fetches are proxied same-origin: Next rewrites `/api/*` to
  `AQUANEXUS_BACKEND_ORIGIN` (default `http://localhost:8000`). No secrets in
  the client bundle; only `NEXT_PUBLIC_API_BASE_URL` is public.
- Heavy libs: MapLibre loads with `ssr:false`; ECharts is dynamically imported.
- Data provider endpoints and terms change — re-verify against the linked docs
  before relying on a source.
- Tooling quirk: `file_editor` create fails when the target directory does not
  exist; `mkdir -p` first via the terminal.

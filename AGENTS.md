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

- Backend: 65 pytest tests pass. Frontend: 30 vitest tests pass; typecheck, lint
  and `next build` all clean.
- Live smoke test (real network, not mocked) verified 200 for `/health`,
  `/geocode`, `/precipitation/historical`, `/precipitation/comparison`,
  `/readiness` and `/location/summary`.

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

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

## Workspace (Explore Map is the single entry point)

There is exactly **one** water-intelligence workspace: `/explore`. The legacy
`/atlas` route was removed and its functionality consolidated into Explore Map.
The shared results surface is `components/workspace/IntelligenceTabs.tsx`, which
renders every supported category (Overview, Weather, Precipitation, Water
Presence, Water Atlas, Water Stress, Flood, Outlook, Change, River Discharge,
Satellite Explorer, Global Layers, AI Analysis, Report, Sources & Evidence) for
the location held by the `lib/workspace.tsx` store. Both `/explore` and the saved
study-area workspace (`/study-areas/[id]`) use the same `IntelligenceTabs` and
`MapPanel`, so there is one results experience, not two. `/global` is a separate
*dataset* exploration surface, not a second local workspace, and it hands the
point the user picks back to `/explore`. Do not add a second workspace route.
Component names that still contain "Atlas" (`WaterAtlasMap`) are shared map
internals and are deliberately retained.

## Map (2D, MapLibre GL JS v4 — do not reintroduce a globe)

The map is MapLibre GL JS **4.7.1** with the default 2D Mercator view.
A change that upgraded to v5 and set `map.setProjection({type:'globe'})` made the
map fail to initialise in sessions without a WebGL2 context (MapLibre reported
"Failed to initialize WebGL"), so the map panel fell back for everyone. The flat
map is the known-good implementation: it keeps zoom, pan, click-to-select and the
layer controls working. Keep the WebGL probe (`lib/webgl.ts`) and the accessible
fallback in `WaterAtlasMap.tsx` — they keep the rest of the workspace usable when
WebGL is genuinely absent. Do not re-enable a globe projection.

Basemap style is OpenFreeMap `liberty`
(`https://tiles.openfreemap.org/styles/liberty`) — key-free, natural-colour
oceans/land/rivers. The hero Earth (`landing/EarthGlobe.tsx`) is a pure-CSS
rotating sphere over the self-hosted NASA Blue Marble image: no WebGL, no
canvas and no 3D dependency, so it renders everywhere and cannot break the
build. It is landing-only and never required for the working map.

## Verified state

- Backend: 189 pytest tests pass (includes the IMERG adapter suite and the AI
  analysis suite). Frontend: 91 vitest tests pass; typecheck, lint and
  `next build` all clean. The search/workspace suite
  (`panels/location-search.test.tsx`, `lib/workspace.test.tsx`) pins the
  stale-response guarantees: a superseded search is aborted and a late response
  can never overwrite the current location's results. `lib/workspace.test.tsx`
  also pins the drawn-area path: the ring is validated server-side and the area
  size shown is the backend's value, and a rejected ring surfaces its error
  instead of failing silently.
- Landing tests (`components/landing/landing.test.tsx`) enforce honesty copy:
  the NASA Blue Marble attribution and the "no readings and no live" disclosure
  on the product-preview schematic. Do not remove those without cause.
- Landing typography uses the `font-display` class (see `app/globals.css` and
  `lib/fonts.ts`). Restore it, do not redesign headings, if a regression appears.
- Live smoke test (real network, not mocked) verified 200 for `/health`,
  `/geocode`, `/precipitation/historical`, `/precipitation/comparison`,
  `/readiness`, `/location/summary` and `/ai/analysis`.
- `/readiness` reports `nasa_imerg_late_daily` and `ai_analysis` as
  `unconfigured` unless their credentials are set. Live authenticated retrieval
  is **not** yet verified in this environment (see below).

## AI analysis (credential-gated, optional)

- Route `api/routes/ai.py` → `services/ai_analysis.py`; provider
  `providers/ai.py`; models in `models/ai.py`; catalog entry `AI_ANALYSIS`
  (`ai_analysis`).
- **Groq is the preferred provider.** `GROQ_API_KEY` is read with its
  conventional, unprefixed name (via `validation_alias` in `config.py`, which
  also accepts `AQUANEXUS_GROQ_API_KEY`), with `GROQ_MODEL` defaulting to
  `openai/gpt-oss-120b`. Groq is reached through its OpenAI-compatible
  endpoint `https://api.groq.com/openai/v1`. `Settings.resolved_ai_provider()`
  is the single place that decides which endpoint/model is active.
- **Model choice matters.** Both `llama-3.3-70b-versatile` (Enterprise-only)
  and the former default `qwen/qwen3-32b` (retired 2026-07-17) now fail with
  HTTP 400 on a developer-plan key, so the default is `openai/gpt-oss-120b` —
  Groq's documented replacement. If a reasoning model is configured,
  `providers/ai.py` strips a ` thinking…</think>` block and extracts the first
  balanced JSON object before parsing, so a chain of thought cannot break the
  response. An unrecognised model id produces an actionable error naming
  `GROQ_MODEL` rather than a bare "HTTP 400".
- **Environment files are resolved relative to the backend package, not the
  working directory**, in this precedence order: `<repo>/.env.local` →
  `<repo>/.env` → `backend/.env`, with real environment variables always
  winning. A relative `.env` used to load only when uvicorn was started from
  `backend/`, which silently produced `unconfigured`. The frontend's Next.js
  `.env.local` is **never** read by Python — a key placed only there will not
  reach AI Analysis; put server-side secrets in `backend/.env`.
- A generic OpenAI-compatible endpoint (`AQUANEXUS_AI_API_KEY` / `_BASE_URL` /
  `_MODEL`) is used **only** when `GROQ_API_KEY` is unset — setting a Groq key
  never silently falls back to another provider. Do not add a second AI path.
- The **evidence package is always assembled from real provider values** (the
  same location summary the workspace uses) with source, unit, period and
  classification. The **narrative** is a model's interpretation of that
  evidence — never a measurement and never an official warning.
- With no AI credential, the endpoint returns `status: "unconfigured"` and
  still returns the evidence; the panel renders an explicit unavailable state
  rather than inventing text. The PDF report stays fully functional, using a
  factual non-AI summary. The key is server-side only and is never logged.


## NASA HLS — Harmonized Landsat Sentinel-2 (key-free discovery)

- Adapter: `providers/hls.py`; route `GET /api/v1/satellite/hls`; catalog entry
  `HLS_LPCLOUD` (`nasa_hls_lpcloud`); GIBS layers in `providers/gibs.py`
  (`hls_s30_reflectance`, `hls_l30_reflectance`, `opera_dswx_hls`).
- **Two distinct access routes, both public:**
  1. **Granule discovery** uses NASA's **CMR STAC** API
     (`https://cmr.earthdata.nasa.gov/stac/LPCLOUD`, collections `HLSS30_2.0`
     and `HLSL30_2.0`). CMR STAC metadata search is **anonymous** — no Earthdata
     credential is required, and none is sent.
  2. **Browse imagery** uses public NASA **GIBS** WMTS tiles
     (`GoogleMapsCompatible_Level12`), so the layers need no token either.
- **Do not confuse HLS with Copernicus.** HLS is harmonized to a common **30 m**
  grid; it is not native 10 m Sentinel-2. `HLSS30` is Sentinel-2-sourced and
  `HLSL30` is Landsat-sourced. The API returns `data_source` and the UI labels
  each row, and the result `note` states the 30 m caveat, so the two catalogues
  stay separate.
- **Credential note:** `AQUANEXUS_EARTHDATA_*` are needed only for authenticated
  GPM IMERG retrieval. They are **not** required for HLS discovery or for the
  HLS/OPERA map layers. Do not make them mandatory for HLS.
- **Honesty rule:** a CMR failure raises `ProviderUnavailableError` (HTTP 503)
  and the panel shows an explicit unavailable state. HLS scenes are never
  synthesized, and no HLS pixel download or AquaNexus-side classification runs.

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
- Frontend fetches are proxied same-origin by the catch-all route handler at
  `frontend/src/app/api/v1/[...path]/route.ts`, which forwards `/api/v1/*` to
  `AQUANEXUS_BACKEND_ORIGIN` (default `http://localhost:8000`). It is a route
  handler, not a `rewrites()` entry, so an unreachable backend returns a
  structured `{"error":{...}}` envelope (503 `backend_unreachable`, 504
  `backend_timeout`) instead of a bare `500 Internal Server Error` text body,
  and binary bodies (the PDF report) stream through as bytes. No secrets in
  the client bundle; only `NEXT_PUBLIC_API_BASE_URL` is public.
- Heavy libs: MapLibre loads with `ssr:false`; ECharts is dynamically imported.
- OpenStreetMap water features come from the public Overpass API
  (`providers/water_bodies.py`). The public mirrors stall often, so the adapter
  queries every mirror **concurrently** and takes the first answer, then caches
  the result (including an "at capacity" failure) for the cache TTL. The cache
  key is `(lat, lon, radius_m)` and ignores the caller's `limit`, so the presence
  panel, the flood screen and the report share one provider round-trip; the
  caller's limit is applied to the cached copy. A result therefore carries
  `lookup_radius_m` — the radius it was actually built for — and callers must
  report that, not their requested radius. When the primary filter reaches no
  mirror the loop stops early rather than retrying the lower-priority filters
  against the same dead hosts.
- **A service failure is never a measured zero.** `WaterBodyResult.service_reachable`
  distinguishes "the mapping service answered with no features" from "the service
  did not answer". The flood module's `surface_water_context` item must be
  `status="unavailable"` with `value=None` in the latter case; reporting `0`
  would present an outage as an observation. See
  `tests/test_water_intel.py::test_flood_surface_water_context_is_unavailable_not_zero_when_service_fails`.
- Data provider endpoints and terms change — re-verify against the linked docs
  before relying on a source.
- Tooling quirk: `file_editor` create fails when the target directory does not
  exist; `mkdir -p` first via the terminal.

## Resume checkpoint (session pause)

Resume verification pass complete. State is committed, pushed and green.

- Branch `aquanexus-build`, HEAD `6da7419` (on top of `bf4749b` via `90d1835`),
  pushed to `origin/aquanexus-build`. `main` untouched.
- Suites green at this commit: backend `128 passed`; frontend `77 passed`
  (18 files); `tsc --noEmit` clean; ESLint clean; `next build` succeeds.
- Report Download verified end-to-end **in a browser** (Playwright) at both
  1440px and 390px: selecting Lagos and clicking Download produced a real
  4-page PDF (`%PDF-` magic, correct coords, `-26.3%` rainfall anomaly,
  sources, findings and limitations).
- Responsive sweep: no horizontal overflow at 1440/1024/768/390/360 on `/`,
  `/home`, `/explore`, `/study-areas`, nor on any of the 10 `/explore` tabs at
  390px. Every page exposes exactly one `<h1>`.
- Keyboard/a11y: skip link, logical tab order, visible focus ring on every
  focusable element; modal traps Tab/Shift+Tab and closes on Escape.
- Contrast: measured with a pixel-sampling auditor (`/tmp/a11y/audit.py`) that
  takes the CSS computed colour as foreground and the real composited
  background pixels from an element screenshot. 1909 text elements across
  desktop 1440x900 and mobile 390x844, on `/`, `/home`, `/explore` and all
  `/explore` tabs: **zero below WCAG AA**.

### Groq support (this session)

First-class Groq support was added as the preferred AI provider:

- `GROQ_API_KEY` (unprefixed) and `GROQ_MODEL` are read via `validation_alias`
  in `config.py`; `AQUANEXUS_GROQ_*` also works. Groq uses its
  OpenAI-compatible endpoint `https://api.groq.com/openai/v1`.
- `Settings.resolved_ai_provider()` is the single decision point. Groq wins when
  its key is present; the generic `AQUANEXUS_AI_*` endpoint is used only when no
  Groq key is set, so a Groq deployment never silently falls back.
- Suites green after the change: backend `142 passed` (14 new in
  `tests/test_ai_groq.py`); frontend `77 passed`; `tsc` clean; ESLint clean;
  `next build` succeeds.
- Verified live in the preview browser: `/explore` selected Nairobi and loaded
  real indicators; the AI panel reported `unconfigured` with 19 grounded
  evidence items; the report preview and downloaded 4-page PDF both state AI is
  not included; toggling the IMERG precipitation layer changed 16.4% of map
  pixels. A throwaway local mock endpoint confirmed the live HTTP path
  (Bearer auth, evidence package, `/openai/v1/chat/completions`) and reported
  `AI analysis (Groq) -> ok` in readiness.
- `GROQ_API_KEY` is **not** set in this environment, so AI analysis stays in its
  documented fallback state. Set it to enable the narrative.
- Report Download verified end-to-end **in a browser** (Playwright) at both
  1440px and 390px: selecting Lagos and clicking Download produced a real
  4-page PDF (`%PDF-` magic, correct coords, `-26.3%` rainfall anomaly,
  sources, findings and limitations).
- Responsive sweep: no horizontal overflow at 1440/1024/768/390/360 on `/`,
  `/home`, `/explore`, `/study-areas`, nor on any of the 10 `/explore` tabs at
  390px. Every page exposes exactly one `<h1>`.
- Keyboard/a11y: skip link, logical tab order, visible focus ring on every
  focusable element; modal traps Tab/Shift+Tab and closes on Escape.
- Contrast: measured with a pixel-sampling auditor (`/tmp/a11y/audit.py`) that
  takes the CSS computed colour as foreground and the real composited
  background pixels from an element screenshot. 1909 text elements across
  desktop 1440x900 and mobile 390x844, on `/`, `/home`, `/explore` and all
  `/explore` tabs: **zero below WCAG AA**.

### Contrast correction (this session)

An earlier note in this file claimed the palette met AA for text based on
CSS inference. That was wrong. Pixel measurement found real failures:

- `text-ink-400` (#6f8399) at 11-12px on panel surfaces composited to
  3.29-4.40:1, below the 4.5:1 AA threshold for small text.
- Affected every coordinate line (`formatCoord` output) plus the app-shell
  backend status chip and the landing breadcrumb.
- Fixed by raising those sites to `text-ink-300` (#9fb0c4), which measures
  5.80:1 or better against every background observed, including the sticky
  header's `backdrop-blur` surface sampled while content scrolled beneath it
  (that surface shifts to rgb(40,51,63) at some scroll offsets, where ink-400
  drops to 3.29:1).
- Lesson: inferring contrast from CSS alone gives false confidence on
  composited, blurred and translucent surfaces. Sample the rendered pixels.
  `ink-400` remains fine for icon-only map chrome; do not use it for text
  under ~14px.

### Remaining work when resumed

1. Nothing blocking. Optional: a deeper manual screen-reader pass (VoiceOver/
   NVDA), and `axe`-style automated rule coverage beyond the checks above.

### Environment notes for resume

- Backend on `:8000` (`uvicorn app.main:app`), health at `/api/v1/health`
  (there is no `/health`). Frontend on `:3000`.
- Backend venv is `backend/.venv`; invoke it explicitly
  (`backend/.venv/bin/python -m pytest`) — activating a different venv in the
  same shell silently shadows it.
- `file` is unavailable; use Python magic-byte checks for image/PDF sniffing.
- `pypdf` is available in the backend venv for PDF text verification.
- A stale `next start` build once served pre-change code and looked like a
  client-side crash on `/explore`; rebuild after frontend edits before
  trusting a `:3000` render. Note that `next start` serves a frozen build, so
  a source edit alone will not change what the browser receives.
- `reportlab` is a declared runtime dependency (requirements.txt and
  pyproject.toml). It is imported at app startup, so a venv built before this
  fix needs `pip install reportlab` or the backend will not boot.


# Architecture

AquaNexus separates concerns so that provider quirks, science, and presentation
can each change without disturbing the others.

```
┌──────────────────────────── frontend/ (Next.js, browser) ────────────────────────────┐
│  app/(app)            route group sharing the app shell (nav + providers)            │
│    /home              Intelligence Home: saved areas, sources, primary actions        │
│    /explore           map-first location discovery + create study area                │
│    /study-areas       list/manage saved study areas                                   │
│    /study-areas/[id]  location-specific intelligence workspace (tabs)                 │
│    /atlas             original single-location Water Atlas workspace                  │
│  components/shell     AppShell (nav), AppProviders (store + toasts)                   │
│  components/map       MapLibre GL atlas + non-WebGL raster fallback (dynamic)         │
│  components/charts    ECharts rainfall, weather and discharge charts (dynamic import) │
│  components/panels    search, layers, intelligence, rainfall, weather, discharge,     │
│                       satellite, water-stress, sources, onboarding                    │
│  components/study-areas create dialog + saved-area cards                              │
│  components/ui        primitives, states, modal (accessible dialog)                   │
│  lib/workspace.tsx    React context store: location, layers, window, fetched slices   │
│  lib/study-areas.tsx  study-area store: list + CRUD against the backend               │
│  lib/toast.tsx        transient success/error feedback                                │
│  lib/api.ts           typed fetch client; validates every response with Zod           │
│  lib/schemas.ts       Zod schemas mirroring the backend response models               │
│  lib/geo.ts|format.ts|weather.ts  pure, unit-tested helpers                           │
└───────────────────────────────────────────┬──────────────────────────────────────────┘
                                            │  same-origin rewrite /api/*  (next.config.mjs)
                                            ▼
┌──────────────────────────── backend/ (FastAPI, server) ──────────────────────────────┐
│  app/main.py          app factory, CORS, error handlers, router registration          │
│  app/config.py        typed settings (pydantic-settings), read server-side only       │
│  app/errors.py        AquaNexusError hierarchy → structured JSON error envelope       │
│  app/logging_config   structured logging; never logs credentials                      │
│  api/routes/*         thin routes: validate input, call a service, return a model     │
│  api/schemas.py       request/response Pydantic models                                │
│  models/*             domain models: Provenance, ProviderMetadata, classification…    │
│  providers/*          one adapter per external source, normalized responses           │
│  services/*           aggregation · anomaly · indicators · summary · study_areas       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Backend layers

### Routes (`app/api/routes/`)
Thin HTTP surface. They parse and validate query parameters, invoke exactly one
service (or the summary orchestrator), and return a typed model. They contain no
provider-specific logic and no scientific arithmetic.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/health` | Liveness |
| `GET /api/v1/readiness` | Configuration / provider readiness |
| `GET /api/v1/providers` | Provider catalog with provenance metadata |
| `GET /api/v1/geocode` | Global place search |
| `GET /api/v1/location/availability` | Which datasets cover a point |
| `GET /api/v1/location/summary` | Orchestrated indicator summary |
| `GET /api/v1/precipitation/historical` | Observed reanalysis series |
| `GET /api/v1/precipitation/forecast` | Forecast series |
| `GET /api/v1/precipitation/comparison` | Baseline comparison + anomaly |
| `GET /api/v1/weather` | Modelled current conditions + daily forecast |
| `GET /api/v1/discharge` | Modelled GloFAS river discharge series |
| `GET /api/v1/satellite/scenes` | STAC scene metadata search (with rendered previews) |
| `GET /api/v1/satellite/hls` | NASA HLS (HLSS30/HLSL30) granule discovery via CMR STAC |
| `GET /api/v1/water/bodies` | Mapped water features near a point (OpenStreetMap/Overpass) |
| `GET /api/v1/water/bodies/summary` | Compact water-feature summary for the map/panel |
| `POST /api/v1/water/area` | Area of a drawn polygon + its analysis centre point |
| `GET /api/v1/water/presence` | Surface-water presence evidence for a point |
| `GET /api/v1/flood/evidence` | Evidence-based flood screening (observed / rainfall / modelled) |
| `GET /api/v1/change/detection` | Comparable before/after scene discovery |
| `GET /api/v1/outlook` | Forecast outlook (rainfall, temperature, derived concern flags) |
| `GET /api/v1/map/layers` | Global raster layer catalog (NASA GIBS) with legends |
| `GET /api/v1/reports/preview` | Structured preview of the report payload |
| `POST /api/v1/reports` | Server-rendered branded PDF report |
| `GET /api/v1/ai/analysis` | Evidence-grounded narrative over the location summary |
| `GET /api/v1/study-areas` | List saved study areas |
| `POST /api/v1/study-areas` | Create a saved study area |
| `GET /api/v1/study-areas/{id}` | Fetch one saved study area |
| `PATCH /api/v1/study-areas/{id}` | Rename a saved study area |
| `DELETE /api/v1/study-areas/{id}` | Delete a saved study area |

### Providers (`app/providers/`)
One adapter per source. Each returns **normalized** domain objects plus a
`ProviderReport` describing its status (`ok`, `partial`, `unconfigured`,
`unavailable`, `error`). Common concerns live in `providers/base.py`: a shared
HTTPX client, timeouts, retries, and the normalization helpers. Provider terms,
resolution and limits live in `providers/catalog.py`.

Adding a source means adding one adapter and one catalog entry — no route
changes.

### Services (`app/services/`)
The scientific engine, deliberately independent of HTTP and independent of React:

- `aggregation.py` — unit-safe, null-aware summarization.
- `baseline.py` — calendar-date alignment of prior-year windows (leap-safe) and
  shared-valid-date pairing for cross-source comparison.
- `anomaly.py` — baseline compatibility rules and bounded anomaly maths.
- `indicators.py` — freshness, coverage, classification, cross-check.
- `ai_analysis.py` — builds an evidence package from the location summary and,
  when an AI provider is configured, asks it for a narrative. The evidence
  package is always assembled from real provider values; the narrative is
  labelled as interpretation, and the endpoint reports `unconfigured` when no
  key is set rather than substituting text.
- `summary.py` — graceful orchestration: independent providers are fetched
  concurrently, and a failed provider degrades one slice, never the whole
  response.
- `water_presence.py` — surface-water presence screening from mapped features
  and available satellite evidence, with an explicit "insufficient evidence"
  state.
- `flood_evidence.py` — evidence-based flood screening. Keeps observed extent,
  rainfall signals and modelled GloFAS discharge as **distinct** evidence types
  and never derives a flood probability.
- `change_detection.py` — discovers two real, date-separated scenes and reports
  whether they are comparable; it does not classify pixels.
- `outlook.py` — assembles the forecast outlook from the forecast providers and
  derives explicit concern flags. Every value is a forecast or a derived flag.
- `report_builder.py` / `report_pdf.py` / `report_images.py` — build the
  structured report payload, render the branded PDF, and embed the report
  figures.

Each function is pure given its inputs and has its own tests.

### Models (`app/models/`)
Typed domain models. `common.py` holds `Provenance`, `ProviderMetadata`,
`ProviderReport`, `PlaceResult`, `DataClassification`, `TimeSeriesPoint`.
`aggregates.py` holds derived indicators and series envelopes. Responses are
never untyped dicts passed around internally.

## Frontend layers

- **One store.** `lib/workspace.tsx` owns the selected location, active layers,
  analysis window and fetched data slices. Fetches happen on location/window
  change, not per component render. A monotonic request token discards stale
  responses.
- **Independent slices.** Summary, comparison, forecast, scenes, weather,
  discharge, water bodies, water presence, flood evidence, change detection and
  the outlook each carry their own `loading`/`error` state, so a satellite
  failure does not blank the rainfall chart.
- **Zod at the boundary.** `lib/api.ts` validates every response; a contract
  drift becomes a `contract_error` instead of a bad render.
- **Heavy libraries are deferred.** MapLibre loads with `ssr:false`; ECharts is
  imported dynamically inside the chart component.
- **Design tokens.** Colours, fonts, shadows and motion live in
  `tailwind.config.ts`. A later design pass can retune the palette without
  touching backend or component logic.

## Request lifecycle (location selected)

1. `LocationSearch` (or a map click) calls `selectLocation`.
2. The store fires four parallel requests via `Promise.allSettled`.
3. Each route calls its service; the service calls one or more adapters.
4. Adapters normalize responses and attach provenance.
5. Results become independent slices; the UI renders each honestly, showing
   `insufficient_data` / unavailable states where evidence is thin.

## Persistence (study areas)

Saved study areas are the one piece of state AquaNexus keeps between sessions.
They are stored by `services/study_areas.py` in a single JSON file under the
configured data directory (`backend/data/study_areas.json`, gitignored). Writes
are guarded by an async lock and use an atomic temp-file rename, so a crash
cannot leave a half-written file. The service validates names and coordinates
through the same domain models the API uses.

This is deliberately small: a file-backed store earns its place for saved
locations without the operational weight of a database. When multi-user access
or geographic queries are required, PostGIS is the natural next step — see the
`StudyArea` model, which is already shaped to move.

## Testing strategy

- **Backend (Pytest).** Domain validation, unit/timestamp normalization,
  aggregation, anomaly boundaries and refusals, provider error handling, study-area
  CRUD and persistence, and API
  contracts. All providers are mocked, so tests are deterministic and need no
  credentials.
- **Frontend (Vitest).** Pure helpers, Zod contract validation, the API client's
  error normalization, and classification rendering (a forecast must never be
  labelled an observation).
- **Separate smoke test.** A documented live-provider script exercises the real
  network paths and is reported distinctly from automated tests.

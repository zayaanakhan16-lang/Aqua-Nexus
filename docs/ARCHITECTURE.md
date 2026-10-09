# Architecture

AquaNexus separates concerns so that provider quirks, science, and presentation
can each change without disturbing the others.

```
┌──────────────────────────── frontend/ (Next.js, browser) ────────────────────────────┐
│  app/atlas            workspace shell, responsive three-rail layout                  │
│  components/map       MapLibre GL atlas (dynamic, ssr:false)                          │
│  components/charts    ECharts rainfall chart (dynamic import)                         │
│  components/panels    search, layers, intelligence, rainfall, sources, onboarding     │
│  components/ui        primitives, states (empty/error/unavailable), design tokens     │
│  lib/workspace.tsx    React context store: location, layers, window, fetched slices   │
│  lib/api.ts           typed fetch client; validates every response with Zod           │
│  lib/schemas.ts       Zod schemas mirroring the backend response models               │
│  lib/geo.ts|format.ts pure, unit-tested helpers                                        │
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
│  services/*           aggregation · anomaly · indicators · summary orchestration      │
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
| `GET /api/v1/satellite/scenes` | STAC scene metadata search |

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
- `summary.py` — graceful orchestration: independent providers are fetched
  concurrently, and a failed provider degrades one slice, never the whole
  response.

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
- **Independent slices.** Summary, comparison, forecast and scenes each carry
  their own `loading`/`error` state, so a satellite failure does not blank the
  rainfall chart.
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

## Why no database yet

The current product is a live-investigation workspace: it reads from providers
on demand and holds nothing between sessions. A database earns its place when
saved workspaces, historical archiving or geographic queries are required — at
which point PostGIS is the natural choice. Introducing one now would add
operational weight without a matching capability.

## Testing strategy

- **Backend (Pytest).** Domain validation, unit/timestamp normalization,
  aggregation, anomaly boundaries and refusals, provider error handling, API
  contracts. All providers are mocked, so tests are deterministic and need no
  credentials.
- **Frontend (Vitest).** Pure helpers, Zod contract validation, the API client's
  error normalization, and classification rendering (a forecast must never be
  labelled an observation).
- **Separate smoke test.** A documented live-provider script exercises the real
  network paths and is reported distinctly from automated tests.

# Science — methods, baselines and limitations

Every calculation in AquaNexus is deterministic, unit-tested, and reported with
its method, method version, inputs, baseline and limitations. Nothing is scored
when the evidence does not support it.

All values are stored and compared in **millimetres (mm)** and **UTC**. Local
time is only used for display.

---

## 1. Precipitation aggregation

`app/services/aggregation.py`

Input: a list of daily `TimeSeriesPoint` in mm. `null` values represent missing
days.

| Quantity | Formula |
| --- | --- |
| `total_mm` | Σ value_i over non-null days |
| `mean_daily_mm` | total_mm / non-null day count |
| `max_daily_mm` | max value_i |
| `min_daily_mm` | min value_i |
| `wet_days` | count(value_i ≥ 1.0 mm) |
| `valid_days` | non-null day count |
| `missing_days` | total_days − valid_days |
| `coverage_ratio` | valid_days / total_days |

`total_days` is the **expected calendar window** when supplied by the caller
(`expected_days`), not merely the number of points returned. This matters for
providers such as NASA POWER that omit days with no value: an omitted day counts
as missing and lowers coverage, rather than being silently dropped and inflating
coverage.

A day is "wet" at or above the 1 mm hydrometeorological threshold.

**Quality gate.** `has_sufficient_coverage` requires `coverage_ratio ≥ 0.80`
**and** `valid_days > 0`. Aggregation cannot exceed the evidence: fewer non-null
days means less confidence, and downstream claims are refused below the gate.

**Limitations**

- A high `total_mm` over a window with many missing days is not comparable to a
  complete window; check `coverage_ratio` first.
- Aggregation is linear and assumes daily totals are additive (true for rain
  accumulation; not true for e.g. soil moisture).

---

## 2. Rainfall anomaly

`app/services/anomaly.py`

Given observed total `O` and baseline total `B` over the **same number of days**:

```
anomaly_mm      = O - B
anomaly_percent = (O - B) / B * 100        (undefined when B <= 0)
```

When the baseline total `B` is zero or negative the percentage is **undefined
and reported as `null`** — it is never coerced to 0%, because doing so would
falsely imply "near normal". The band becomes `undefined_baseline` and the
indicator falls back to the absolute `anomaly_mm` value with unit `mm`.

### Deficit / excess bands (preliminary AquaNexus indicator)

| Condition | Band | Meaning |
| --- | --- | --- |
| baseline `B <= 0` | `undefined_baseline` | percentage undefined; absolute mm reported |
| `pct ≥ 50` | `well_above` | well above the comparison baseline |
| `20 ≤ pct < 50` | `above` | above the comparison baseline |
| `-20 < pct < 20` | `near_normal` | broadly near the comparison baseline |
| `-50 < pct ≤ -20` | `below` | below the comparison baseline |
| `pct ≤ -50` | `severely_below` | well below the comparison baseline |

These bands describe **rainfall relative to a comparison baseline**. They are
not a water-scarcity verdict.

### Baseline compatibility

An observational series is only differenced against a dataset whose definition
is compatible:

| Observed classification | Compatible baselines |
| --- | --- |
| `observation` | `observation`, `reanalysis` |
| `reanalysis` | `reanalysis`, `simulation` |
| `satellite_estimate` | `satellite_estimate`, `reanalysis` |
| `forecast` | *(none — a forecast is never treated as climatology)* |

### Refusal conditions

`compute_anomaly` raises — and the API reports an unavailable state — when:

- units differ between the two series;
- the classifications are incompatible;
- either side has zero valid days;
- either side fails the 80% coverage gate.

**Limitations**

- Rainfall deficit alone does not prove water scarcity. Water stress also
  depends on demand, groundwater, river flow, reservoirs, soil moisture,
  infrastructure and local conditions.
- Rainfall excess alone does not prove a flood occurred.
- The baseline is a comparable calendar window from a prior year, not a
  multi-decade climatological normal. It is labelled as such in the UI.

---

## 3. Derived indicators

`app/services/indicators.py`, orchestrated by `app/services/summary.py`.

All are labelled `derived` and carry `method`, `method_version`, `inputs`,
`baseline` and `limitations`.

| Indicator | Unit | Method | Notes |
| --- | --- | --- | --- |
| `coverage` | % | valid days / total days | Evidence completeness |
| `wet_day_fraction` | ratio | wet days / valid days | Rainfall persistence |
| `observed_freshness` | hours | age of latest observed/reanalysis sample | Separate from forecast |
| `forecast_freshness` | hours | age of the first forecast day | Anchored to lead time, not the future end date |
| `rainfall_anomaly` | % | see §2 | Unavailable if incompatible |
| `data_classification` | category | provenance classification | Never a number |
| `forecast_7d_total` | mm | Σ forecast daily precipitation | Modelled, not observed |
| `river_discharge_ratio` | ratio | forecast discharge / same-day ensemble mean | Modelled (GloFAS) |
| `cross_check_delta` | % | (ERA5 − MERRA-2) / MERRA-2 over shared valid dates | Independent reanalysis check |

Observed/reanalysis freshness and forecast freshness are reported under
**distinct keys** so a brand-new forecast can never mask stale observations (or
vice versa). `forecast_freshness` is measured from the **first** forecast day;
a forecast whose initialisation is old is stale even though its dates lie in the
future.

`river_discharge_ratio` divides the forecast river discharge by
`river_discharge_mean` for the **same forecast day**. Per the Open-Meteo Flood
API, `river_discharge_mean` is the mean of the ensemble members for that day —
it is *not* a historical or multi-year mean, and the indicator is labelled
accordingly.

`cross_check_delta` pairs ERA5 and MERRA-2 only on dates where **both** products
have a real value, and applies the coverage gate to the paired subset. If the
shared valid dates are too few it reports `insufficient_data` rather than a
number.

### Freshness policies

| Product family | Fresh when age ≤ |
| --- | --- |
| `forecast` | 6 h |
| `recent_estimate` | 72 h |
| `reanalysis` | 240 h (10 days) |

Forecast freshness is measured from the first forecast day, not the last. A
forecast whose first day is older than the policy is reported `stale` even
though its later days lie in the future.

### Water-stress framing

AquaNexus computes a **preliminary rainfall-based signal**, not a comprehensive
water-stress model. The summary lists which inputs exist and which are missing,
and the UI shows an `insufficient_data` state instead of a score when evidence
is thin.

---

## 4. Timestamp and unit normalization

- All internal timestamps are timezone-aware UTC (`datetime`, `tz=utc`).
- Daily series are keyed by calendar date (UTC).
- Precipitation is normalized to mm. Discharge is m³/s. Unit mismatches are
  rejected before any arithmetic.

---

## 5. What AquaNexus deliberately does not do

- It does not run a flood-prediction model.
- It does not perform water-body classification or change detection (no
  verified processing pipeline exists in this build).
- It does not present demonstration values as live data.
- It does not substitute fabricated numbers when a provider is unavailable; it
  returns an explicit unavailable state.

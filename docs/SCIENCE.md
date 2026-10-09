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

### Deficit / excess bands (preliminary AquaNexus indicator)

| Condition | Band | Meaning |
| --- | --- | --- |
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
| `data_freshness` | hours | age of latest sample vs a product-family policy | See policies below |
| `rainfall_anomaly` | % | see §2 | Unavailable if incompatible |
| `data_classification` | category | provenance classification | Never a number |
| `forecast_7d_total` | mm | Σ forecast daily precipitation | Modelled, not observed |
| `river_discharge_ratio` | ratio | forecast discharge / historical mean | Modelled (GloFAS) |
| `cross_check_delta` | % | (NASA POWER − ERA5) / ERA5 | Independent reanalysis check |

### Freshness policies

| Product family | Fresh when age ≤ |
| --- | --- |
| `forecast` | 6 h |
| `recent_estimate` | 72 h |
| `reanalysis` | 240 h (10 days) |

Forecast samples legitimately sit in the future; a negative age is clamped to
zero and treated as fresh rather than as stale evidence.

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

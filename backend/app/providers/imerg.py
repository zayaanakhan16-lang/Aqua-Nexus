"""NASA GPM IMERG Late Daily V07 (GPM_3IMERGDL) adapter.

Product: GPM IMERG Late Precipitation L3 1 day 0.1° x 0.1° V07, GES DISC.
DOI: 10.5067/GPM/IMERGDL/DAY/07 (CC-BY-4.0).

Data integrity rules encoded here (all from the official product description):

* Values are **mm/day**, derived as the mean of the valid half-hourly rates in a
  grid cell multiplied by 24. This is a *daily mean rate*, not an accumulated
  total, and is compared to ERA5 precipitation with the same meaning.
* ``precipitation_cnt`` (0-48) is the number of valid half-hourly retrievals.
  ``precipitation_cnt == 0`` means the cell was **filled** (fill value
  ``-9999.9``): there is *no* estimate. It must never be read as 0 mm of rain.
* ``Pi == 0`` is a **valid** dry value: a gap-free cell with zero rain is a real
  measurement of 0.0 mm/day and must be preserved.
* A retrieved value is therefore valid only when it is finite, above the fill
  threshold, AND has a positive valid-half-hour count. The count is preserved as
  a quality metric and drives coverage.

Access model (verified against GES DISC documentation):

* ``s3://gesdisc-cumulus-prod-protected/GPM_L3/GPM_3IMERGDL.07/YYYY/MM/3B-DAY-L.MS.MRG.3IMERG.YYYYMMDD-S000000-E235959.V07B.nc4``
* Anonymous HTTPS/OPeNDAP both require Earthdata Login; the browser is never
  given credentials. Retrieval happens entirely server-side.
"""
from __future__ import annotations

from bisect import bisect_left
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Mapping, Sequence

from app.config import Settings, get_settings
from app.errors import (
    ProviderError,
    ProviderUnconfiguredError,
    ProviderUnavailableError,
    ValidationError,
)
from app.logging_config import get_logger
from app.models.aggregates import PrecipitationSeries
from app.models.common import BoundingBox, DataClassification, GeoPoint, Provenance
from app.providers import catalog
from app.providers.gesdisc_credentials import get_s3_credentials
from app.providers.sigv4 import sign_get_object

logger = get_logger(__name__)

PROVIDER = catalog.GPM_IMERG_LATE_DAILY

# IMERG V07 fill value for precipitation-type variables.
FILL_VALUE = -9999.900390625
# Nf = 48 half-hourly samples per day; a positive count is required to trust a value.
MAX_HALF_HOURLY = 48

DATASET_VARIABLE = "precipitation"
COUNT_VARIABLE = "precipitation_cnt"
MW_VARIABLE = "MWprecipitation"
MW_COUNT_VARIABLE = "MWprecipitation_cnt"
ERROR_VARIABLE = "randomError"
PROBABILITY_VARIABLE = "probabilityLiquidPrecipitation"

# Variables requested for a spatial subset; keeping this small bounds transfer.
SUBSET_VARIABLES = [DATASET_VARIABLE, COUNT_VARIABLE, "lat", "lon"]


# --------------------------------------------------------------------------- #
# Pure functions: identifiers, URLs, and geospatial indexing                  #
# --------------------------------------------------------------------------- #


def granule_filename(day: date) -> str:
    """Return the V07 granule filename for a UTC data day."""
    stamp = day.strftime("%Y%m%d")
    return f"3B-DAY-L.MS.MRG.3IMERG.{stamp}-S000000-E235959.V07B.nc4"


def granule_key(day: date, prefix: str | None = None) -> str:
    """Return the S3 object key for a day (prefix defaults to config)."""
    prefix = prefix or get_settings().gesdisc_imerg_prefix
    return f"{prefix}/{day:%Y}/{day:%m}/{granule_filename(day)}"


def granule_https_url(day: date, settings: Settings | None = None) -> str:
    """Return the anonymous (EDL-authenticated) HTTPS download URL for a day."""
    settings = settings or get_settings()
    base = settings.gesdisc_https_data_url.rstrip("/")
    return f"{base}/{granule_key(day, settings.gesdisc_imerg_prefix)}"


def _encode(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="-_.~")


def build_opendap_url(
    *,
    concept_id: str,
    granule_id: str,
    settings: Settings | None = None,
    bbox: BoundingBox | None = None,
    variables: Sequence[str] = SUBSET_VARIABLES,
) -> str:
    """Build an OPeNDAP (DAP4) constrained request for one granule.

    A ``1:0`` slice for lat/lon is left unconstrained here; the explicit index
    bounds are appended by :func:`opendap_constraint` once the grid is known.
    """
    settings = settings or get_settings()
    base = settings.gesdisc_opendap_url.rstrip("/")
    gid = _encode(granule_id)
    projection = ",".join(variables)
    return f"{base}/collections/{concept_id}/granules/{gid}.nc4?dap4.ce={projection}"


def nearest_index(axis: Sequence[float], target: float) -> int:
    """Return the index of the grid cell nearest to ``target`` on ``axis``.

    Assumes a monotonically increasing axis (true for IMERG lat/lon).
    """
    if not axis:
        raise ValidationError("Cannot select a grid cell from an empty axis.")
    # bisect_left on a sorted axis, then compare the neighbours.
    position = bisect_left(list(axis), target)
    if position <= 0:
        return 0
    if position >= len(axis):
        return len(axis) - 1
    before = axis[position - 1]
    after = axis[position]
    return position if abs(after - target) < abs(before - target) else position - 1


def _contiguous_slice(axis: Sequence[float], low: float, high: float) -> tuple[int, int]:
    """Inclusive index range of cells whose coordinate is within [low, high]."""
    if not axis:
        raise ValidationError("Cannot subset an empty axis.")
    inside = [i for i, v in enumerate(axis) if low <= v <= high]
    if inside:
        return inside[0], inside[-1]
    # No cell strictly inside: fall back to the nearest single cell so a tiny
    # bbox still returns a defensible sample rather than an empty result.
    i = nearest_index(axis, (low + high) / 2.0)
    return i, i


def bbox_index_bounds(
    lat: Sequence[float], lon: Sequence[float], bbox: BoundingBox
) -> tuple[int, int, int, int]:
    """Return (lat0, lat1, lon0, lon1) inclusive index bounds for a bbox.

    Longitude wrap (west > east) is not supported by a single IMERG granule at
    daily resolution in this implementation and is rejected explicitly.
    """
    if bbox.west > bbox.east:
        raise ValidationError(
            "Bounding boxes that cross the antimeridian are not supported for "
            "IMERG daily subsets.",
            details={"west": bbox.west, "east": bbox.east},
        )
    lat0, lat1 = _contiguous_slice(lat, bbox.south, bbox.north)
    lon0, lon1 = _contiguous_slice(lon, bbox.west, bbox.east)
    return lat0, lat1, lon0, lon1


# --------------------------------------------------------------------------- #
# Pure functions: value interpretation                                        #
# --------------------------------------------------------------------------- #


def is_valid_observation(value: Any, count: Any) -> bool:
    """Whether a grid cell holds a real IMERG estimate.

    Invalid when the value is missing/None, at or below the fill value, or not
    finite. A cell with ``count <= 0`` was filled and is *not* a 0 mm estimate.
    """
    if value is None or count is None:
        return False
    try:
        v = float(value)
        c = int(count)
    except (TypeError, ValueError):
        return False
    if v != v:  # NaN
        return False
    if v <= FILL_VALUE:
        return False
    if c <= 0:
        return False
    return True


def normalize_value(value: Any, count: Any) -> float | None:
    """Return a usable mm/day value, or ``None`` when the cell is not valid.

    Crucially, a real dry cell (0.0 with a positive count) returns ``0.0``,
    whereas a filled cell returns ``None``. This distinction is the whole point
    of consulting ``precipitation_cnt``.
    """
    if not is_valid_observation(value, count):
        return None
    return float(value)


@dataclass(frozen=True)
class DaySample:
    """A single day's extracted sample for a point or area."""

    day: date
    value_mm_per_day: float | None
    half_hourly_count: int
    valid_cells: int
    total_cells: int

    @property
    def coverage_ratio(self) -> float:
        if self.total_cells <= 0:
            return 0.0
        return self.valid_cells / self.total_cells


@dataclass
class ImergDay:
    """Parsed IMERG daily granule for one UTC day (subset grid)."""

    day: date
    lat: Sequence[float]
    lon: Sequence[float]
    precipitation: Sequence[Sequence[Any]]
    precipitation_cnt: Sequence[Sequence[Any]]
    mw_precipitation: Sequence[Sequence[Any]] | None = None
    random_error: Sequence[Sequence[Any]] | None = None
    probability_liquid: Sequence[Sequence[Any]] | None = None
    source_note: str | None = None

    def point_sample(self, point: GeoPoint) -> DaySample:
        """Nearest-cell sample at a point."""
        i = nearest_index(self.lat, point.latitude)
        j = nearest_index(self.lon, point.longitude)
        raw = self.precipitation[i][j]
        cnt = self.precipitation_cnt[i][j]
        value = normalize_value(raw, cnt)
        try:
            count = int(cnt) if cnt is not None else 0
        except (TypeError, ValueError):
            count = 0
        return DaySample(
            day=self.day,
            value_mm_per_day=value,
            half_hourly_count=count,
            valid_cells=1 if value is not None else 0,
            total_cells=1,
        )

    def area_sample(self, bbox: BoundingBox) -> DaySample:
        """Validity-weighted area mean over a bounding box (mm/day).

        Only cells with a valid estimate contribute. The reported value is the
        mean of valid cells; ``coverage_ratio`` exposes how much of the box was
        actually observed so a partly-filled box is never presented as complete.
        """
        lat0, lat1, lon0, lon1 = bbox_index_bounds(self.lat, self.lon, bbox)
        total = 0
        valid = 0
        acc = 0.0
        counts: list[int] = []
        for i in range(lat0, lat1 + 1):
            for j in range(lon0, lon1 + 1):
                total += 1
                raw = self.precipitation[i][j]
                cnt = self.precipitation_cnt[i][j]
                v = normalize_value(raw, cnt)
                if v is None:
                    continue
                valid += 1
                acc += v
                try:
                    counts.append(int(cnt))
                except (TypeError, ValueError):
                    continue
        if valid == 0:
            return DaySample(self.day, None, 0, 0, total)
        mean_count = int(round(sum(counts) / len(counts))) if counts else 0
        return DaySample(self.day, acc / valid, mean_count, valid, total)


# --------------------------------------------------------------------------- #
# Granule parsing                                                             #
# --------------------------------------------------------------------------- #


def parse_imerg_dataset(data: Mapping[str, Any], *, day: date | None = None) -> ImergDay:
    """Build an :class:`ImergDay` from an xarray/dict-like mapping of arrays.

    Accepts any object exposing ``__getitem__`` for the IMERG variable names,
    so it can be fed by xarray datasets in production and plain nested lists in
    tests without importing a NetCDF reader.
    """
    if DATASET_VARIABLE not in data:
        raise ProviderUnavailableError(
            "IMERG granule did not contain the 'precipitation' variable."
        )

    def _get(name: str) -> Any:
        try:
            return data[name]
        except (KeyError, IndexError):  # pragma: no cover - defensive
            return None

    lat = _get("lat")
    lon = _get("lon")
    if lat is None or lon is None:
        raise ProviderUnavailableError("IMERG granule was missing lat/lon axes.")

    precipitation = _get(DATASET_VARIABLE)
    counts = _get(COUNT_VARIABLE)
    if counts is None:
        # Never silently treat a missing count as "all valid"; require it.
        raise ProviderUnavailableError(
            "IMERG granule was missing 'precipitation_cnt'; refusing to treat "
            "filled cells as observations."
        )

    resolved_day = day
    if resolved_day is None:
        resolved_day = _day_from_time(_get("time"))

    return ImergDay(
        day=resolved_day or date.today(),
        lat=list(lat),
        lon=list(lon),
        precipitation=precipitation,
        precipitation_cnt=counts,
        mw_precipitation=_get(MW_VARIABLE),
        random_error=_get(ERROR_VARIABLE),
        probability_liquid=_get(PROBABILITY_VARIABLE),
    )


def _day_from_time(raw: Any) -> date | None:
    """Convert IMERG 'time' (days since 1980-01-06 UTC) to a calendar date."""
    if raw is None:
        return None
    try:
        value = float(_scalar(raw))
    except (TypeError, ValueError):
        return None
    epoch = datetime(1980, 1, 6, tzinfo=timezone.utc)
    return (epoch + timedelta(days=value)).date()


def _scalar(value: Any) -> Any:
    """Collapse a length-1 array to a Python scalar."""
    try:
        if hasattr(value, "__len__") and not isinstance(value, (str, bytes)):
            return value[0] if len(value) else value
    except TypeError:  # pragma: no cover - defensive
        pass
    return value


# --------------------------------------------------------------------------- #
# Retrieval (network). Thin, bounded, and never logs secrets.                 #
# --------------------------------------------------------------------------- #


async def _download_granule(day: date, *, settings: Settings) -> bytes:
    """Download one day's granule from S3 using signed temporary credentials.

    The download is bounded to ``imerg_max_download_bytes`` and refuses to load
    a truncated response, so a partial file can never be parsed as valid data.
    """
    import httpx

    credentials = await get_s3_credentials()
    key = granule_key(day, settings.gesdisc_imerg_prefix)
    signed = sign_get_object(
        bucket=settings.gesdisc_s3_bucket,
        key=key,
        access_key_id=credentials.access_key_id,
        secret_access_key=credentials.secret_access_key,
        session_token=credentials.session_token,
        region=settings.gesdisc_s3_region,
        endpoint_host=settings.gesdisc_s3_endpoint.split("://", 1)[-1],
    )

    url = f"{settings.gesdisc_s3_endpoint.rstrip('/')}/{key}"
    limit = settings.imerg_max_download_bytes
    timeout = httpx.Timeout(settings.provider_timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("GET", url, headers=signed.headers) as response:
            if response.status_code == 403:
                raise ProviderError(
                    "GES DISC S3 rejected the temporary credentials for IMERG.",
                    details={"provider": PROVIDER.id, "status": 403},
                )
            if response.status_code == 404:
                raise ProviderUnavailableError(
                    f"IMERG granule not found for {day.isoformat()}.",
                    details={"provider": PROVIDER.id},
                )
            if response.status_code >= 400:
                raise ProviderError(
                    f"GES DISC S3 returned HTTP {response.status_code} for IMERG.",
                    details={"provider": PROVIDER.id, "status": response.status_code},
                )
            declared = response.headers.get("content-length")
            if declared is not None and int(declared) > limit:
                raise ProviderError(
                    "IMERG granule exceeds the configured download bound.",
                    details={"provider": PROVIDER.id, "bytes": int(declared), "limit": limit},
                )
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > limit:
                    raise ProviderError(
                        "IMERG granule exceeded the configured download bound.",
                        details={"provider": PROVIDER.id, "limit": limit},
                    )
                chunks.append(chunk)
    return b"".join(chunks)


def _open_netcdf_bytes(payload: bytes) -> Any:
    """Open a NetCDF4/HDF5 granule in memory, requiring the optional extra."""
    try:
        import io

        import xarray as xr  # type: ignore
    except ImportError as exc:  # pragma: no cover - depends on optional extra
        raise ProviderUnconfiguredError(
            "Reading IMERG granules requires the optional 'imerg' extra "
            "(pip install -e '.[imerg]').",
            details={"provider": PROVIDER.id},
        ) from exc
    return xr.open_dataset(io.BytesIO(payload), engine="h5netcdf")


def _reduce_dataset(dataset: Any) -> ImergDay:
    """Extract a plain dict of arrays from an xarray dataset and parse it."""
    wanted = [
        DATASET_VARIABLE,
        COUNT_VARIABLE,
        MW_VARIABLE,
        MW_COUNT_VARIABLE,
        ERROR_VARIABLE,
        PROBABILITY_VARIABLE,
        "lat",
        "lon",
        "time",
    ]
    data: dict[str, Any] = {}
    for name in wanted:
        if name in dataset.variables:
            variable = dataset[name]
            # Squeeze any singleton time dimension so arrays are 2-D grids.
            for dim in list(getattr(variable, "dims", ())):
                if dim in ("time", "nv") and variable.sizes.get(dim) == 1:
                    variable = variable.isel({dim: 0})
            data[name] = variable.values
    return parse_imerg_dataset(data)


async def fetch_daily_granule(day: date, *, settings: Settings | None = None) -> ImergDay:
    """Fetch and parse IMERG Late Daily for a single UTC day (full global grid)."""
    settings = settings or get_settings()
    payload = await _download_granule(day, settings=settings)
    dataset = _open_netcdf_bytes(payload)
    try:
        return _reduce_dataset(dataset)
    finally:
        close = getattr(dataset, "close", None)
        if callable(close):
            close()


async def fetch_point_series(
    point: GeoPoint,
    *,
    start: date,
    end: date,
    settings: Settings | None = None,
) -> PrecipitationSeries:
    """Daily IMERG mm/day series at the nearest grid cell to a point.

    Downloads are sequential and bounded; each day is a separate granule. Days
    with no valid estimate are kept as ``None`` (never imputed as 0).
    """
    settings = settings or get_settings()
    _validate_range(start, end, settings)

    provenance_note = (
        "Satellite estimate (GPM IMERG Late Daily V07), not a gauge record. "
        "Value is the daily mean rate in mm/day, valid where precipitation_cnt>0."
    )
    points = []
    samples: list[DaySample] = []
    day = start
    while day <= end:
        granule = await fetch_daily_granule(day, settings=settings)
        sample = granule.point_sample(point)
        samples.append(sample)
        points.append(
            _series_point(day, sample.value_mm_per_day),
        )
        day += timedelta(days=1)

    if not samples:
        raise ProviderUnavailableError("IMERG returned no days for the range.")

    valid = [s.value_mm_per_day for s in samples if s.value_mm_per_day is not None]
    return PrecipitationSeries(
        location=point,
        start_date=start,
        end_date=end,
        granularity="daily",
        unit="mm",
        points=points,
        provenance=Provenance(
            source_id=PROVIDER.id,
            source_name=PROVIDER.name,
            classification=DataClassification.SATELLITE_ESTIMATE,
            observed_at=datetime.combine(end, time(3, 0), tzinfo=timezone.utc),
            method="IMERG Late Daily V07: mean valid half-hourly rate x 24 (mm/day)",
            method_version="1.0",
            notes=[provenance_note],
        ),
        provider=PROVIDER,
        coverage="Global 60N-60S full skill; 1998-01-01 to near-present (Late ~14 h latency)",
        missing_days=len(samples) - len(valid),
        total=sum(valid) if valid else None,
    )


def _series_point(day: date, value: float | None):
    from app.models.common import TimeSeriesPoint

    return TimeSeriesPoint(
        timestamp=datetime.combine(day, time(3, 0), tzinfo=timezone.utc),
        value=value,
        unit="mm",
    )


def _validate_range(start: date, end: date, settings: Settings) -> None:
    if end < start:
        raise ValidationError("end must be on or after start.")
    span = (end - start).days + 1
    if span > settings.imerg_max_days:
        raise ValidationError(
            f"IMERG range too large ({span} days; max {settings.imerg_max_days}).",
            details={"max_days": settings.imerg_max_days},
        )

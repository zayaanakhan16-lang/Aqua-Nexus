"""Area-selection geometry helpers.

Turns a user-drawn ring (or a place point) into a validated ``AreaSelection``:
a bounding box, a geodesic area, and — critically — the single analysis point
the existing point-based pipeline will actually run on, together with an honest
statement of how much of the drawn area that analysis covers.

Antimeridian crossings, degenerate rings, and oversized selections are handled
here so the API can reject or normalise them instead of passing a broken
geometry downstream.
"""
from __future__ import annotations

import math

from app.errors import ValidationError
from app.models.common import BoundingBox, GeoPoint
from app.models.water import AreaSelection

# A drawn selection larger than this is refused rather than silently analysed
# as if it were a point. It is roughly a 5-degree box (~550 km at the equator).
MAX_AREA_KM2 = 400_000.0
MAX_SPAN_DEG = 12.0

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two coordinates in kilometres."""
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def nearest_vertex_km(point: GeoPoint, ring: list[list[float]]) -> float:
    """Distance from a point to the nearest vertex of a lon/lat ring (km)."""
    return min(
        (haversine_km(point.latitude, point.longitude, lat, lon) for lon, lat in ring),
        default=float("inf"),
    )


def _geodesic_area_km2(coords: list[list[float]]) -> float:
    """Spherical-excess area of a lon/lat ring in km^2."""
    radius_km = 6371.0088
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i]
        lon2, lat2 = coords[i + 1]
        total += math.radians(lon2 - lon1) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2))
        )
    return abs(total * radius_km * radius_km / 2.0)


def _close_and_validate(coords: list[list[float]]) -> list[list[float]]:
    cleaned: list[list[float]] = []
    for pair in coords:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise ValidationError("Each coordinate must be a [longitude, latitude] pair.")
        lon, lat = float(pair[0]), float(pair[1])
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            raise ValidationError(f"Coordinate out of range: [{lon}, {lat}].")
        cleaned.append([round(lon, 6), round(lat, 6)])
    if len(cleaned) < 4:
        raise ValidationError(
            "A selection ring needs at least four points (a triangle plus its "
            "closing point)."
        )
    if cleaned[0] != cleaned[-1]:
        cleaned.append(cleaned[0])
    # A ring that encloses no area is degenerate (all points collinear or
    # identical); refuse it rather than reporting a zero-area selection.
    if _geodesic_area_km2(cleaned) <= 0.0:
        raise ValidationError("The selection ring encloses no area.")
    return cleaned


def _unwrap_antimeridian(coords: list[list[float]]) -> list[list[float]]:
    """Unwrap a ring whose longitudes jump across the antimeridian.

    A rectangle drawn across the date line has longitudes such as 179 -> -179.
    Left as-is, the bounding box would span the entire globe and the area would
    be nonsense. Unwrapping shifts negative longitudes past the jump by +360 so
    the ring stays contiguous; the bounding box is then reported in the same
    unwrapped frame and flagged via ``crosses_antimeridian``.
    """
    if len(coords) < 2:
        return coords
    out = [coords[0][:]]
    for lon, lat in coords[1:]:
        prev_lon = out[-1][0]
        while lon - prev_lon > 180:
            lon -= 360
        while lon - prev_lon < -180:
            lon += 360
        out.append([lon, lat])
    return out


def build_area_selection(
    coordinates: list[list[float]] | None,
    *,
    point: GeoPoint | None = None,
    label: str | None = None,
) -> AreaSelection:
    """Build a validated selection from a drawn ring, a point, or both.

    When a ring is supplied, the analysis point is its centroid and the coverage
    is reported as ``bounding_box``: the point-based pipeline is run at the
    centroid, so the analysis represents the selection's centre, not every pixel
    inside it. That distinction is stated explicitly rather than implied away.
    """
    if coordinates:
        unwrapped = _unwrap_antimeridian(_close_and_validate(coordinates))
        lons = [c[0] for c in unwrapped]
        lats = [c[1] for c in unwrapped]
        west, east = min(lons), max(lons)
        south, north = min(lats), max(lats)

        if (east - west) > MAX_SPAN_DEG or (north - south) > MAX_SPAN_DEG:
            raise ValidationError(
                f"Selection is too large ({east - west:.1f} x {north - south:.1f} "
                f"degrees). Draw an area no larger than {MAX_SPAN_DEG} degrees per side."
            )
        area_km2 = _geodesic_area_km2(unwrapped)
        if area_km2 > MAX_AREA_KM2:
            raise ValidationError(
                f"Selection area ({area_km2:,.0f} km2) exceeds the supported maximum "
                f"of {MAX_AREA_KM2:,.0f} km2."
            )

        centroid_lon = sum(lons) / len(lons)
        centroid_lat = sum(lats) / len(lats)
        # Normalise the centroid back into [-180, 180] for the point pipeline.
        centroid_lon = ((centroid_lon + 180) % 360) - 180
        analysis_point = GeoPoint(
            latitude=round(centroid_lat, 5), longitude=round(centroid_lon, 5)
        )
        return AreaSelection(
            bbox=BoundingBox(
                west=max(-180.0, round(west, 6)),
                south=max(-90.0, round(south, 6)),
                east=min(180.0, round(east, 6)),
                north=min(90.0, round(north, 6)),
            ),
            coordinates=[[round(c[0], 6), c[1]] for c in unwrapped],
            area_km2=round(area_km2, 3),
            analysis_point=analysis_point,
            coverage="bounding_box",
            coverage_note=(
                "The current analysis runs at the centre of the drawn area. The "
                "summary and indicators describe that centre point; they do not "
                "average every location inside the drawn boundary."
            ),
            label=label,
        )

    if point is not None:
        return AreaSelection(
            bbox=BoundingBox(
                west=point.longitude,
                south=point.latitude,
                east=point.longitude,
                north=point.latitude,
            ),
            coordinates=[],
            area_km2=None,
            analysis_point=point,
            coverage="point_only",
            coverage_note=(
                "A single-point selection. The analysis covers this coordinate only."
            ),
            label=label,
        )

    raise ValidationError("Provide either a drawn ring or a point to select an area.")

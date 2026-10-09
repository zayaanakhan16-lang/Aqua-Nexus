/**
 * Pure geospatial helpers, independent of React so they can be unit tested.
 */

const COORD_PATTERN =
  /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * Parse a "lat, lon" or "lat lon" string into coordinates.
 * Returns null when the input is not a valid in-range coordinate pair.
 */
export function parseCoordinates(query: string): { lat: number; lon: number } | null {
  const match = COORD_PATTERN.exec(query);
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

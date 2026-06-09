const coordinatePattern = /[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/;
const coordinatePairPattern = /^\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/;

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export function sanitizeCoordinateInput(value: string) {
  const match = value.trim().match(coordinatePattern);
  if (!match) return "";

  return match[0].replace(",", ".");
}

export function parseCoordinateInput(value: string) {
  const sanitized = sanitizeCoordinateInput(value);
  if (!sanitized) return undefined;

  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatCoordinatesInput(latitude?: number, longitude?: number) {
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || typeof longitude !== "number" || !Number.isFinite(longitude)) {
    return "";
  }

  return `${latitude}, ${longitude}`;
}

export function parseCoordinatesInput(value: string): Coordinates | undefined {
  const match = value.match(coordinatePairPattern);
  if (!match) return undefined;

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return undefined;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return undefined;

  return { latitude, longitude };
}

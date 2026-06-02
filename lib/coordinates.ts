const coordinatePattern = /[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/;

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

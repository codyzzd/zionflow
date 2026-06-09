import assert from "node:assert/strict";
import test from "node:test";

const { formatCoordinatesInput, parseCoordinateInput, parseCoordinatesInput, sanitizeCoordinateInput } = await import(
  new URL("./coordinates.ts", import.meta.url).href
);

test("removes harmless trailing characters from pasted coordinates", () => {
  assert.equal(sanitizeCoordinateInput("-7.1212168565844145,"), "-7.1212168565844145");
  assert.equal(parseCoordinateInput("-7.1212168565844145,"), -7.1212168565844145);
  assert.equal(sanitizeCoordinateInput("-7.1212168565844145a"), "-7.1212168565844145");
  assert.equal(parseCoordinateInput("-7.1212168565844145a"), -7.1212168565844145);
});

test("normalizes comma decimal coordinates", () => {
  assert.equal(sanitizeCoordinateInput("-7,121216"), "-7.121216");
  assert.equal(parseCoordinateInput("-7,121216"), -7.121216);
});

test("returns undefined when no coordinate number exists", () => {
  assert.equal(sanitizeCoordinateInput(""), "");
  assert.equal(parseCoordinateInput(""), undefined);
  assert.equal(sanitizeCoordinateInput("abc"), "");
  assert.equal(parseCoordinateInput("abc"), undefined);
});

test("parses normal negative longitude values", () => {
  assert.equal(sanitizeCoordinateInput("-38.5267"), "-38.5267");
  assert.equal(parseCoordinateInput("-38.5267"), -38.5267);
});

test("formats a complete coordinate pair", () => {
  assert.equal(formatCoordinatesInput(-7.1230045944912455, -34.83663470000887), "-7.1230045944912455, -34.83663470000887");
  assert.equal(formatCoordinatesInput(undefined, -34.8366), "");
  assert.equal(formatCoordinatesInput(-7.123, undefined), "");
});

test("parses negative and positive coordinate pairs", () => {
  assert.deepEqual(parseCoordinatesInput("-7.1230045944912455, -34.83663470000887"), {
    latitude: -7.1230045944912455,
    longitude: -34.83663470000887,
  });
  assert.deepEqual(parseCoordinatesInput(" 7.123, 34.836 "), { latitude: 7.123, longitude: 34.836 });
  assert.deepEqual(parseCoordinatesInput(".5, -.75"), { latitude: 0.5, longitude: -0.75 });
});

test("rejects incomplete, malformed, and out-of-range coordinate pairs", () => {
  assert.equal(parseCoordinatesInput(""), undefined);
  assert.equal(parseCoordinatesInput("-7.123"), undefined);
  assert.equal(parseCoordinatesInput("-7.123 -34.836"), undefined);
  assert.equal(parseCoordinatesInput("-7,123, -34,836"), undefined);
  assert.equal(parseCoordinatesInput("latitude, longitude"), undefined);
  assert.equal(parseCoordinatesInput("120, 45"), undefined);
  assert.equal(parseCoordinatesInput("-7.123, 190"), undefined);
});

import assert from "node:assert/strict";
import test from "node:test";

const { parseCoordinateInput, sanitizeCoordinateInput } = await import(new URL("./coordinates.ts", import.meta.url).href);

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

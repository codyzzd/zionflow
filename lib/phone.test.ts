import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBrazilPhoneForWhatsApp } from "./phone";

test("normalizes complete Brazilian phones for WhatsApp links", () => {
  assert.equal(normalizeBrazilPhoneForWhatsApp("(83) 99999-9999"), "5583999999999");
  assert.equal(normalizeBrazilPhoneForWhatsApp("45 99999-9999"), "5545999999999");
  assert.equal(normalizeBrazilPhoneForWhatsApp("+55 83 99999-9999"), "5583999999999");
  assert.equal(normalizeBrazilPhoneForWhatsApp("0 83 99999-9999"), "5583999999999");
  assert.equal(normalizeBrazilPhoneForWhatsApp("021 83 99999-9999"), "5583999999999");
});

test("rejects phone values that do not identify a Brazilian area code", () => {
  assert.equal(normalizeBrazilPhoneForWhatsApp("99999-9999"), null);
  assert.equal(normalizeBrazilPhoneForWhatsApp(""), null);
  assert.equal(normalizeBrazilPhoneForWhatsApp("telefone"), null);
});

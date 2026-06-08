import assert from "node:assert/strict";
import test from "node:test";

import { memberNameIdentityKey, memberStrongIdentityKey, memberWeakIdentityKey } from "./member-identity";

test("normalizes member names for identity matching", () => {
  assert.equal(memberNameIdentityKey("  Aurora   Moreira Gonçalves "), "aurora-moreira-goncalves");
  assert.equal(memberNameIdentityKey("AURORA MOREIRA GONCALVES"), "aurora-moreira-goncalves");
});

test("builds strong identity with ward, normalized name, and birth date", () => {
  assert.equal(
    memberStrongIdentityKey({
      wardId: "ward-1",
      name: "Aurora Moreira Gonçalves",
      birthDate: "16/06/2016",
    }),
    "ward-1::aurora-moreira-goncalves::2016-06-16",
  );
});

test("does not build strong identity without birth date", () => {
  assert.equal(memberStrongIdentityKey({ wardId: "ward-1", name: "Aurora Moreira Gonçalves", birthDate: "" }), "");
});

test("keeps identical people in different wards separate", () => {
  assert.notEqual(
    memberStrongIdentityKey({ wardId: "ward-1", name: "Aurora Moreira Gonçalves", birthDate: "2016-06-16" }),
    memberStrongIdentityKey({ wardId: "ward-2", name: "Aurora Moreira Gonçalves", birthDate: "2016-06-16" }),
  );
  assert.notEqual(
    memberWeakIdentityKey({ wardId: "ward-1", name: "Aurora Moreira Gonçalves" }),
    memberWeakIdentityKey({ wardId: "ward-2", name: "Aurora Moreira Gonçalves" }),
  );
});

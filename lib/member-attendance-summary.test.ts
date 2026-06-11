import assert from "node:assert/strict";
import test from "node:test";

import type { MemberAttendanceSummary } from "./member-attendance-summary";
import type { Member, MemberAttendanceRecord } from "../types/domain";

const { buildMemberAttendanceSummaries } = await import(new URL("./member-attendance-summary.ts", import.meta.url).href);

function member(id: string): Member {
  return {
    id,
    wardId: "ward-1",
    name: id,
    phone: "",
    address: "",
    observation: "",
    churchActivityStatus: "attending",
    progressCategory: "disconnected",
    birthDate: "",
    organization: "",
    sex: "M",
    sacramentTalkDuration: "not_designable",
    canSpeak: false,
    canPreside: false,
    canConduct: false,
  };
}

function attendance(memberId: string, date: string, present: boolean): MemberAttendanceRecord {
  return {
    id: `${memberId}-${date}`,
    wardId: "ward-1",
    memberId,
    date,
    present,
    source: "csv",
  };
}

test("assigns each member to the exact absence count in the latest three Sundays", () => {
  const members = [member("missed-0"), member("missed-1"), member("missed-2"), member("missed-3")];
  const dates = ["2026-06-07", "2026-05-31", "2026-05-24"];
  const records = [
    ...dates.map((date) => attendance("missed-0", date, true)),
    attendance("missed-1", dates[1], false),
    attendance("missed-1", dates[0], true),
    attendance("missed-1", dates[2], true),
    attendance("missed-2", dates[2], false),
    attendance("missed-2", dates[0], false),
    attendance("missed-2", dates[1], true),
    ...dates.map((date) => attendance("missed-3", date, false)),
  ];

  const buckets = new Map(buildMemberAttendanceSummaries(members, records).map((summary: MemberAttendanceSummary) => [summary.member.id, summary.bucketKey]));

  assert.deepEqual(Object.fromEntries(buckets), {
    "missed-0": "missed_0",
    "missed-1": "missed_1",
    "missed-2": "missed_2",
    "missed-3": "missed_3",
  });
});

test("counts only available records when a member has fewer than three Sundays", () => {
  const summaries = buildMemberAttendanceSummaries(
    [member("one-record"), member("two-records")],
    [
      attendance("one-record", "2026-06-07", false),
      attendance("two-records", "2026-06-07", false),
      attendance("two-records", "2026-05-31", true),
    ],
  );

  assert.deepEqual(
    summaries.map((summary: MemberAttendanceSummary) => [summary.member.id, summary.bucketKey]),
    [
      ["one-record", "missed_1"],
      ["two-records", "missed_1"],
    ],
  );
});

test("ignores older Sundays for the bucket while preserving full history and last presence", () => {
  const summary = buildMemberAttendanceSummaries(
    [member("member-1")],
    [
      attendance("member-1", "2026-06-07", false),
      attendance("member-1", "2026-05-31", true),
      attendance("member-1", "2026-05-24", true),
      attendance("member-1", "2026-05-17", false),
      attendance("member-1", "2026-05-10", true),
    ],
  )[0];

  assert.equal(summary.bucketKey, "missed_1");
  assert.equal(summary.missedSundays, 1);
  assert.equal(summary.records.length, 5);
  assert.equal(summary.lastPresentDate, "2026-05-31");
});

test("marks members without records as no history", () => {
  const summary = buildMemberAttendanceSummaries([member("without-records")], [attendance("another-member", "2026-06-07", true)])[0];

  assert.equal(summary.bucketKey, "no_history");
  assert.equal(summary.missedSundays, 0);
  assert.equal(summary.lastPresentDate, null);
  assert.deepEqual(summary.records, []);
});

test("marks members without records in the current three-Sunday window as no history", () => {
  const summary = buildMemberAttendanceSummaries(
    [member("old-history")],
    [
      attendance("another-member", "2026-06-07", true),
      attendance("another-member", "2026-05-31", true),
      attendance("another-member", "2026-05-24", true),
      attendance("old-history", "2026-05-17", true),
    ],
  )[0];

  assert.equal(summary.bucketKey, "no_history");
  assert.equal(summary.lastPresentDate, "2026-05-17");
  assert.equal(summary.records.length, 1);
});

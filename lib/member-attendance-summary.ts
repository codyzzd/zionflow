import type { Member, MemberAttendanceRecord } from "@/types/domain";

export type AttendanceBucketKey = "missed_0" | "missed_1" | "missed_2" | "missed_3";
export type MemberAttendanceBucketKey = AttendanceBucketKey | "no_history";

export const memberAttendanceBucketOptions: Array<{ label: string; shortLabel: string; value: MemberAttendanceBucketKey }> = [
  { label: "Não faltou nos últimos 3", shortLabel: "0 faltas", value: "missed_0" },
  { label: "Faltou 1 domingo", shortLabel: "1 falta", value: "missed_1" },
  { label: "Faltou 2 domingos", shortLabel: "2 faltas", value: "missed_2" },
  { label: "Faltou 3 domingos", shortLabel: "3 faltas", value: "missed_3" },
  { label: "Sem histórico importado", shortLabel: "Sem histórico", value: "no_history" },
];

export const memberAttendanceBucketLabels = Object.fromEntries(
  memberAttendanceBucketOptions.map((option) => [option.value, option.label]),
) as Record<MemberAttendanceBucketKey, string>;

export type MemberAttendanceSummary = {
  bucketKey: MemberAttendanceBucketKey;
  lastPresentDate: string | null;
  member: Member;
  missedSundays: number;
  records: MemberAttendanceRecord[];
};

function getAttendanceBucket(missedSundays: number): AttendanceBucketKey {
  if (missedSundays <= 0) return "missed_0";
  if (missedSundays === 1) return "missed_1";
  if (missedSundays === 2) return "missed_2";

  return "missed_3";
}

export function filterAttendanceRecordsThroughDate(records: MemberAttendanceRecord[], referenceDate: string) {
  return records.filter((record) => record.date <= referenceDate);
}

export function buildMemberAttendanceSummaries(members: Member[], records: MemberAttendanceRecord[]): MemberAttendanceSummary[] {
  const recentSundayDates = [...new Set(records.map((record) => record.date).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 3);
  const recentSundayDateSet = new Set(recentSundayDates);
  const recordsByMember = new Map<string, MemberAttendanceRecord[]>();

  records.forEach((record) => {
    recordsByMember.set(record.memberId, [...(recordsByMember.get(record.memberId) ?? []), record]);
  });

  return members.map((member) => {
    const memberRecords = [...(recordsByMember.get(member.id) ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    const recentMemberRecords = memberRecords.filter((record) => recentSundayDateSet.has(record.date));
    const missedSundays = recentMemberRecords.filter((record) => !record.present).length;
    const lastPresentDate = memberRecords.find((record) => record.present)?.date ?? null;

    return {
      bucketKey: recentMemberRecords.length ? getAttendanceBucket(missedSundays) : "no_history",
      lastPresentDate,
      member,
      missedSundays,
      records: memberRecords,
    };
  });
}

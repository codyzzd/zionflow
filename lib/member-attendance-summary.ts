import type { Member, MemberAttendanceRecord } from "@/types/domain";

export type AttendanceBucketKey = "present_last_sunday" | "missed_1" | "missed_2" | "missed_3" | "missed_4_plus";

export type MemberAttendanceSummary = {
  bucketKey: AttendanceBucketKey;
  lastPresentDate: string | null;
  member: Member;
  missedSundays: number;
  records: MemberAttendanceRecord[];
};

function getAttendanceBucket(missedSundays: number): AttendanceBucketKey {
  if (missedSundays <= 0) return "present_last_sunday";
  if (missedSundays === 1) return "missed_1";
  if (missedSundays === 2) return "missed_2";
  if (missedSundays === 3) return "missed_3";

  return "missed_4_plus";
}

export function filterAttendanceRecordsThroughDate(records: MemberAttendanceRecord[], referenceDate: string) {
  return records.filter((record) => record.date <= referenceDate);
}

export function buildMemberAttendanceSummaries(members: Member[], records: MemberAttendanceRecord[]): MemberAttendanceSummary[] {
  const sundayDates = [...new Set(records.map((record) => record.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const recordsByMember = new Map<string, MemberAttendanceRecord[]>();

  records.forEach((record) => {
    recordsByMember.set(record.memberId, [...(recordsByMember.get(record.memberId) ?? []), record]);
  });

  return members.map((member) => {
    const memberRecords = [...(recordsByMember.get(member.id) ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    const presentDates = new Set(memberRecords.filter((record) => record.present).map((record) => record.date));
    const lastPresentIndex = sundayDates.findIndex((date) => presentDates.has(date));
    const missedSundays = lastPresentIndex >= 0 ? lastPresentIndex : sundayDates.length;

    return {
      bucketKey: getAttendanceBucket(missedSundays),
      lastPresentDate: lastPresentIndex >= 0 ? sundayDates[lastPresentIndex] : null,
      member,
      missedSundays,
      records: memberRecords,
    };
  });
}

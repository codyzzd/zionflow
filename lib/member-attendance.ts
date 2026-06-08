import { normalizeDateInput } from "@/lib/utils";
import type { ChurchActivityStatus, Member, MemberAttendanceRecord } from "@/types/domain";

export type MemberFrequencyResolution = {
  consideredRecords: MemberAttendanceRecord[];
  hasHistoricalStatus: boolean;
  status: ChurchActivityStatus;
};

export function resolveMemberFrequencyStatus(
  member: Pick<Member, "churchActivityStatus" | "id">,
  records: MemberAttendanceRecord[],
  referenceDate?: string,
): MemberFrequencyResolution {
  if (member.churchActivityStatus === "away") {
    return {
      consideredRecords: [],
      hasHistoricalStatus: true,
      status: "away",
    };
  }

  const normalizedReferenceDate = normalizeDateInput(referenceDate ?? "");
  const consideredRecords = records
    .filter((record) => record.memberId === member.id && record.date && (!normalizedReferenceDate || record.date <= normalizedReferenceDate))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (consideredRecords.length < 3) {
    return {
      consideredRecords,
      hasHistoricalStatus: false,
      status: "attending",
    };
  }

  const hasRecentPresence = consideredRecords.some((record) => record.present);

  return {
    consideredRecords,
    hasHistoricalStatus: true,
    status: hasRecentPresence ? "attending" : "not_attending",
  };
}

export function resolvePersistedMemberFrequencyStatus(
  member: Pick<Member, "churchActivityStatus" | "id">,
  records: MemberAttendanceRecord[],
): MemberFrequencyResolution {
  const resolution = resolveMemberFrequencyStatus(member, records);

  return {
    ...resolution,
    status: member.churchActivityStatus,
  };
}

export function memberAttendanceKey(record: Pick<MemberAttendanceRecord, "date" | "memberId" | "wardId">) {
  return `${record.wardId}::${record.memberId}::${record.date}`;
}

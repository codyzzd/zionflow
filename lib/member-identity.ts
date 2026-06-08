import { normalizeDateInput, slugify } from "@/lib/utils";
import type { Member } from "@/types/domain";

type MemberIdentityInput = Pick<Member, "wardId" | "name" | "birthDate">;

export function memberNameIdentityKey(name: string) {
  return slugify(name);
}

export function memberWeakIdentityKey(member: Pick<MemberIdentityInput, "wardId" | "name">) {
  const wardId = member.wardId.trim();
  const nameKey = memberNameIdentityKey(member.name);

  return wardId && nameKey ? `${wardId}::${nameKey}` : "";
}

export function memberStrongIdentityKey(member: MemberIdentityInput) {
  const weakKey = memberWeakIdentityKey(member);
  const birthDate = normalizeDateInput(member.birthDate);

  return weakKey && birthDate ? `${weakKey}::${birthDate}` : "";
}

export function groupMembersByStrongIdentity<T extends MemberIdentityInput>(members: T[]) {
  const groups = new Map<string, T[]>();

  members.forEach((member) => {
    const key = memberStrongIdentityKey(member);
    if (!key) return;

    groups.set(key, [...(groups.get(key) ?? []), member]);
  });

  return groups;
}

export function groupMembersByWeakIdentity<T extends Pick<MemberIdentityInput, "wardId" | "name">>(members: T[]) {
  const groups = new Map<string, T[]>();

  members.forEach((member) => {
    const key = memberWeakIdentityKey(member);
    if (!key) return;

    groups.set(key, [...(groups.get(key) ?? []), member]);
  });

  return groups;
}

export function findStrongIdentityDuplicateGroups<T extends MemberIdentityInput>(members: T[]) {
  return [...groupMembersByStrongIdentity(members).entries()].flatMap(([key, group]) => (group.length > 1 ? [{ key, members: group }] : []));
}

export function compareMemberFreshness(a: Pick<Member, "createdAt" | "updatedAt">, b: Pick<Member, "createdAt" | "updatedAt">) {
  const aTimestamp = a.updatedAt ?? a.createdAt ?? "";
  const bTimestamp = b.updatedAt ?? b.createdAt ?? "";

  return aTimestamp.localeCompare(bTimestamp);
}

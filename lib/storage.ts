import { createSeedDatabase } from "@/lib/demo-data";
import { normalizeDateInput } from "@/lib/utils";
import type { Database, Member } from "@/types/domain";

const STORAGE_KEY = "superala-db-v1";

function normalizeMember(member: Member): Member {
  const organization = String(member.organization ?? "");
  const legacyMember = member as Member & { leadership?: unknown };
  const leadership = String(legacyMember.leadership ?? "");
  const calling = `${organization} ${leadership}`.toLocaleLowerCase("pt-BR");
  const isBishopric = calling.includes("bisp") || calling.includes("presid");
  const isSecretary = calling.includes("secret");

  return {
    id: member.id,
    wardId: member.wardId,
    name: member.name,
    birthDate: normalizeDateInput(member.birthDate ?? ""),
    organization,
    sex: member.sex === "F" ? "F" : "M",
    sacramentTalkDuration:
      member.sacramentTalkDuration === "10" || member.sacramentTalkDuration === "15" ? member.sacramentTalkDuration : "5",
    canSpeak: typeof member.canSpeak === "boolean" ? member.canSpeak : true,
    canPreside: typeof member.canPreside === "boolean" ? member.canPreside : isBishopric,
    canConduct: typeof member.canConduct === "boolean" ? member.canConduct : isBishopric || isSecretary,
  };
}

function normalizeDatabase(db: Database): Database {
  return {
    ...db,
    members: db.members.map((member) => normalizeMember(member)),
    appPreferences: {
      calendarWeekStartsOn:
        db.appPreferences?.calendarWeekStartsOn === "monday" || db.appPreferences?.calendarWeekStartsOn === "sunday"
          ? db.appPreferences.calendarWeekStartsOn
          : "sunday",
      dateFormat:
        db.appPreferences?.dateFormat === "short" ||
        db.appPreferences?.dateFormat === "medium" ||
        db.appPreferences?.dateFormat === "long"
          ? db.appPreferences.dateFormat
          : "medium",
    },
  };
}

export function loadDatabase(): Database {
  if (typeof window === "undefined") {
    return createSeedDatabase();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = createSeedDatabase();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return normalizeDatabase(seed);
  }

  try {
    return normalizeDatabase(JSON.parse(raw) as Database);
  } catch {
    const seed = createSeedDatabase();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return normalizeDatabase(seed);
  }
}

export function saveDatabase(db: Database) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

export function resetDatabase() {
  const seed = createSeedDatabase();
  saveDatabase(seed);
  return seed;
}

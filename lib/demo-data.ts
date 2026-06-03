import type { Database, MinuteFormData } from "@/types/domain";
import { DEFAULT_HYMN_BOOK_IDS } from "@/lib/system-ids";

export function emptyHybridField() {
  return {
    mode: "linked" as const,
    linkedId: "",
    manualValue: "",
  };
}

export function createEmptyMinuteForm(): MinuteFormData {
  return {
    presiding: emptyHybridField(),
    conducting: emptyHybridField(),
    recognitions: "",
    announcements: "",
    attendance: 0,
    conductor: emptyHybridField(),
    accompanist: emptyHybridField(),
    openingHymn: emptyHybridField(),
    openingPrayer: emptyHybridField(),
    releases: "",
    sustainings: "",
    priesthoodAdvancements: "",
    certificates: "",
    confirmations: "",
    childBlessings: "",
    sacramentHymn: emptyHybridField(),
    speaker1: emptyHybridField(),
    speaker1Theme: "",
    speaker2: emptyHybridField(),
    speaker2Theme: "",
    intermediateHymn: emptyHybridField(),
    speaker3: emptyHybridField(),
    speaker3Theme: "",
    closingHymn: emptyHybridField(),
    closingPrayer: emptyHybridField(),
    notes: "",
    weather: undefined,
  };
}

export function createSeedDatabase(): Database {
  return {
    stakes: [],
    wards: [],
    roles: [],
    users: [],
    stakeOwnerRequests: [],
    members: [],
    memberNotes: [],
    sacramentMinutes: [],
    minuteVersions: [],
    hymnBooks: [
      { id: DEFAULT_HYMN_BOOK_IDS.old, name: "Antigo", emoji: "📜" },
      { id: DEFAULT_HYMN_BOOK_IDS.new, name: "Novo", emoji: "📘" },
      { id: DEFAULT_HYMN_BOOK_IDS.primary, name: "Primária", emoji: "🌈" },
    ],
    hymns: [],
    missionaryCompanionships: [],
    hostHouses: [],
    lunchSchedules: [],
    caravans: [],
    caravanPeople: [],
    caravanRegistrations: [],
    documentTypes: [],
    patrolMembers: [],
    patrolSchedules: [],
    auditLogs: [],
    appPreferences: {
      calendarWeekStartsOn: "sunday",
      dateFormat: "medium",
    },
    session: {},
  };
}

export function withDemoWard(db: Database): Database {
  return db;
}

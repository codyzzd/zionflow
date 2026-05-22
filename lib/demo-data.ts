import type { Database, MinuteFormData } from "@/types/domain";

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
    speaker2: emptyHybridField(),
    intermediateHymn: emptyHybridField(),
    speaker3: emptyHybridField(),
    closingHymn: emptyHybridField(),
    closingPrayer: emptyHybridField(),
    notes: "",
  };
}

export function createSeedDatabase(): Database {
  return {
    stakes: [],
    wards: [],
    roles: [],
    users: [],
    members: [],
    memberNotes: [],
    sacramentMinutes: [],
    minuteVersions: [],
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

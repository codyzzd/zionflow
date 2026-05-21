import { createClient } from "@/lib/supabase/client";
import { normalizePermissionSet, permissionsFromLegacyRole } from "@/lib/access-control";
import { normalizeDateInput } from "@/lib/utils";
import type {
  AppPreferences,
  Caravan,
  CaravanPerson,
  CaravanRegistration,
  Database,
  DocumentType,
  Member,
  MissionaryCompanionship,
  HostHouse,
  LunchSchedule,
  PatrolMember,
  PatrolSchedule,
  RecordMetadata,
  Role,
  User,
} from "@/types/domain";

const APP_PREFERENCES_STORAGE_KEY = "superala-preferences-v1";
const SYSTEM_USER_ID = "system";
const UNKNOWN_TIMESTAMP = "1970-01-01T00:00:00.000Z";
const DEFAULT_APP_PREFERENCES: AppPreferences = {
  calendarWeekStartsOn: "sunday",
  dateFormat: "medium",
};

const REMOTE_TABLES = [
  { key: "stakes", table: "stakes" },
  { key: "wards", table: "wards" },
  { key: "roles", table: "roles" },
  { key: "users", table: "users" },
  { key: "members", table: "members" },
  { key: "memberNotes", table: "member_notes" },
  { key: "sacramentMinutes", table: "sacrament_minutes" },
  { key: "minuteVersions", table: "minute_versions" },
  { key: "hymns", table: "hymns" },
  { key: "missionaryCompanionships", table: "missionary_companionships" },
  { key: "hostHouses", table: "host_houses" },
  { key: "lunchSchedules", table: "lunch_schedules" },
  { key: "caravans", table: "caravans" },
  { key: "caravanPeople", table: "caravan_people" },
  { key: "caravanRegistrations", table: "caravan_registrations" },
  { key: "documentTypes", table: "document_types" },
  { key: "patrolMembers", table: "patrol_members" },
  { key: "patrolSchedules", table: "patrol_schedules" },
  { key: "auditLogs", table: "audit_logs" },
] as const;

type RemoteRecord = {
  id: string;
  data?: Record<string, unknown> | null;
  number?: string | null;
  title?: string | null;
  active?: boolean | null;
  [key: string]: unknown;
};
type RemoteCollectionKey = (typeof REMOTE_TABLES)[number]["key"];
type RemoteColumnValue = boolean | string | string[] | unknown[] | Record<string, unknown> | null;
type RemoteColumns = Record<string, RemoteColumnValue>;

type LegacyMetadata = Partial<RecordMetadata> & {
  createdBy?: unknown;
  updatedBy?: unknown;
  archivedBy?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asDataObject(row: RemoteRecord) {
  return row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {};
}

function rowString(row: RemoteRecord, columnName: string, dataKey: string, fallback = "") {
  return asString(row[columnName]) ?? asString(asDataObject(row)[dataKey]) ?? fallback;
}

function rowOptionalString(row: RemoteRecord, columnName: string, dataKey: string) {
  return asString(row[columnName]) ?? asString(asDataObject(row)[dataKey]);
}

function rowStringArray(row: RemoteRecord, columnName: string, dataKey: string) {
  const columnValue = row[columnName];

  if (Array.isArray(columnValue)) {
    return asStringArray(columnValue);
  }

  return asStringArray(asDataObject(row)[dataKey]);
}

function rowBoolean(row: RemoteRecord, columnName: string, dataKey: string, fallback = false) {
  const columnValue = row[columnName];
  const dataValue = asDataObject(row)[dataKey];

  return typeof columnValue === "boolean" ? columnValue : asBoolean(dataValue, fallback);
}

function normalizeRecordMetadata(record: LegacyMetadata): RecordMetadata {
  const createdAt = asString(record.createdAt) ?? asString(record.updatedAt) ?? UNKNOWN_TIMESTAMP;
  const createdByUserId = asString(record.createdByUserId) ?? asString(record.createdBy) ?? SYSTEM_USER_ID;
  const updatedAt = asString(record.updatedAt) ?? createdAt;
  const updatedByUserId = asString(record.updatedByUserId) ?? asString(record.updatedBy) ?? createdByUserId;
  const archivedAt = asString(record.archivedAt);
  const archivedByUserId = archivedAt ? asString(record.archivedByUserId) ?? asString(record.archivedBy) ?? updatedByUserId : undefined;

  return {
    createdAt,
    createdByUserId,
    updatedAt,
    updatedByUserId,
    archivedAt,
    archivedByUserId,
  };
}

function normalizeSimpleRecord<T extends RecordMetadata>(record: T): T {
  return {
    ...record,
    ...normalizeRecordMetadata(record),
  };
}

function normalizeUser(user: User, roles: Role[]): User {
  const normalizedUser = normalizeSimpleRecord(user);
  const rolePermissions = roles.find((role) => role.id === normalizedUser.roleId)?.permissions ?? [];
  const directPermissions = Array.isArray(user.permissionOverrides) ? user.permissionOverrides : [];
  const permissionsConfigured = user.permissionsConfigured === true;

  return {
    ...normalizedUser,
    roleId: normalizedUser.roleId || "role_viewer",
    permissionOverrides: permissionsConfigured
      ? normalizePermissionSet(directPermissions)
      : permissionsFromLegacyRole(normalizedUser.roleId, [...rolePermissions, ...directPermissions]),
    permissionsConfigured: true,
  };
}

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
    ...normalizeRecordMetadata(member),
  };
}

function normalizeDocumentType(documentType: DocumentType): DocumentType {
  return {
    id: documentType.id,
    name: String(documentType.name ?? ""),
    active: documentType.active !== false,
    ...normalizeRecordMetadata(documentType),
  };
}

function normalizeCaravanPerson(person: CaravanPerson): CaravanPerson {
  return {
    id: person.id,
    wardId: person.wardId,
    homeWardId: person.homeWardId || person.wardId,
    type: person.type === "friends" ? "friends" : "family",
    name: String(person.name ?? ""),
    birthDate: normalizeDateInput(person.birthDate ?? ""),
    sex: person.sex === "F" ? "F" : "M",
    documentTypeId: String(person.documentTypeId ?? ""),
    documentValue: String(person.documentValue ?? ""),
    phone: String(person.phone ?? ""),
    notes: String(person.notes ?? ""),
    ...normalizeRecordMetadata(person),
  };
}

function normalizeCaravanRegistration(registration: CaravanRegistration): CaravanRegistration {
  const metadata = normalizeRecordMetadata(registration);

  return {
    id: registration.id,
    wardId: registration.wardId,
    caravanId: String(registration.caravanId ?? ""),
    personId: String(registration.personId ?? ""),
    consumesSeat: registration.consumesSeat !== false,
    isApproved: registration.isApproved === true,
    isPaid: registration.isPaid === true,
    ...metadata,
    createdAt: metadata.createdAt ?? UNKNOWN_TIMESTAMP,
  };
}

function normalizeSeatCount(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.trunc(parsed);
}

function normalizeCaravan(caravan: Caravan): Caravan {
  const legacyCaravan = caravan as Caravan & {
    seatMode?: unknown;
    totalSeats?: unknown;
    availableSeats?: unknown;
  };
  const legacyTotalSeats = normalizeSeatCount(legacyCaravan.totalSeats);
  const availableSeats = legacyTotalSeats || normalizeSeatCount(legacyCaravan.availableSeats);

  return {
    id: caravan.id,
    wardId: caravan.wardId,
    destination: String(caravan.destination ?? ""),
    departureDate: normalizeDateInput(caravan.departureDate ?? ""),
    departureTime: String(caravan.departureTime ?? ""),
    returnDate: normalizeDateInput(caravan.returnDate ?? ""),
    returnTime: String(caravan.returnTime ?? ""),
    seatMode: legacyCaravan.seatMode === "vehicle" ? "vehicle" : "quantity",
    availableSeats,
    ...normalizeRecordMetadata(caravan),
  };
}

function normalizeCompanionship(companionship: MissionaryCompanionship): MissionaryCompanionship {
  return normalizeSimpleRecord(companionship);
}

function normalizeHostHouse(hostHouse: HostHouse): HostHouse {
  return normalizeSimpleRecord(hostHouse);
}

function normalizeLunchSchedule(lunchSchedule: LunchSchedule): LunchSchedule {
  return normalizeSimpleRecord(lunchSchedule);
}

function normalizePatrolMember(patrolMember: PatrolMember): PatrolMember {
  return normalizeSimpleRecord(patrolMember);
}

function normalizePatrolSchedule(patrolSchedule: PatrolSchedule): PatrolSchedule {
  return normalizeSimpleRecord(patrolSchedule);
}

function normalizeRole(role: Role): Role {
  return {
    ...role,
    permissions: permissionsFromLegacyRole(role.id, [...role.permissions]),
  };
}

export function normalizeDatabase(db: Database): Database {
  const legacyDb = db as Partial<Database>;
  const roles = (legacyDb.roles ?? []).map((role) => normalizeRole(role));

  return {
    ...createEmptyDatabase(),
    ...legacyDb,
    roles,
    stakes: legacyDb.stakes ?? [],
    wards: legacyDb.wards ?? [],
    users: (legacyDb.users ?? []).map((user) => normalizeUser(user, roles)),
    members: (legacyDb.members ?? []).map((member) => normalizeMember(member)),
    memberNotes: legacyDb.memberNotes ?? [],
    sacramentMinutes: (legacyDb.sacramentMinutes ?? []).map((minute) => normalizeSimpleRecord(minute)),
    minuteVersions: legacyDb.minuteVersions ?? [],
    hymns: legacyDb.hymns ?? [],
    missionaryCompanionships: (legacyDb.missionaryCompanionships ?? []).map((companionship) => normalizeCompanionship(companionship)),
    hostHouses: (legacyDb.hostHouses ?? []).map((hostHouse) => normalizeHostHouse(hostHouse)),
    lunchSchedules: (legacyDb.lunchSchedules ?? []).map((lunchSchedule) => normalizeLunchSchedule(lunchSchedule)),
    caravans: (legacyDb.caravans ?? []).map((caravan) => normalizeCaravan(caravan)),
    caravanPeople: (legacyDb.caravanPeople ?? []).map((person) => normalizeCaravanPerson(person)),
    caravanRegistrations: (legacyDb.caravanRegistrations ?? []).map((registration) => normalizeCaravanRegistration(registration)),
    documentTypes: (legacyDb.documentTypes ?? []).map((documentType) => normalizeDocumentType(documentType)),
    patrolMembers: (legacyDb.patrolMembers ?? []).map((patrolMember) => normalizePatrolMember(patrolMember)),
    patrolSchedules: (legacyDb.patrolSchedules ?? []).map((patrolSchedule) => normalizePatrolSchedule(patrolSchedule)),
    auditLogs: legacyDb.auditLogs ?? [],
    appPreferences: {
      calendarWeekStartsOn:
        legacyDb.appPreferences?.calendarWeekStartsOn === "monday" || legacyDb.appPreferences?.calendarWeekStartsOn === "sunday"
          ? legacyDb.appPreferences.calendarWeekStartsOn
          : "sunday",
      dateFormat:
        legacyDb.appPreferences?.dateFormat === "short" ||
        legacyDb.appPreferences?.dateFormat === "medium" ||
        legacyDb.appPreferences?.dateFormat === "long"
          ? legacyDb.appPreferences.dateFormat
          : "medium",
    },
    session: legacyDb.session ?? {},
  };
}

function normalizeAppPreferences(value: unknown): AppPreferences {
  const preferences = value as Partial<AppPreferences> | null;

  return {
    calendarWeekStartsOn:
      preferences?.calendarWeekStartsOn === "monday" || preferences?.calendarWeekStartsOn === "sunday"
        ? preferences.calendarWeekStartsOn
        : DEFAULT_APP_PREFERENCES.calendarWeekStartsOn,
    dateFormat:
      preferences?.dateFormat === "short" || preferences?.dateFormat === "medium" || preferences?.dateFormat === "long"
        ? preferences.dateFormat
        : DEFAULT_APP_PREFERENCES.dateFormat,
  };
}

function loadLocalAppPreferences(): AppPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_APP_PREFERENCES;
  }

  const raw = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_APP_PREFERENCES;
  }

  try {
    return normalizeAppPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
}

function saveLocalAppPreferences(preferences: AppPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeAppPreferences(preferences)));
}

function withLocalPreferences(db: Database): Database {
  return {
    ...db,
    appPreferences: loadLocalAppPreferences(),
  };
}

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function relationColumns(key: RemoteCollectionKey, record: { id: string } & Record<string, unknown>): RemoteColumns {
  switch (key) {
    case "stakes":
      return { name: asOptionalString(record.name) };
    case "wards":
      return {
        stake_id: optionalId(record.stakeId),
        name: asOptionalString(record.name),
        city: asOptionalString(record.city),
        state: asOptionalString(record.state),
        meeting_time: asOptionalString(record.meetingTime),
        bishopric: Array.isArray(record.bishopric) ? record.bishopric : [],
        summary: asOptionalString(record.summary),
      };
    case "roles":
      return {
        name: asOptionalString(record.name),
        description: asOptionalString(record.description),
        permissions: Array.isArray(record.permissions) ? record.permissions : [],
      };
    case "users":
      return {
        auth_user_id: optionalId(record.authUserId),
        ward_id: optionalId(record.wardId),
        member_id: optionalId(record.memberId),
        role_id: optionalId(record.roleId),
        name: asOptionalString(record.name),
        email: asOptionalString(record.email),
        phone: asOptionalString(record.phone),
        status: record.status === "inactive" ? "inactive" : "active",
        permission_overrides: Array.isArray(record.permissionOverrides) ? record.permissionOverrides : [],
        permissions_configured: record.permissionsConfigured !== false,
        last_access_at: optionalId(record.lastAccessAt),
        created_by_user_id: optionalId(record.createdByUserId),
        updated_by_user_id: optionalId(record.updatedByUserId),
        archived_at: optionalId(record.archivedAt),
        archived_by_user_id: optionalId(record.archivedByUserId),
        created_at: optionalId(record.createdAt),
        updated_at: optionalId(record.updatedAt),
      };
    case "members":
      return { ward_id: optionalId(record.wardId) };
    case "memberNotes":
      return { member_id: optionalId(record.memberId) };
    case "sacramentMinutes":
      return {
        ward_id: optionalId(record.wardId),
        responsible_user_id: optionalId(record.responsibleUserId),
      };
    case "minuteVersions":
      return { minute_id: optionalId(record.minuteId) };
    case "hymns":
      return {
        number: optionalId(record.number),
        title: optionalId(record.title),
        active: typeof record.active === "boolean" ? record.active : true,
      };
    case "missionaryCompanionships":
      return { ward_id: optionalId(record.wardId) };
    case "hostHouses":
      return {
        ward_id: optionalId(record.wardId),
        host_member_id: optionalId(record.hostMemberId),
      };
    case "lunchSchedules":
      return {
        ward_id: optionalId(record.wardId),
        host_member_id: optionalId(record.hostMemberId),
      };
    case "caravans":
      return { ward_id: optionalId(record.wardId) };
    case "caravanPeople":
      return {
        ward_id: optionalId(record.wardId),
        home_ward_id: optionalId(record.homeWardId),
        document_type_id: optionalId(record.documentTypeId),
      };
    case "caravanRegistrations":
      return {
        ward_id: optionalId(record.wardId),
        caravan_id: optionalId(record.caravanId),
        person_id: optionalId(record.personId),
      };
    case "patrolMembers":
      return {
        ward_id: optionalId(record.wardId),
        member_id: optionalId(record.memberId),
      };
    case "patrolSchedules":
      return {
        ward_id: optionalId(record.wardId),
        primary_patrol_member_id: optionalId(record.primaryPatrolMemberId),
        secondary_patrol_member_id: optionalId(record.secondaryPatrolMemberId),
        original_primary_patrol_member_id: optionalId(record.originalPrimaryPatrolMemberId),
      };
    case "auditLogs":
      return {
        ward_id: optionalId(record.wardId),
        actor_user_id: optionalId(record.actorUserId),
      };
    default:
      return {};
  }
}

function remoteSelectColumns(key: RemoteCollectionKey) {
  switch (key) {
    case "stakes":
      return "id,name,created_at,updated_at";
    case "wards":
      return "id,stake_id,name,city,state,meeting_time,bishopric,summary,created_at,updated_at";
    case "roles":
      return "id,name,description,permissions,created_at,updated_at";
    case "users":
      return [
        "id",
        "auth_user_id",
        "ward_id",
        "member_id",
        "role_id",
        "name",
        "email",
        "phone",
        "status",
        "permission_overrides",
        "permissions_configured",
        "last_access_at",
        "created_by_user_id",
        "updated_by_user_id",
        "archived_at",
        "archived_by_user_id",
        "created_at",
        "updated_at",
      ].join(",");
    case "hymns":
      return "id,data,number,title,active";
    default:
      return "id,data";
  }
}

function usesStructuredColumns(key: RemoteCollectionKey) {
  return key === "stakes" || key === "wards" || key === "roles" || key === "users";
}

function remoteRowToRecord(key: RemoteCollectionKey, row: RemoteRecord) {
  switch (key) {
    case "stakes":
      return {
        id: row.id,
        name: rowString(row, "name", "name"),
      };
    case "wards":
      return {
        id: row.id,
        stakeId: rowString(row, "stake_id", "stakeId"),
        name: rowString(row, "name", "name"),
        city: rowString(row, "city", "city"),
        state: rowString(row, "state", "state"),
        meetingTime: rowString(row, "meeting_time", "meetingTime"),
        bishopric: rowStringArray(row, "bishopric", "bishopric"),
        summary: rowString(row, "summary", "summary"),
      };
    case "roles":
      return {
        id: row.id,
        name: rowString(row, "name", "name"),
        description: rowString(row, "description", "description"),
        permissions: rowStringArray(row, "permissions", "permissions"),
      };
    case "users": {
      const data = asDataObject(row);

      return {
        id: row.id,
        authUserId: rowOptionalString(row, "auth_user_id", "authUserId"),
        wardId: rowString(row, "ward_id", "wardId"),
        memberId: rowOptionalString(row, "member_id", "memberId"),
        roleId: rowString(row, "role_id", "roleId"),
        name: rowString(row, "name", "name"),
        email: rowString(row, "email", "email"),
        phone: rowString(row, "phone", "phone"),
        status: rowString(row, "status", "status", "active") === "inactive" ? "inactive" : "active",
        permissionOverrides: rowStringArray(row, "permission_overrides", "permissionOverrides"),
        permissionsConfigured: rowBoolean(row, "permissions_configured", "permissionsConfigured", true),
        createdAt: asString(row.created_at) ?? asString(data.createdAt) ?? UNKNOWN_TIMESTAMP,
        createdByUserId: rowOptionalString(row, "created_by_user_id", "createdByUserId"),
        updatedAt: asString(row.updated_at) ?? asString(data.updatedAt) ?? UNKNOWN_TIMESTAMP,
        updatedByUserId: rowOptionalString(row, "updated_by_user_id", "updatedByUserId"),
        archivedAt: rowOptionalString(row, "archived_at", "archivedAt"),
        archivedByUserId: rowOptionalString(row, "archived_by_user_id", "archivedByUserId"),
        lastAccessAt: rowOptionalString(row, "last_access_at", "lastAccessAt"),
      };
    }
    case "hymns":
      if (!row.data || !Object.keys(row.data).length) {
        return {
          id: row.id,
          number: row.number ?? "",
          title: row.title ?? "",
        };
      }

      return row.data;
    default:
      return row.data;
  }
}

export async function loadDatabase(): Promise<Database> {
  if (typeof window === "undefined") {
    return createEmptyDatabase();
  }

  const supabase = createClient();
  const entries = await Promise.all(
    REMOTE_TABLES.map(async ({ key, table }) => {
      const { data, error } = await supabase.from(table).select(remoteSelectColumns(key));

      if (error) {
        throw error;
      }

      return [
        key,
        ((data ?? []) as unknown as RemoteRecord[]).map((row) => remoteRowToRecord(key, row)),
      ] as const;
    }),
  );

  const remoteDb = {
    ...createEmptyDatabase(),
    ...Object.fromEntries(entries),
  } as Database;

  return withLocalPreferences(normalizeDatabase(remoteDb));
}

export async function saveDatabase(db: Database): Promise<void> {
  saveLocalAppPreferences(db.appPreferences);

  if (typeof window === "undefined") {
    return;
  }

  const supabase = createClient();
  const remoteDb = normalizeDatabase(db);
  const existingIdsByTable = new Map<RemoteCollectionKey, Set<string>>();

  for (const { key, table } of REMOTE_TABLES) {
    const { data: existingRows, error: selectError } = await supabase.from(table).select("id");

    if (selectError) {
      throw selectError;
    }

    existingIdsByTable.set(key, new Set(((existingRows ?? []) as Array<{ id: string }>).map((row) => row.id)));
  }

  for (const { key, table } of [...REMOTE_TABLES].reverse()) {
    const records = remoteDb[key] as Array<{ id: string }>;
    const nextIds = new Set(records.map((record) => record.id));
    const staleIds = [...(existingIdsByTable.get(key) ?? new Set<string>())].filter((id) => !nextIds.has(id));

    if (staleIds.length) {
      const { error: deleteError } = await supabase.from(table).delete().in("id", staleIds);

      if (deleteError) {
        throw deleteError;
      }
    }
  }

  for (const { key, table } of REMOTE_TABLES) {
    const records = remoteDb[key] as Array<{ id: string }>;

    if (!records.length) {
      continue;
    }

    const { error: upsertError } = await supabase.from(table).upsert(
      records.map((record) => ({
        id: record.id,
        ...(usesStructuredColumns(key) ? {} : { data: record }),
        ...relationColumns(key, record),
      })),
      { onConflict: "id" },
    );

    if (upsertError) {
      throw upsertError;
    }
  }
}

export function resetDatabase() {
  return withLocalPreferences(createEmptyDatabase());
}

export function createEmptyDatabase(): Database {
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
    appPreferences: DEFAULT_APP_PREFERENCES,
    session: {},
  };
}

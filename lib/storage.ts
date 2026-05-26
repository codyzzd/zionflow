import { createClient } from "@/lib/supabase/client";
import { createEmptyMinuteForm, createSeedDatabase } from "@/lib/demo-data";
import { normalizePermissionSet, normalizeUserAccessLevel, permissionsFromLegacyRole } from "@/lib/access-control";
import { DEFAULT_HYMN_BOOK_IDS, SYSTEM_ROLE_IDS } from "@/lib/system-ids";
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
  HybridField,
  Hymn,
  HymnBook,
  LunchSchedule,
  PatrolMember,
  PatrolSchedule,
  RecordMetadata,
  Role,
  SacramentMinute,
  Stake,
  StakeOwnerRequest,
  StakeOwnerRequestApproval,
  StakeOwnerRequestStatus,
  User,
  Ward,
} from "@/types/domain";

const APP_PREFERENCES_STORAGE_KEY = "superala-preferences-v1";
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
  { key: "stakeOwnerRequests", table: "stake_owner_requests" },
  { key: "members", table: "members" },
  { key: "memberNotes", table: "member_notes" },
  { key: "sacramentMinutes", table: "sacrament_minutes" },
  { key: "minuteVersions", table: "minute_versions" },
  { key: "hymnBooks", table: "hymn_books" },
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
  number?: number | string | null;
  title?: string | null;
  active?: boolean | null;
  category?: string | null;
  name?: string | null;
  emoji?: string | null;
  hymn_book_id?: string | null;
  [key: string]: unknown;
};
type RemoteCollectionKey = (typeof REMOTE_TABLES)[number]["key"];
type RemoteColumnValue = boolean | number | string | string[] | unknown[] | Record<string, unknown> | null;
type RemoteColumns = Record<string, RemoteColumnValue>;
type RemoteSchemaOptions = {
  includeWardLunchPDay?: boolean;
  includeUserAccessLevel?: boolean;
};

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

function normalizeStakeOwnerRequestStatus(value: unknown): StakeOwnerRequestStatus {
  return value === "approved" || value === "cancelled" || value === "invalidated" ? value : "pending";
}

function normalizeStakeOwnerRequestApprovals(value: unknown): StakeOwnerRequestApproval[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];

    const approval = item as Partial<Record<keyof StakeOwnerRequestApproval, unknown>>;
    const userId = asString(approval.userId);
    const wardId = asString(approval.wardId);
    const createdAt = asString(approval.createdAt);

    return userId && wardId && createdAt ? [{ userId, wardId, createdAt }] : [];
  });
}

function normalizeWeekday(value: unknown) {
  return value === "sunday" ||
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday"
    ? value
    : "monday";
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
  const createdByUserId = asString(record.createdByUserId) ?? asString(record.createdBy);
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
  const legacyUser = user as User & { accessLevel?: unknown };

  return {
    ...normalizedUser,
    accountType: normalizedUser.accountType === "system_super_user" ? "system_super_user" : "regular",
    accessLevel: normalizeUserAccessLevel(legacyUser.accessLevel ?? inferUserAccessLevel(normalizedUser.roleId)),
    roleId: normalizedUser.roleId || SYSTEM_ROLE_IDS.viewer,
    permissionOverrides: permissionsConfigured
      ? normalizePermissionSet(directPermissions)
      : permissionsFromLegacyRole(normalizedUser.roleId, [...rolePermissions, ...directPermissions]),
    permissionsConfigured: true,
  };
}

function inferUserAccessLevel(roleId: string) {
  if (roleId === SYSTEM_ROLE_IDS.stakeAdmin) return "stake_owner";
  if (roleId === SYSTEM_ROLE_IDS.wardAdmin || roleId === "role_admin" || roleId === "role_bishopric") return "ward_owner";

  return "member";
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

function normalizeStake(stake: Stake): Stake {
  return {
    id: stake.id,
    name: String(stake.name ?? ""),
    city: String(stake.city ?? ""),
    state: String(stake.state ?? ""),
    country: String(stake.country ?? "Brasil"),
    ...normalizeRecordMetadata(stake),
  };
}

function normalizeWard(ward: Ward): Ward {
  return {
    id: ward.id,
    stakeId: String(ward.stakeId ?? ""),
    name: String(ward.name ?? ""),
    city: String(ward.city ?? ""),
    state: String(ward.state ?? ""),
    country: String(ward.country ?? "Brasil"),
    lunchPDayWeekday: normalizeWeekday(ward.lunchPDayWeekday),
    ...normalizeRecordMetadata(ward),
  };
}

function normalizeHymn(hymn: Hymn): Hymn {
  return {
    id: hymn.id,
    hymnBookId: String(hymn.hymnBookId ?? DEFAULT_HYMN_BOOK_IDS.new),
    number: normalizeHymnNumber(hymn.number),
    title: String(hymn.title ?? ""),
    category: String(hymn.category ?? ""),
    tags: normalizeHymnTags(hymn.tags),
    active: hymn.active !== false,
    ...normalizeRecordMetadata(hymn),
  };
}

function normalizeHymnNumber(value: unknown) {
  return String(value ?? "")
    .replace(/[^0-9a-z]/gi, "")
    .toLocaleLowerCase("pt-BR");
}

export function normalizeHymnTags(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,;]+/) : [];
  const tags: string[] = [];
  const seen = new Set<string>();

  values
    .map((tag) => String(tag ?? "").trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return;

      seen.add(key);
      tags.push(tag);
    });

  return tags;
}

function normalizeHymnBook(hymnBook: HymnBook): HymnBook {
  return {
    id: hymnBook.id,
    name: String(hymnBook.name ?? ""),
    emoji: String(hymnBook.emoji ?? ""),
    ...normalizeRecordMetadata(hymnBook),
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

function normalizeHybridField(value: unknown, fallbackLinkedId = ""): HybridField {
  const field = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<HybridField>) : {};
  const mode = field.mode === "manual" ? "manual" : "linked";
  const linkedId = typeof field.linkedId === "string" ? field.linkedId : fallbackLinkedId;
  const manualValue = typeof field.manualValue === "string" ? field.manualValue : "";

  return {
    mode,
    linkedId: mode === "linked" ? linkedId : "",
    manualValue: mode === "manual" ? manualValue : "",
  };
}

function normalizeMinuteFormData(value: unknown) {
  const emptyForm = createEmptyMinuteForm();
  const form = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<ReturnType<typeof createEmptyMinuteForm>>) : {};

  return {
    ...emptyForm,
    ...form,
    presiding: normalizeHybridField(form.presiding),
    conducting: normalizeHybridField(form.conducting),
    attendance: typeof form.attendance === "number" && Number.isFinite(form.attendance) ? form.attendance : emptyForm.attendance,
    conductor: normalizeHybridField(form.conductor),
    accompanist: normalizeHybridField(form.accompanist),
    openingHymn: normalizeHybridField(form.openingHymn),
    openingPrayer: normalizeHybridField(form.openingPrayer),
    sacramentHymn: normalizeHybridField(form.sacramentHymn),
    speaker1: normalizeHybridField(form.speaker1),
    speaker1Theme: asOptionalString(form.speaker1Theme),
    speaker2: normalizeHybridField(form.speaker2),
    speaker2Theme: asOptionalString(form.speaker2Theme),
    intermediateHymn: normalizeHybridField(form.intermediateHymn),
    speaker3: normalizeHybridField(form.speaker3),
    speaker3Theme: asOptionalString(form.speaker3Theme),
    closingHymn: normalizeHybridField(form.closingHymn),
    closingPrayer: normalizeHybridField(form.closingPrayer),
  };
}

function normalizeSacramentMinute(minute: SacramentMinute): SacramentMinute {
  const normalizedMinute = normalizeSimpleRecord(minute);

  return {
    ...normalizedMinute,
    form: normalizeMinuteFormData(normalizedMinute.form),
  };
}

function normalizeLunchSchedule(lunchSchedule: LunchSchedule): LunchSchedule {
  const legacyLunchSchedule = lunchSchedule as LunchSchedule & {
    host?: unknown;
    hostMemberId?: unknown;
  };
  const hostMemberId = typeof legacyLunchSchedule.hostMemberId === "string" ? legacyLunchSchedule.hostMemberId : "";
  const host = normalizeHybridField(legacyLunchSchedule.host, hostMemberId);

  return normalizeSimpleRecord({
    ...lunchSchedule,
    host,
    hostMemberId: host.mode === "linked" ? host.linkedId ?? "" : "",
  });
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

function normalizeStakeOwnerRequest(request: StakeOwnerRequest): StakeOwnerRequest {
  return {
    ...request,
    status: normalizeStakeOwnerRequestStatus(request.status),
    approvals: normalizeStakeOwnerRequestApprovals(request.approvals),
  };
}

export function normalizeDatabase(db: Database): Database {
  const legacyDb = db as Partial<Database>;
  const roles = (legacyDb.roles ?? []).map((role) => normalizeRole(role));

  return {
    ...{
      ...createEmptyDatabase(),
      ...legacyDb,
      roles,
      stakes: (legacyDb.stakes ?? []).map((stake) => normalizeStake(stake)),
      wards: (legacyDb.wards ?? []).map((ward) => normalizeWard(ward)),
    },
    users: (legacyDb.users ?? []).map((user) => normalizeUser(user, roles)),
    stakeOwnerRequests: (legacyDb.stakeOwnerRequests ?? []).map((request) => normalizeStakeOwnerRequest(request)),
    members: (legacyDb.members ?? []).map((member) => normalizeMember(member)),
    memberNotes: legacyDb.memberNotes ?? [],
    sacramentMinutes: (legacyDb.sacramentMinutes ?? []).map((minute) => normalizeSacramentMinute(minute)),
    minuteVersions: legacyDb.minuteVersions ?? [],
    hymnBooks: (legacyDb.hymnBooks ?? createEmptyDatabase().hymnBooks).map((hymnBook) => normalizeHymnBook(hymnBook)),
    hymns: (legacyDb.hymns ?? []).map((hymn) => normalizeHymn(hymn)),
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

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function optionalUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
}

function relationColumns(key: RemoteCollectionKey, record: { id: string } & Record<string, unknown>, options: RemoteSchemaOptions = {}): RemoteColumns {
  switch (key) {
    case "stakes":
      return {
        name: asOptionalString(record.name),
        city: asOptionalString(record.city),
        state: asOptionalString(record.state),
        country: asOptionalString(record.country),
        created_at: optionalText(record.createdAt),
        updated_at: optionalText(record.updatedAt),
      };
    case "wards":
      return {
        stake_id: optionalUuid(record.stakeId),
        name: asOptionalString(record.name),
        city: asOptionalString(record.city),
        state: asOptionalString(record.state),
        country: asOptionalString(record.country),
        ...(options.includeWardLunchPDay === false ? {} : { lunch_p_day_weekday: normalizeWeekday(record.lunchPDayWeekday) }),
        created_at: optionalText(record.createdAt),
        updated_at: optionalText(record.updatedAt),
      };
    case "roles":
      return {
        name: asOptionalString(record.name),
        description: asOptionalString(record.description),
        permissions: Array.isArray(record.permissions) ? record.permissions : [],
      };
    case "users":
      return {
        auth_user_id: optionalUuid(record.authUserId),
        ward_id: optionalUuid(record.wardId),
        member_id: optionalUuid(record.memberId),
        role_id: optionalUuid(record.roleId),
        name: asOptionalString(record.name),
        email: asOptionalString(record.email),
        phone: asOptionalString(record.phone),
        status: record.status === "inactive" ? "inactive" : "active",
        account_type: record.accountType === "system_super_user" ? "system_super_user" : "regular",
        ...(options.includeUserAccessLevel === false ? {} : { access_level: normalizeUserAccessLevel(record.accessLevel) }),
        permission_overrides: Array.isArray(record.permissionOverrides) ? record.permissionOverrides : [],
        permissions_configured: record.permissionsConfigured !== false,
        last_access_at: optionalText(record.lastAccessAt),
        created_by_user_id: optionalUuid(record.createdByUserId),
        updated_by_user_id: optionalUuid(record.updatedByUserId),
        archived_at: optionalText(record.archivedAt),
        archived_by_user_id: optionalUuid(record.archivedByUserId),
        created_at: optionalText(record.createdAt),
        updated_at: optionalText(record.updatedAt),
      };
    case "stakeOwnerRequests":
      return {
        stake_id: optionalUuid(record.stakeId),
        ward_id: optionalUuid(record.wardId),
        requester_user_id: optionalUuid(record.requesterUserId),
        status: normalizeStakeOwnerRequestStatus(record.status),
        approvals: normalizeStakeOwnerRequestApprovals(record.approvals),
        approved_at: optionalText(record.approvedAt),
        resolved_at: optionalText(record.resolvedAt),
        created_by_user_id: optionalUuid(record.createdByUserId),
        updated_by_user_id: optionalUuid(record.updatedByUserId),
        archived_at: optionalText(record.archivedAt),
        archived_by_user_id: optionalUuid(record.archivedByUserId),
        created_at: optionalText(record.createdAt),
        updated_at: optionalText(record.updatedAt),
      };
    case "members":
      return { ward_id: optionalUuid(record.wardId) };
    case "memberNotes":
      return { member_id: optionalUuid(record.memberId) };
    case "sacramentMinutes":
      return {
        ward_id: optionalUuid(record.wardId),
        responsible_user_id: optionalUuid(record.responsibleUserId),
      };
    case "minuteVersions":
      return { minute_id: optionalUuid(record.minuteId) };
    case "hymnBooks":
      return {
        name: asOptionalString(record.name),
        emoji: asOptionalString(record.emoji),
        created_at: optionalText(record.createdAt),
        updated_at: optionalText(record.updatedAt),
      };
    case "hymns":
      return {
        hymn_book_id: optionalUuid(record.hymnBookId),
        number: normalizeHymnNumber(record.number),
        title: optionalText(record.title),
        category: optionalText(record.category),
        tags: normalizeHymnTags(record.tags),
        active: typeof record.active === "boolean" ? record.active : true,
      };
    case "missionaryCompanionships":
      return { ward_id: optionalUuid(record.wardId) };
    case "hostHouses":
      return {
        ward_id: optionalUuid(record.wardId),
        host_member_id: optionalUuid(record.hostMemberId),
      };
    case "lunchSchedules":
      return {
        ward_id: optionalUuid(record.wardId),
        host_member_id: optionalUuid(
          record.host && typeof record.host === "object" && !Array.isArray(record.host) && (record.host as HybridField).mode === "linked"
            ? (record.host as HybridField).linkedId
            : record.hostMemberId,
        ),
      };
    case "caravans":
      return { ward_id: optionalUuid(record.wardId) };
    case "caravanPeople":
      return {
        ward_id: optionalUuid(record.wardId),
        home_ward_id: optionalUuid(record.homeWardId),
        document_type_id: optionalUuid(record.documentTypeId),
      };
    case "caravanRegistrations":
      return {
        ward_id: optionalUuid(record.wardId),
        caravan_id: optionalUuid(record.caravanId),
        person_id: optionalUuid(record.personId),
      };
    case "patrolMembers":
      return {
        ward_id: optionalUuid(record.wardId),
        member_id: optionalUuid(record.memberId),
      };
    case "patrolSchedules":
      return {
        ward_id: optionalUuid(record.wardId),
        primary_patrol_member_id: optionalUuid(record.primaryPatrolMemberId),
        secondary_patrol_member_id: optionalUuid(record.secondaryPatrolMemberId),
        original_primary_patrol_member_id: optionalUuid(record.originalPrimaryPatrolMemberId),
      };
    case "auditLogs":
      return {
        ward_id: optionalUuid(record.wardId),
        actor_user_id: optionalUuid(record.actorUserId),
      };
    default:
      return {};
  }
}

function remoteSelectColumns(key: RemoteCollectionKey, options: RemoteSchemaOptions = {}) {
  switch (key) {
    case "stakes":
      return "id,name,city,state,country,created_at,updated_at";
    case "wards":
      return [
        "id",
        "stake_id",
        "name",
        "city",
        "state",
        "country",
        ...(options.includeWardLunchPDay === false ? [] : ["lunch_p_day_weekday"]),
        "created_at",
        "updated_at",
      ].join(",");
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
        "account_type",
        ...(options.includeUserAccessLevel === false ? [] : ["access_level"]),
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
    case "stakeOwnerRequests":
      return [
        "id",
        "stake_id",
        "ward_id",
        "requester_user_id",
        "status",
        "approvals",
        "approved_at",
        "resolved_at",
        "created_by_user_id",
        "updated_by_user_id",
        "archived_at",
        "archived_by_user_id",
        "created_at",
        "updated_at",
      ].join(",");
    case "hymnBooks":
      return "id,data,name,emoji,created_at,updated_at";
    case "hymns":
      return "id,data,hymn_book_id,number,title,category,tags,active";
    default:
      return "id,data";
  }
}

function usesStructuredColumns(key: RemoteCollectionKey) {
  return key === "stakes" || key === "wards" || key === "roles" || key === "users" || key === "stakeOwnerRequests" || key === "hymnBooks";
}

function isMissingRemoteColumn(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;

  const remoteError = error as Partial<Record<"code" | "message" | "details" | "hint", unknown>>;
  const message = [remoteError.message, remoteError.details, remoteError.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return message.includes(columnName) && (remoteError.code === "42703" || message.toLocaleLowerCase("pt-BR").includes("column"));
}

function remoteRowToRecord(key: RemoteCollectionKey, row: RemoteRecord) {
  switch (key) {
    case "stakes":
      return {
        id: row.id,
        name: rowString(row, "name", "name"),
        city: rowString(row, "city", "city"),
        state: rowString(row, "state", "state"),
        country: rowString(row, "country", "country", "Brasil"),
        createdAt: asString(row.created_at) ?? UNKNOWN_TIMESTAMP,
        updatedAt: asString(row.updated_at) ?? UNKNOWN_TIMESTAMP,
      };
    case "wards":
      return {
        id: row.id,
        stakeId: rowString(row, "stake_id", "stakeId"),
        name: rowString(row, "name", "name"),
        city: rowString(row, "city", "city"),
        state: rowString(row, "state", "state"),
        country: rowString(row, "country", "country", "Brasil"),
        lunchPDayWeekday: normalizeWeekday(rowString(row, "lunch_p_day_weekday", "lunchPDayWeekday", "monday")),
        createdAt: asString(row.created_at) ?? UNKNOWN_TIMESTAMP,
        updatedAt: asString(row.updated_at) ?? UNKNOWN_TIMESTAMP,
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
        accountType: rowString(row, "account_type", "accountType", "regular") === "system_super_user" ? "system_super_user" : "regular",
        accessLevel: normalizeUserAccessLevel(rowString(row, "access_level", "accessLevel", "member")),
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
    case "stakeOwnerRequests": {
      const data = asDataObject(row);

      return {
        id: row.id,
        stakeId: rowString(row, "stake_id", "stakeId"),
        wardId: rowString(row, "ward_id", "wardId"),
        requesterUserId: rowString(row, "requester_user_id", "requesterUserId"),
        status: normalizeStakeOwnerRequestStatus(rowString(row, "status", "status", "pending")),
        approvals: normalizeStakeOwnerRequestApprovals(row.approvals ?? data.approvals),
        approvedAt: rowOptionalString(row, "approved_at", "approvedAt"),
        resolvedAt: rowOptionalString(row, "resolved_at", "resolvedAt"),
        createdAt: asString(row.created_at) ?? asString(data.createdAt) ?? UNKNOWN_TIMESTAMP,
        createdByUserId: rowOptionalString(row, "created_by_user_id", "createdByUserId"),
        updatedAt: asString(row.updated_at) ?? asString(data.updatedAt) ?? UNKNOWN_TIMESTAMP,
        updatedByUserId: rowOptionalString(row, "updated_by_user_id", "updatedByUserId"),
        archivedAt: rowOptionalString(row, "archived_at", "archivedAt"),
        archivedByUserId: rowOptionalString(row, "archived_by_user_id", "archivedByUserId"),
      };
    }
    case "hymnBooks": {
      const data = asDataObject(row);

      return {
        id: row.id,
        name: rowString(row, "name", "name"),
        emoji: rowString(row, "emoji", "emoji"),
        createdAt: asString(row.created_at) ?? asString(data.createdAt) ?? UNKNOWN_TIMESTAMP,
        updatedAt: asString(row.updated_at) ?? asString(data.updatedAt) ?? UNKNOWN_TIMESTAMP,
      };
    }
    case "hymns":
      return {
        ...asDataObject(row),
        id: row.id,
        hymnBookId: rowOptionalString(row, "hymn_book_id", "hymnBookId") ?? DEFAULT_HYMN_BOOK_IDS.new,
        number: normalizeHymnNumber(row.number ?? asDataObject(row).number),
        title: rowString(row, "title", "title"),
        category: rowString(row, "category", "category"),
        tags: normalizeHymnTags(row.tags ?? asDataObject(row).tags),
        active: row.active !== false,
      };

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
      let { data, error } = await supabase.from(table).select(remoteSelectColumns(key));

      if (key === "wards" && isMissingRemoteColumn(error, "lunch_p_day_weekday")) {
        const fallback = await supabase.from(table).select(remoteSelectColumns(key, { includeWardLunchPDay: false }));
        data = fallback.data;
        error = fallback.error;
      }

      if (key === "users" && isMissingRemoteColumn(error, "access_level")) {
        const fallback = await supabase.from(table).select(remoteSelectColumns(key, { includeUserAccessLevel: false }));
        data = fallback.data;
        error = fallback.error;
      }

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

    const recordsForUpsert =
      key === "users"
        ? [...records].sort((a, b) => {
            const userA = a as User;
            const userB = b as User;
            const ownerA = userA.accessLevel === "ward_owner" || userA.accessLevel === "stake_owner";
            const ownerB = userB.accessLevel === "ward_owner" || userB.accessLevel === "stake_owner";

            return Number(ownerA) - Number(ownerB);
          })
        : records;

    const buildUpsertPayload = (options?: RemoteSchemaOptions) =>
      recordsForUpsert.map((record) => ({
        id: record.id,
        ...(usesStructuredColumns(key) ? {} : { data: record }),
        ...relationColumns(key, record, options),
      }));

    let { error: upsertError } = await supabase.from(table).upsert(buildUpsertPayload(), { onConflict: "id" });

    if (key === "wards" && isMissingRemoteColumn(upsertError, "lunch_p_day_weekday")) {
      const fallback = await supabase.from(table).upsert(buildUpsertPayload({ includeWardLunchPDay: false }), { onConflict: "id" });
      upsertError = fallback.error;
    }

    if (key === "users" && isMissingRemoteColumn(upsertError, "access_level")) {
      const fallback = await supabase.from(table).upsert(buildUpsertPayload({ includeUserAccessLevel: false }), { onConflict: "id" });
      upsertError = fallback.error;
    }

    if (upsertError) {
      throw upsertError;
    }
  }
}

export function createEmptyDatabase(): Database {
  return createSeedDatabase();
}

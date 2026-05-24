"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { normalizePermissionSet } from "@/lib/access-control";
import { findBlockingCaravanForPersonArchive } from "@/lib/caravan-rules";
import { createEmptyMinuteForm } from "@/lib/demo-data";
import { createEmptyDatabase, loadDatabase, resetDatabase, saveDatabase } from "@/lib/storage";
import { SYSTEM_ROLE_IDS } from "@/lib/system-ids";
import { normalizeDateInput, nowIso, slugify, todayDate, uid } from "@/lib/utils";
import type {
  AuditLog,
  AppPreferences,
  CalendarWeekStartsOn,
  Caravan,
  CaravanPerson,
  CaravanRegistration,
  DateFormat,
  Database,
  DocumentType,
  HostHouse,
  HybridField,
  Hymn,
  LunchSchedule,
  Member,
  MemberNote,
  MinuteFormData,
  MissionaryCompanionship,
  PatrolMember,
  PatrolSchedule,
  PermissionKey,
  RecordMetadata,
  Role,
  SacramentMinute,
  SessionState,
  Stake,
  User,
  Ward,
} from "@/types/domain";

type SaveMinuteInput = Omit<SacramentMinute, "id" | "createdAt" | "updatedAt" | "versionIds"> & {
  id?: string;
};

type ImportMembersInput = {
  wardId: string;
  members: Array<Omit<Member, "id" | "wardId">>;
  removeMissing: boolean;
};

type CreateStakeOnboardingInput = {
  authUserId?: string;
  stakeName: string;
  city?: string;
  state?: string;
  country?: string;
  referenceWardName?: string;
};

type CreateWardOnboardingInput = {
  authUserId?: string;
  stakeId?: string;
  wardName: string;
  city?: string;
  state?: string;
  country?: string;
  stakeName?: string;
};

type SaveCaravanRegistrationInput = Omit<CaravanRegistration, "id" | "createdAt"> & {
  id?: string;
};

type SaveStakeInput = Omit<Stake, "id"> & {
  id?: string;
  wardIds?: string[];
};

type ResolveAuthenticatedUserInput = {
  authUserId?: string;
  email: string;
  auditLogin?: boolean;
};

type AuthenticatedUserResolution =
  | { status: "found"; route: "/dashboard" | "/onboarding"; user: User }
  | { status: "inactive"; route: "/login"; user: User }
  | { status: "missing"; route: "/onboarding" };

type AppContextValue = {
  db: Database;
  ready: boolean;
  wards: Ward[];
  roles: Role[];
  currentUser?: User;
  currentWard?: Ward;
  currentUserPermissions: PermissionKey[];
  usersByWard: User[];
  membersByWard: Member[];
  memberNotesByWard: MemberNote[];
  minutesByWard: SacramentMinute[];
  companionshipsByWard: MissionaryCompanionship[];
  hostHousesByWard: HostHouse[];
  lunchSchedulesByWard: LunchSchedule[];
  caravansByWard: Caravan[];
  caravanPeopleByWard: CaravanPerson[];
  caravanRegistrationsByWard: CaravanRegistration[];
  activeDocumentTypes: DocumentType[];
  patrolMembersByWard: PatrolMember[];
  patrolSchedulesByWard: PatrolSchedule[];
  auditLogsByWard: AuditLog[];
  appPreferences: AppPreferences;
  loginAs: (userId: string) => void;
  resolveAuthenticatedUser: (input: ResolveAuthenticatedUserInput) => AuthenticatedUserResolution;
  completeStakeOnboarding: (email: string, input: CreateStakeOnboardingInput) => boolean;
  completeWardOnboarding: (email: string, input: CreateWardOnboardingInput) => boolean;
  joinExistingWard: (email: string, wardId: string, authUserId?: string) => boolean;
  logout: () => void;
  switchWard: (wardId: string) => void;
  resetDemoData: () => void;
  changeCurrentUserRole: (roleId: string) => void;
  hasPermission: (permission: PermissionKey) => boolean;
  saveStake: (input: SaveStakeInput) => void;
  archiveStake: (stakeId: string) => void;
  unarchiveStake: (stakeId: string) => void;
  deleteStake: (stakeId: string) => void;
  saveWard: (input: Ward) => void;
  saveSystemWard: (input: Omit<Ward, "id"> & { id?: string }) => void;
  archiveWard: (wardId: string) => void;
  unarchiveWard: (wardId: string) => void;
  deleteWard: (wardId: string) => void;
  saveMember: (input: Omit<Member, "id"> & { id?: string }) => void;
  deleteMembers: (memberIds: string[]) => void;
  importMembers: (input: ImportMembersInput) => void;
  addMemberNote: (memberId: string, text: string) => void;
  saveUser: (input: Omit<User, "id" | "createdAt" | "lastAccessAt"> & { id?: string }) => void;
  toggleUserStatus: (userId: string) => void;
  saveMinute: (input: SaveMinuteInput) => string;
  saveHymn: (input: Omit<Hymn, "id"> & { id?: string }) => void;
  deleteHymn: (hymnId: string) => void;
  saveCompanionship: (input: Omit<MissionaryCompanionship, "id"> & { id?: string }) => void;
  saveHostHouse: (input: Omit<HostHouse, "id"> & { id?: string }) => void;
  saveLunchSchedule: (input: Omit<LunchSchedule, "id"> & { id?: string }) => void;
  deleteLunchSchedule: (lunchId: string) => void;
  saveCaravan: (input: Omit<Caravan, "id"> & { id?: string }) => void;
  archiveCaravan: (caravanId: string) => void;
  unarchiveCaravan: (caravanId: string) => void;
  saveCaravanPerson: (input: Omit<CaravanPerson, "id"> & { id?: string }) => void;
  archiveCaravanPerson: (personId: string) => void;
  unarchiveCaravanPerson: (personId: string) => void;
  saveCaravanRegistration: (input: SaveCaravanRegistrationInput) => void;
  deleteCaravanRegistration: (registrationId: string) => void;
  savePatrolMember: (input: Omit<PatrolMember, "id"> & { id?: string }) => void;
  savePatrolSchedule: (input: Omit<PatrolSchedule, "id"> & { id?: string }) => void;
  updateCalendarWeekStartsOn: (value: CalendarWeekStartsOn) => void;
  updateDateFormat: (value: DateFormat) => void;
};

const AppContext = createContext<AppContextValue | null>(null);
const REMOTE_SAVE_DELAY_MS = 500;
const FULL_ADMIN_PERMISSIONS: PermissionKey[] = [
  "dashboard.view",
  "ward.view",
  "ward.manage",
  "stake.view",
  "stake.manage",
  "users.view",
  "users.manage",
  "roles.manage",
  "members.view",
  "members.manage",
  "minutes.view",
  "minutes.manage",
  "frequency.view",
  "frequency.manage",
  "missionary.view",
  "missionary.manage",
  "lunch.view",
  "lunch.manage",
  "caravan.view",
  "caravan.manage",
  "caravan.register.view",
  "caravan.register.manage",
  "caravan.approve.view",
  "caravan.approve.manage",
  "caravan.manage.view",
  "caravan.manage.manage",
  "patrol.view",
  "patrol.manage",
  "reports.view",
  "exports.run",
  "audit.view",
];
const VIEWER_PERMISSIONS: PermissionKey[] = ["dashboard.view", "ward.view", "stake.view", "missionary.view", "lunch.view", "patrol.view"];

let hydrationReady = false;

function subscribeToHydration(onStoreChange: () => void) {
  if (hydrationReady) {
    return () => {};
  }

  const timeoutId = window.setTimeout(() => {
    hydrationReady = true;
    onStoreChange();
  }, 0);

  return () => window.clearTimeout(timeoutId);
}

function getHydrationSnapshot() {
  return hydrationReady;
}

function resolvePermissions(db: Database, user?: User) {
  if (!user) return [];
  return normalizePermissionSet(user.permissionOverrides);
}

function getActorUserId(db: Database) {
  return db.session.currentUserId;
}

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("pt-BR");
}

function findAuthenticatedUser(users: User[], authUserId: string | undefined, email: string) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedAuthUserId = authUserId?.trim();

  return users.find(
    (user) =>
      Boolean(normalizedAuthUserId && user.authUserId === normalizedAuthUserId) ||
      Boolean(normalizedEmail && normalizeEmail(user.email) === normalizedEmail),
  );
}

function normalizeOrganizationName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ala|estaca|da|de|do|das|dos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatNameFromEmail(email: string) {
  const name = email
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();

  if (!name) return "Novo usuário";

  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1))
    .join(" ");
}

function createOnboardingRole(kind: "stake-admin" | "ward-admin" | "viewer"): Role {
  if (kind === "stake-admin") {
    return {
      id: SYSTEM_ROLE_IDS.stakeAdmin,
      name: "Administrador da estaca",
      description: "Administra a estaca e os cadastros do sistema.",
      permissions: normalizePermissionSet(FULL_ADMIN_PERMISSIONS),
    };
  }

  if (kind === "ward-admin") {
    return {
      id: SYSTEM_ROLE_IDS.wardAdmin,
      name: "Administrador da ala",
      description: "Administra a ala e seus cadastros.",
      permissions: normalizePermissionSet(FULL_ADMIN_PERMISSIONS),
    };
  }

  return {
    id: SYSTEM_ROLE_IDS.viewer,
    name: "Consultivo",
    description: "Consulta areas liberadas sem editar.",
    permissions: normalizePermissionSet(VIEWER_PERMISSIONS),
  };
}

function upsertRole(roles: Role[], role: Role) {
  if (roles.some((item) => item.id === role.id)) {
    return roles.map((item) => (item.id === role.id ? { ...item, permissions: normalizePermissionSet(item.permissions) } : item));
  }

  return [role, ...roles];
}

function buildOnboardingUser(email: string, wardId: string, role: Role, timestamp: string, authUserId?: string): User {
  const id = uid("user");

  return {
    id,
    authUserId,
    wardId,
    name: formatNameFromEmail(email),
    email,
    phone: "",
    status: "active",
    roleId: role.id,
    permissionOverrides: normalizePermissionSet(role.permissions),
    permissionsConfigured: true,
    createdAt: timestamp,
    createdByUserId: id,
    updatedAt: timestamp,
    updatedByUserId: id,
    lastAccessAt: timestamp,
  };
}

function withRecordMetadata<T extends RecordMetadata>(record: T, existing: RecordMetadata | undefined, actorUserId?: string, timestamp = nowIso()): T {
  return {
    ...record,
    createdAt: existing?.createdAt ?? record.createdAt ?? timestamp,
    createdByUserId: existing?.createdByUserId ?? record.createdByUserId ?? actorUserId,
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
    archivedAt: record.archivedAt ?? existing?.archivedAt,
    archivedByUserId: record.archivedAt ? record.archivedByUserId ?? existing?.archivedByUserId : existing?.archivedByUserId,
  };
}

function withArchiveMetadata<T extends RecordMetadata>(record: T, archived: boolean, actorUserId?: string): T {
  const timestamp = nowIso();
  const updated = withRecordMetadata(record, record, actorUserId, timestamp);

  return {
    ...updated,
    archivedAt: archived ? timestamp : undefined,
    archivedByUserId: archived ? actorUserId : undefined,
  };
}

function withAuditLog(db: Database, actorUserId: string | undefined, entry: Omit<AuditLog, "id" | "actorUserId" | "createdAt">) {
  if (!actorUserId) {
    return db;
  }

  return {
    ...db,
    auditLogs: [
      {
        id: uid("log"),
        actorUserId,
        createdAt: nowIso(),
        ...entry,
      },
      ...db.auditLogs,
    ],
  };
}

function clearDeletedMemberReferences(db: Database, memberIds: Set<string>, actorUserId?: string) {
  if (!memberIds.size) return db;

  const clearHybridField = (field: HybridField): HybridField =>
    field.mode === "linked" && field.linkedId && memberIds.has(field.linkedId) ? { ...field, linkedId: "" } : field;

  const clearMinuteForm = (form: MinuteFormData): MinuteFormData => ({
    ...form,
    presiding: clearHybridField(form.presiding),
    conducting: clearHybridField(form.conducting),
    conductor: clearHybridField(form.conductor),
    accompanist: clearHybridField(form.accompanist),
    openingHymn: clearHybridField(form.openingHymn),
    openingPrayer: clearHybridField(form.openingPrayer),
    sacramentHymn: clearHybridField(form.sacramentHymn),
    speaker1: clearHybridField(form.speaker1),
    speaker2: clearHybridField(form.speaker2),
    intermediateHymn: clearHybridField(form.intermediateHymn),
    speaker3: clearHybridField(form.speaker3),
    closingHymn: clearHybridField(form.closingHymn),
    closingPrayer: clearHybridField(form.closingPrayer),
  });

  return {
    ...db,
    memberNotes: db.memberNotes.filter((note) => !memberIds.has(note.memberId)),
    users: db.users.map((user) =>
      user.memberId && memberIds.has(user.memberId) ? withRecordMetadata({ ...user, memberId: undefined }, user, actorUserId) : user,
    ),
    hostHouses: db.hostHouses.map((house) =>
      house.hostMemberId && memberIds.has(house.hostMemberId) ? withRecordMetadata({ ...house, hostMemberId: undefined }, house, actorUserId) : house,
    ),
    lunchSchedules: db.lunchSchedules.map((lunch) =>
      memberIds.has(lunch.hostMemberId) ? withRecordMetadata({ ...lunch, hostMemberId: "" }, lunch, actorUserId) : lunch,
    ),
    patrolMembers: db.patrolMembers.map((member) =>
      member.memberId && memberIds.has(member.memberId) ? withRecordMetadata({ ...member, memberId: undefined }, member, actorUserId) : member,
    ),
    sacramentMinutes: db.sacramentMinutes.map((minute) =>
      withRecordMetadata(
        {
          ...minute,
          form: clearMinuteForm(minute.form),
        },
        minute,
        actorUserId,
      ),
    ),
  };
}

function clearDeletedHymnReferences(db: Database, hymnIds: Set<string>, actorUserId?: string) {
  if (!hymnIds.size) return db;

  const clearHybridField = (field: HybridField): HybridField =>
    field.mode === "linked" && field.linkedId && hymnIds.has(field.linkedId) ? { ...field, linkedId: "" } : field;

  const clearMinuteForm = (form: MinuteFormData): MinuteFormData => ({
    ...form,
    openingHymn: clearHybridField(form.openingHymn),
    sacramentHymn: clearHybridField(form.sacramentHymn),
    intermediateHymn: clearHybridField(form.intermediateHymn),
    closingHymn: clearHybridField(form.closingHymn),
  });

  return {
    ...db,
    sacramentMinutes: db.sacramentMinutes.map((minute) =>
      withRecordMetadata(
        {
          ...minute,
          form: clearMinuteForm(minute.form),
        },
        minute,
        actorUserId,
      ),
    ),
  };
}

function AppProviderContent({ children, initialDb, ready }: { children: ReactNode; initialDb: Database; ready: boolean }) {
  const [db, setDb] = useState<Database>(initialDb);
  const [remoteReady, setRemoteReady] = useState(false);
  const saveErrorShownRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    loadDatabase()
      .then((remoteDb) => {
        if (cancelled) return;
        setDb(remoteDb);
        setRemoteReady(true);
      })
      .catch((error) => {
        console.error("Failed to load Supabase data.", error);
        if (!cancelled) {
          setRemoteReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready || !remoteReady || !db.session.currentUserId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      saveDatabase(db).catch((error) => {
        console.error("Failed to save Supabase data.", error);

        if (db.session.currentUserId && !saveErrorShownRef.current) {
          toast.error("Nao foi possivel salvar os dados no Supabase.");
          saveErrorShownRef.current = true;
        }
      });
    }, REMOTE_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [db, ready, remoteReady]);

  const appReady = ready && remoteReady;

  const currentUser = db.users.find((user) => user.id === db.session.currentUserId);
  const currentWardId = db.session.currentWardId ?? currentUser?.wardId;
  const currentWard = db.wards.find((ward) => ward.id === currentWardId);
  const currentUserPermissions = resolvePermissions(db, currentUser);

  const value = useMemo<AppContextValue>(() => {
    const usersByWard = db.users.filter((user) => user.wardId === currentWardId && !user.archivedAt);
    const membersByWard = db.members.filter((member) => member.wardId === currentWardId && !member.archivedAt);
    const memberIds = new Set(membersByWard.map((member) => member.id));
    const memberNotesByWard = db.memberNotes.filter((note) => memberIds.has(note.memberId));
    const minutesByWard = db.sacramentMinutes.filter((minute) => minute.wardId === currentWardId && !minute.archivedAt);
    const companionshipsByWard = db.missionaryCompanionships.filter((companionship) => companionship.wardId === currentWardId && !companionship.archivedAt);
    const hostHousesByWard = db.hostHouses.filter((house) => house.wardId === currentWardId && !house.archivedAt);
    const lunchSchedulesByWard = db.lunchSchedules.filter((lunch) => lunch.wardId === currentWardId && !lunch.archivedAt);
    const caravansByWard = db.caravans.filter((caravan) => caravan.wardId === currentWardId);
    const caravanPeopleByWard = db.caravanPeople.filter((person) => person.wardId === currentWardId && !person.archivedAt);
    const caravanRegistrationsByWard = db.caravanRegistrations.filter((registration) => registration.wardId === currentWardId && !registration.archivedAt);
    const activeDocumentTypes = db.documentTypes.filter((documentType) => documentType.active && !documentType.archivedAt);
    const patrolMembersByWard = db.patrolMembers.filter((member) => member.wardId === currentWardId && !member.archivedAt);
    const patrolSchedulesByWard = db.patrolSchedules.filter((schedule) => schedule.wardId === currentWardId && !schedule.archivedAt);
    const auditLogsByWard = db.auditLogs.filter((log) => log.wardId === currentWardId);

    function loginAs(userId: string) {
      setDb((currentDb) => {
        const user = currentDb.users.find((item) => item.id === userId);
        if (!user || user.status !== "active") return currentDb;

        const actorUserId = user.id;
        const nextUsers = currentDb.users.map((item) =>
          item.id === userId ? withRecordMetadata({ ...item, lastAccessAt: nowIso() }, item, actorUserId) : item,
        );

        const updated = {
          ...currentDb,
          users: nextUsers,
          session: {
            currentUserId: user.id,
            currentWardId: user.wardId,
          } satisfies SessionState,
        };

        return withAuditLog(updated, user.id, {
          wardId: user.wardId,
          action: "LOGIN",
          module: "auth",
          itemLabel: user.name,
          summary: "Entrou no sistema com email e senha.",
        });
      });
    }

    function resolveAuthenticatedUser(input: ResolveAuthenticatedUserInput): AuthenticatedUserResolution {
      const normalizedEmail = normalizeEmail(input.email);
      const matchedUser = findAuthenticatedUser(db.users, input.authUserId, normalizedEmail);

      if (!matchedUser) {
        return { status: "missing", route: "/onboarding" };
      }

      if (matchedUser.status === "inactive") {
        return { status: "inactive", route: "/login", user: matchedUser };
      }

      const route = matchedUser.wardId && db.wards.some((ward) => ward.id === matchedUser.wardId) ? "/dashboard" : "/onboarding";

      setDb((currentDb) => {
        const currentMatchedUser = findAuthenticatedUser(currentDb.users, input.authUserId, normalizedEmail);

        if (!currentMatchedUser || currentMatchedUser.status !== "active") {
          return currentDb;
        }

        const timestamp = nowIso();
        const nextAuthUserId = currentMatchedUser.authUserId ?? input.authUserId?.trim();
        const nextUser = withRecordMetadata(
          {
            ...currentMatchedUser,
            authUserId: nextAuthUserId,
            lastAccessAt: timestamp,
          },
          currentMatchedUser,
          currentMatchedUser.id,
          timestamp,
        );
        const nextDb = {
          ...currentDb,
          users: currentDb.users.map((user) => (user.id === currentMatchedUser.id ? nextUser : user)),
          session: {
            currentUserId: nextUser.id,
            currentWardId: nextUser.wardId,
          } satisfies SessionState,
        };

        if (!input.auditLogin) {
          return nextDb;
        }

        return withAuditLog(nextDb, nextUser.id, {
          wardId: nextUser.wardId,
          action: "LOGIN",
          module: "auth",
          itemLabel: nextUser.name,
          summary: "Entrou no sistema com email e senha.",
        });
      });

      return {
        status: "found",
        route,
        user: {
          ...matchedUser,
          authUserId: matchedUser.authUserId ?? input.authUserId?.trim(),
        },
      };
    }

    function completeStakeOnboarding(email: string, input: CreateStakeOnboardingInput) {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = db.users.find((user) => normalizeEmail(user.email) === normalizedEmail);
      const stakeName = input.stakeName.trim();
      const city = input.city?.trim() ?? "";
      const state = input.state?.trim() ?? "";
      const country = input.country?.trim() || "Brasil";
      const referenceWardName = input.referenceWardName?.trim() ?? "";

      if (!normalizedEmail || !stakeName || existingUser?.status === "inactive") {
        return false;
      }

      setDb((currentDb) => {
        const currentExistingUser = currentDb.users.find((user) => normalizeEmail(user.email) === normalizedEmail);

        if (currentExistingUser) {
          if (currentExistingUser.status !== "active") {
            return currentDb;
          }

          if (!currentExistingUser.wardId) {
            const timestamp = nowIso();
            const role = createOnboardingRole("stake-admin");
            const viewerRole = createOnboardingRole("viewer");
            const stake: Stake = withRecordMetadata<Stake>(
              {
                id: uid("stake"),
                name: stakeName,
                city,
                state,
                country,
              },
              undefined,
              currentExistingUser.id,
              timestamp,
            );
            const referenceWard: Ward | undefined = referenceWardName
              ? withRecordMetadata<Ward>(
                  {
                    id: uid("ward"),
                    stakeId: stake.id,
                    name: referenceWardName,
                    city,
                    state,
                    country,
                  },
                  undefined,
                  currentExistingUser.id,
                  timestamp,
                )
              : undefined;
            const updatedUser = withRecordMetadata(
              {
                ...currentExistingUser,
                wardId: referenceWard?.id ?? "",
                roleId: role.id,
                permissionOverrides: normalizePermissionSet(role.permissions),
                permissionsConfigured: true,
                lastAccessAt: timestamp,
              },
              currentExistingUser,
              currentExistingUser.id,
              timestamp,
            );
            const nextDb = {
              ...currentDb,
              stakes: [stake, ...currentDb.stakes],
              wards: referenceWard ? [referenceWard, ...currentDb.wards] : currentDb.wards,
              roles: upsertRole(upsertRole(currentDb.roles, role), viewerRole),
              users: currentDb.users.map((user) => (user.id === currentExistingUser.id ? updatedUser : user)),
              session: {
                currentUserId: updatedUser.id,
                currentWardId: referenceWard?.id,
              } satisfies SessionState,
            };

            const createdStakeDb = withAuditLog(nextDb, updatedUser.id, {
              wardId: "",
              action: "CREATE_STAKE",
              module: "onboarding",
              itemLabel: stake.name,
              summary: "Criou estaca pelo onboarding inicial.",
            });

            return withAuditLog(createdStakeDb, updatedUser.id, {
              wardId: updatedUser.wardId,
              action: "LOGIN",
              module: "auth",
              itemLabel: updatedUser.name,
              summary: "Entrou no sistema com email e senha.",
            });
          }

          const updated = {
            ...currentDb,
            users: currentDb.users.map((user) =>
              user.id === currentExistingUser.id ? withRecordMetadata({ ...user, lastAccessAt: nowIso() }, user, currentExistingUser.id) : user,
            ),
            session: {
              currentUserId: currentExistingUser.id,
              currentWardId: currentExistingUser.wardId,
            } satisfies SessionState,
          };

          return withAuditLog(updated, currentExistingUser.id, {
            wardId: currentExistingUser.wardId,
            action: "LOGIN",
            module: "auth",
            itemLabel: currentExistingUser.name,
            summary: "Entrou no sistema com email e senha.",
          });
        }

        const timestamp = nowIso();
        const role = createOnboardingRole("stake-admin");
        const viewerRole = createOnboardingRole("viewer");
        const stakeId = uid("stake");
        const referenceWardId = referenceWardName ? uid("ward") : undefined;
        const user = buildOnboardingUser(normalizedEmail, referenceWardId ?? "", role, timestamp, input.authUserId);
        const stake: Stake = withRecordMetadata<Stake>(
          {
            id: stakeId,
            name: stakeName,
            city,
            state,
            country,
          },
          undefined,
          user.id,
          timestamp,
        );
        const referenceWard: Ward | undefined = referenceWardName && referenceWardId
          ? withRecordMetadata<Ward>(
              {
                id: referenceWardId,
                stakeId: stake.id,
                name: referenceWardName,
                city,
                state,
                country,
              },
              undefined,
              user.id,
              timestamp,
            )
          : undefined;

        const nextDb = {
          ...currentDb,
          stakes: [stake, ...currentDb.stakes],
          wards: referenceWard ? [referenceWard, ...currentDb.wards] : currentDb.wards,
          roles: upsertRole(upsertRole(currentDb.roles, role), viewerRole),
          users: [user, ...currentDb.users],
          session: {
            currentUserId: user.id,
            currentWardId: referenceWard?.id,
          } satisfies SessionState,
        };

        const createdStakeDb = withAuditLog(nextDb, user.id, {
          wardId: "",
          action: "CREATE_STAKE",
          module: "onboarding",
          itemLabel: stake.name,
          summary: "Criou estaca pelo onboarding inicial.",
        });
        const createdUserDb = withAuditLog(createdStakeDb, user.id, {
          wardId: user.wardId,
          action: "CREATE_USER",
          module: "usuarios",
          itemLabel: user.name,
          summary: "Criou usuário administrador da estaca pelo onboarding.",
        });

        return withAuditLog(createdUserDb, user.id, {
          wardId: user.wardId,
          action: "LOGIN",
          module: "auth",
          itemLabel: user.name,
          summary: "Entrou no sistema com email e senha.",
        });
      });

      return true;
    }

    function completeWardOnboarding(email: string, input: CreateWardOnboardingInput) {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = db.users.find((user) => normalizeEmail(user.email) === normalizedEmail);
      const wardName = input.wardName.trim();
      const city = input.city?.trim() ?? "";
      const country = input.country?.trim() ?? "";
      const stakeName = input.stakeName?.trim() ?? "";
      const inputStakeId = input.stakeId?.trim() ?? "";

      if (!normalizedEmail || !wardName || !city || !country || existingUser?.status === "inactive") {
        return false;
      }

      setDb((currentDb) => {
        const currentExistingUser = currentDb.users.find((user) => normalizeEmail(user.email) === normalizedEmail);

        if (currentExistingUser) {
          if (currentExistingUser.status !== "active") {
            return currentDb;
          }

          if (!currentExistingUser.wardId) {
            const timestamp = nowIso();
            const role = createOnboardingRole("ward-admin");
            const viewerRole = createOnboardingRole("viewer");
            const existingStake =
              currentDb.stakes.find((stake) => stake.id === inputStakeId) ??
              (stakeName ? currentDb.stakes.find((stake) => normalizeOrganizationName(stake.name) === normalizeOrganizationName(stakeName)) : undefined);
            const stake: Stake | undefined =
              stakeName && !existingStake
                ? withRecordMetadata<Stake>(
                    {
                      id: uid("stake"),
                      name: stakeName,
                      city,
                      state: input.state?.trim() ?? "",
                      country,
                    },
                    undefined,
                    currentExistingUser.id,
                    timestamp,
                  )
                : undefined;
            const ward: Ward = withRecordMetadata<Ward>(
              {
                id: uid("ward"),
                stakeId: existingStake?.id ?? stake?.id ?? "",
                name: wardName,
                city,
                state: input.state?.trim() ?? "",
                country,
              },
              undefined,
              currentExistingUser.id,
              timestamp,
            );
            const updatedUser = withRecordMetadata(
              {
                ...currentExistingUser,
                wardId: ward.id,
                roleId: role.id,
                permissionOverrides: normalizePermissionSet(role.permissions),
                permissionsConfigured: true,
                lastAccessAt: timestamp,
              },
              currentExistingUser,
              currentExistingUser.id,
              timestamp,
            );
            const nextDb = {
              ...currentDb,
              stakes: stake ? [stake, ...currentDb.stakes] : currentDb.stakes,
              wards: [ward, ...currentDb.wards],
              roles: upsertRole(upsertRole(currentDb.roles, role), viewerRole),
              users: currentDb.users.map((user) => (user.id === currentExistingUser.id ? updatedUser : user)),
              session: {
                currentUserId: updatedUser.id,
                currentWardId: updatedUser.wardId,
              } satisfies SessionState,
            };

            const createdWardDb = withAuditLog(nextDb, updatedUser.id, {
              wardId: ward.id,
              action: "CREATE_WARD",
              module: "onboarding",
              itemLabel: ward.name,
              summary: "Criou ala pelo onboarding inicial.",
            });

            return withAuditLog(createdWardDb, updatedUser.id, {
              wardId: updatedUser.wardId,
              action: "LOGIN",
              module: "auth",
              itemLabel: updatedUser.name,
              summary: "Entrou no sistema com email e senha.",
            });
          }

          const updated = {
            ...currentDb,
            users: currentDb.users.map((user) =>
              user.id === currentExistingUser.id ? withRecordMetadata({ ...user, lastAccessAt: nowIso() }, user, currentExistingUser.id) : user,
            ),
            session: {
              currentUserId: currentExistingUser.id,
              currentWardId: currentExistingUser.wardId,
            } satisfies SessionState,
          };

          return withAuditLog(updated, currentExistingUser.id, {
            wardId: currentExistingUser.wardId,
            action: "LOGIN",
            module: "auth",
            itemLabel: currentExistingUser.name,
            summary: "Entrou no sistema com email e senha.",
          });
        }

        const timestamp = nowIso();
        const role = createOnboardingRole("ward-admin");
        const viewerRole = createOnboardingRole("viewer");
        const existingStake =
          currentDb.stakes.find((stake) => stake.id === inputStakeId) ??
          (stakeName ? currentDb.stakes.find((stake) => normalizeOrganizationName(stake.name) === normalizeOrganizationName(stakeName)) : undefined);
        const newStakeId = stakeName && !existingStake ? uid("stake") : undefined;
        const wardId = uid("ward");
        const user = buildOnboardingUser(normalizedEmail, wardId, role, timestamp, input.authUserId);
        const stake: Stake | undefined =
          stakeName && !existingStake && newStakeId
            ? withRecordMetadata<Stake>(
                {
                  id: newStakeId,
                  name: stakeName,
                  city,
                  state: input.state?.trim() ?? "",
                  country,
                },
                undefined,
                user.id,
                timestamp,
              )
            : undefined;
        const ward: Ward = withRecordMetadata<Ward>(
          {
            id: wardId,
            stakeId: existingStake?.id ?? stake?.id ?? "",
            name: wardName,
            city,
            state: input.state?.trim() ?? "",
            country,
          },
          undefined,
          user.id,
          timestamp,
        );

        const nextDb = {
          ...currentDb,
          stakes: stake ? [stake, ...currentDb.stakes] : currentDb.stakes,
          wards: [ward, ...currentDb.wards],
          roles: upsertRole(upsertRole(currentDb.roles, role), viewerRole),
          users: [user, ...currentDb.users],
          session: {
            currentUserId: user.id,
            currentWardId: user.wardId,
          } satisfies SessionState,
        };

        const createdWardDb = withAuditLog(nextDb, user.id, {
          wardId: ward.id,
          action: "CREATE_WARD",
          module: "onboarding",
          itemLabel: ward.name,
          summary: "Criou ala pelo onboarding inicial.",
        });
        const createdUserDb = withAuditLog(createdWardDb, user.id, {
          wardId: user.wardId,
          action: "CREATE_USER",
          module: "usuarios",
          itemLabel: user.name,
          summary: "Criou usuário administrador da ala pelo onboarding.",
        });

        return withAuditLog(createdUserDb, user.id, {
          wardId: user.wardId,
          action: "LOGIN",
          module: "auth",
          itemLabel: user.name,
          summary: "Entrou no sistema com email e senha.",
        });
      });

      return true;
    }

    function joinExistingWard(email: string, wardId: string, authUserId?: string) {
      const normalizedEmail = normalizeEmail(email);
      const existingUser = db.users.find((user) => normalizeEmail(user.email) === normalizedEmail);
      const wardExists = db.wards.some((ward) => ward.id === wardId);

      if (!normalizedEmail || !wardExists || existingUser?.status === "inactive") {
        return false;
      }

      setDb((currentDb) => {
        const currentExistingUser = currentDb.users.find((user) => normalizeEmail(user.email) === normalizedEmail);
        const ward = currentDb.wards.find((item) => item.id === wardId);

        if (!ward) {
          return currentDb;
        }

        if (currentExistingUser) {
          if (currentExistingUser.status !== "active") {
            return currentDb;
          }

          if (!currentExistingUser.wardId) {
            const timestamp = nowIso();
            const role = createOnboardingRole("viewer");
            const updatedUser = withRecordMetadata(
              {
                ...currentExistingUser,
                wardId: ward.id,
                roleId: role.id,
                permissionOverrides: normalizePermissionSet(role.permissions),
                permissionsConfigured: true,
                lastAccessAt: timestamp,
              },
              currentExistingUser,
              currentExistingUser.id,
              timestamp,
            );
            const nextDb = {
              ...currentDb,
              roles: upsertRole(currentDb.roles, role),
              users: currentDb.users.map((user) => (user.id === currentExistingUser.id ? updatedUser : user)),
              session: {
                currentUserId: updatedUser.id,
                currentWardId: updatedUser.wardId,
              } satisfies SessionState,
            };
            const joinedDb = withAuditLog(nextDb, updatedUser.id, {
              wardId: updatedUser.wardId,
              action: "JOIN_WARD",
              module: "onboarding",
              itemLabel: ward.name,
              summary: "Entrou em uma ala existente pelo onboarding.",
            });

            return withAuditLog(joinedDb, updatedUser.id, {
              wardId: updatedUser.wardId,
              action: "LOGIN",
              module: "auth",
              itemLabel: updatedUser.name,
              summary: "Entrou no sistema com email e senha.",
            });
          }

          const updated = {
            ...currentDb,
            users: currentDb.users.map((user) =>
              user.id === currentExistingUser.id ? withRecordMetadata({ ...user, lastAccessAt: nowIso() }, user, currentExistingUser.id) : user,
            ),
            session: {
              currentUserId: currentExistingUser.id,
              currentWardId: currentExistingUser.wardId,
            } satisfies SessionState,
          };

          return withAuditLog(updated, currentExistingUser.id, {
            wardId: currentExistingUser.wardId,
            action: "LOGIN",
            module: "auth",
            itemLabel: currentExistingUser.name,
            summary: "Entrou no sistema com email e senha.",
          });
        }

        const timestamp = nowIso();
        const role = createOnboardingRole("viewer");
        const user = buildOnboardingUser(normalizedEmail, ward.id, role, timestamp, authUserId);

        const nextDb = {
          ...currentDb,
          roles: upsertRole(currentDb.roles, role),
          users: [user, ...currentDb.users],
          session: {
            currentUserId: user.id,
            currentWardId: user.wardId,
          } satisfies SessionState,
        };

        const joinedDb = withAuditLog(nextDb, user.id, {
          wardId: user.wardId,
          action: "JOIN_WARD",
          module: "onboarding",
          itemLabel: ward.name,
          summary: "Entrou em uma ala existente pelo onboarding.",
        });

        return withAuditLog(joinedDb, user.id, {
          wardId: user.wardId,
          action: "LOGIN",
          module: "auth",
          itemLabel: user.name,
          summary: "Entrou no sistema com email e senha.",
        });
      });

      return true;
    }

    function logout() {
      setDb((currentDb) => ({
        ...currentDb,
        session: {},
      }));
    }

    function switchWard(wardId: string) {
      setDb((currentDb) => ({
        ...currentDb,
        session: {
          ...currentDb.session,
          currentWardId: wardId,
        },
      }));
    }

    function resetDemoData() {
      setDb(resetDatabase());
    }

    function changeCurrentUserRole(roleId: string) {
      const selectedRole = db.roles.find((role) => role.id === roleId);
      if (!selectedRole || !currentUser || currentUser.roleId === roleId) return;

      setDb((currentDb) => {
        const role = currentDb.roles.find((item) => item.id === roleId);
        const user = currentDb.users.find((item) => item.id === currentDb.session.currentUserId);
        if (!role || !user || user.roleId === roleId) return currentDb;

        const actorUserId = user.id;
        const nextDb = {
          ...currentDb,
          users: currentDb.users.map((item) => (item.id === user.id ? withRecordMetadata({ ...item, roleId }, item, actorUserId) : item)),
        };

        return withAuditLog(nextDb, actorUserId, {
          wardId: user.wardId,
          action: "CHANGE_CURRENT_USER_ROLE",
          module: "auth",
          itemLabel: user.name,
          summary: `Trocou perfil simulado para ${role.name}.`,
        });
      });

      toast.success(`Perfil simulado alterado para ${selectedRole.name}.`);
    }

    function hasPermission(permission: PermissionKey) {
      return currentUserPermissions.includes(permission);
    }

    function saveStake(input: SaveStakeInput) {
      const existing = input.id ? db.stakes.find((stake) => stake.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("stake");
        const currentExisting = currentDb.stakes.find((stake) => stake.id === id);
        const exists = Boolean(currentExisting);
        const actorUserId = getActorUserId(currentDb);
        const { wardIds, ...stakeInput } = input;
        const wardIdsToAttach = new Set(wardIds ?? []);
        const stake = withRecordMetadata(
          {
            ...stakeInput,
            id,
            name: stakeInput.name.trim(),
            city: stakeInput.city.trim(),
            state: stakeInput.state.trim(),
            country: stakeInput.country.trim() || "Brasil",
            archivedAt: stakeInput.archivedAt ?? currentExisting?.archivedAt,
          },
          currentExisting,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          stakes: exists ? currentDb.stakes.map((current) => (current.id === id ? stake : current)) : [stake, ...currentDb.stakes],
          wards: wardIdsToAttach.size
            ? currentDb.wards.map((ward) => (wardIdsToAttach.has(ward.id) ? withRecordMetadata({ ...ward, stakeId: id }, ward, actorUserId) : ward))
            : currentDb.wards,
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: exists ? "UPDATE_STAKE" : "CREATE_STAKE",
          module: "sistema",
          itemLabel: stake.name,
          summary: exists
            ? `Atualizou dados da estaca e vinculou ${wardIdsToAttach.size} alas.`
            : `Criou estaca pelo sistema e vinculou ${wardIdsToAttach.size} alas.`,
        });
      });

      toast.success(existing ? "Estaca atualizada." : "Estaca cadastrada.");
    }

    function setStakeArchiveState(stakeId: string, archived: boolean) {
      const target = db.stakes.find((stake) => stake.id === stakeId);
      if (!target) return;

      setDb((currentDb) => {
        const stake = currentDb.stakes.find((item) => item.id === stakeId);
        if (!stake) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          stakes: currentDb.stakes.map((item) => (item.id === stakeId ? withArchiveMetadata(item, archived, actorUserId) : item)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: archived ? "ARCHIVE_STAKE" : "UNARCHIVE_STAKE",
          module: "sistema",
          itemLabel: stake.name,
          summary: archived ? "Arquivou estaca." : "Desarquivou estaca.",
        });
      });

      toast.success(archived ? "Estaca arquivada." : "Estaca desarquivada.");
    }

    function archiveStake(stakeId: string) {
      setStakeArchiveState(stakeId, true);
    }

    function unarchiveStake(stakeId: string) {
      setStakeArchiveState(stakeId, false);
    }

    function deleteStake(stakeId: string) {
      const target = db.stakes.find((stake) => stake.id === stakeId);
      if (!target?.archivedAt) return;
      const linkedWards = db.wards.filter((ward) => ward.stakeId === stakeId);

      if (linkedWards.length) {
        toast.error("Remova ou mova as alas desta estaca antes de deletar.");
        return;
      }

      setDb((currentDb) => {
        const stake = currentDb.stakes.find((item) => item.id === stakeId);
        if (!stake?.archivedAt) return currentDb;

        const nextDb = {
          ...currentDb,
          stakes: currentDb.stakes.filter((item) => item.id !== stakeId),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: "DELETE_STAKE",
          module: "sistema",
          itemLabel: stake.name,
          summary: "Deletou estaca arquivada do sistema.",
        });
      });

      toast.success("Estaca deletada.");
    }

    function saveWard(input: Ward) {
      const exists = db.wards.some((ward) => ward.id === input.id);
      if (!exists) return;

      setDb((currentDb) => {
        const existing = currentDb.wards.find((ward) => ward.id === input.id);
        if (!existing) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const ward = withRecordMetadata(
          {
            ...existing,
            ...input,
            name: input.name.trim(),
            city: input.city.trim(),
            state: input.state.trim(),
            country: input.country.trim(),
          },
          existing,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          wards: currentDb.wards.map((current) => (current.id === ward.id ? ward : current)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: ward.id,
          action: "UPDATE_WARD",
          module: "ala",
          itemLabel: ward.name,
          summary: "Atualizou dados da ala.",
        });
      });

      toast.success("Dados da ala atualizados.");
    }

    function saveSystemWard(input: Omit<Ward, "id"> & { id?: string }) {
      const existing = input.id ? db.wards.find((ward) => ward.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("ward");
        const currentExisting = currentDb.wards.find((ward) => ward.id === id);
        const exists = Boolean(currentExisting);
        const actorUserId = getActorUserId(currentDb);
        const ward = withRecordMetadata(
          {
            ...input,
            id,
            name: input.name.trim(),
            city: input.city.trim(),
            state: input.state.trim(),
            country: input.country.trim() || "Brasil",
            archivedAt: input.archivedAt ?? currentExisting?.archivedAt,
          },
          currentExisting,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          wards: exists ? currentDb.wards.map((current) => (current.id === id ? ward : current)) : [ward, ...currentDb.wards],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: ward.id,
          action: exists ? "UPDATE_WARD" : "CREATE_WARD",
          module: "sistema",
          itemLabel: ward.name,
          summary: exists ? "Atualizou dados da ala pelo sistema." : "Criou ala pelo sistema.",
        });
      });

      toast.success(existing ? "Ala atualizada." : "Ala cadastrada.");
    }

    function setWardArchiveState(wardId: string, archived: boolean) {
      const target = db.wards.find((ward) => ward.id === wardId);
      if (!target) return;

      setDb((currentDb) => {
        const ward = currentDb.wards.find((item) => item.id === wardId);
        if (!ward) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          wards: currentDb.wards.map((item) => (item.id === wardId ? withArchiveMetadata(item, archived, actorUserId) : item)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId,
          action: archived ? "ARCHIVE_WARD" : "UNARCHIVE_WARD",
          module: "sistema",
          itemLabel: ward.name,
          summary: archived ? "Arquivou ala." : "Desarquivou ala.",
        });
      });

      toast.success(archived ? "Ala arquivada." : "Ala desarquivada.");
    }

    function archiveWard(wardId: string) {
      setWardArchiveState(wardId, true);
    }

    function unarchiveWard(wardId: string) {
      setWardArchiveState(wardId, false);
    }

    function deleteWard(wardId: string) {
      const target = db.wards.find((ward) => ward.id === wardId);
      if (!target?.archivedAt) return;

      if (db.session.currentWardId === wardId) {
        toast.error("Troque para outra ala antes de deletar a ala atual.");
        return;
      }

      setDb((currentDb) => {
        const ward = currentDb.wards.find((item) => item.id === wardId);
        if (!ward?.archivedAt || currentDb.session.currentWardId === wardId) return currentDb;

        const deletedMemberIds = new Set(currentDb.members.filter((member) => member.wardId === wardId).map((member) => member.id));
        const deletedMinuteIds = new Set(currentDb.sacramentMinutes.filter((minute) => minute.wardId === wardId).map((minute) => minute.id));
        const nextDb = {
          ...currentDb,
          wards: currentDb.wards.filter((item) => item.id !== wardId),
          users: currentDb.users.filter((user) => user.wardId !== wardId),
          members: currentDb.members.filter((member) => member.wardId !== wardId),
          memberNotes: currentDb.memberNotes.filter((note) => !deletedMemberIds.has(note.memberId)),
          sacramentMinutes: currentDb.sacramentMinutes.filter((minute) => minute.wardId !== wardId),
          minuteVersions: currentDb.minuteVersions.filter((version) => !deletedMinuteIds.has(version.minuteId)),
          missionaryCompanionships: currentDb.missionaryCompanionships.filter((item) => item.wardId !== wardId),
          hostHouses: currentDb.hostHouses.filter((item) => item.wardId !== wardId),
          lunchSchedules: currentDb.lunchSchedules.filter((item) => item.wardId !== wardId),
          caravans: currentDb.caravans.filter((item) => item.wardId !== wardId),
          caravanPeople: currentDb.caravanPeople.filter((item) => item.wardId !== wardId),
          caravanRegistrations: currentDb.caravanRegistrations.filter((item) => item.wardId !== wardId),
          patrolMembers: currentDb.patrolMembers.filter((item) => item.wardId !== wardId),
          patrolSchedules: currentDb.patrolSchedules.filter((item) => item.wardId !== wardId),
          auditLogs: currentDb.auditLogs.filter((log) => log.wardId !== wardId),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: "DELETE_WARD",
          module: "sistema",
          itemLabel: ward.name,
          summary: "Deletou ala arquivada e seus dados vinculados do sistema.",
        });
      });

      toast.success("Ala deletada.");
    }

    function saveMember(input: Omit<Member, "id"> & { id?: string }) {
      const exists = input.id ? db.members.some((member) => member.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("member");
        const existing = currentDb.members.find((member) => member.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const member = withRecordMetadata({ ...input, birthDate: normalizeDateInput(input.birthDate), id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          members: exists
            ? currentDb.members.map((current) => (current.id === id ? member : current))
            : [member, ...currentDb.members],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: member.wardId,
          action: exists ? "UPDATE_MEMBER" : "CREATE_MEMBER",
          module: "membros",
          itemLabel: member.name,
          summary: exists ? "Atualizou cadastro de membro." : "Criou novo cadastro de membro.",
        });
      });

      toast.success(exists ? "Membro atualizado." : "Membro cadastrado.");
    }

    function deleteMembers(memberIds: string[]) {
      const ids = new Set(memberIds);
      if (!ids.size) return;
      const deletedCount = db.members.filter((member) => ids.has(member.id)).length;
      if (!deletedCount) return;

      setDb((currentDb) => {
        const membersToDelete = currentDb.members.filter((member) => ids.has(member.id));
        if (!membersToDelete.length) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const wardId = membersToDelete[0].wardId;
        const itemLabel = membersToDelete.length === 1 ? membersToDelete[0].name : `${membersToDelete.length} membros`;
        const nextDb = clearDeletedMemberReferences(
          {
            ...currentDb,
            members: currentDb.members.map((member) => (ids.has(member.id) ? withArchiveMetadata(member, true, actorUserId) : member)),
          },
          ids,
          actorUserId,
        );

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId,
          action: membersToDelete.length === 1 ? "DELETE_MEMBER" : "BULK_DELETE_MEMBERS",
          module: "membros",
          itemLabel,
          summary:
            membersToDelete.length === 1
              ? "Removeu cadastro de membro."
              : `Removeu ${membersToDelete.length} cadastros de membros em lote.`,
        });
      });

      toast.success(deletedCount === 1 ? "Membro removido." : `${deletedCount} membros removidos.`);
    }

    function importMembers(input: ImportMembersInput) {
      const importedMembers = input.members.filter((member) => member.name.trim());
      if (!importedMembers.length) return;

      setDb((currentDb) => {
        const actorUserId = getActorUserId(currentDb);
        const membersByKey = new Map<string, Member>();
        currentDb.members
          .filter((member) => member.wardId === input.wardId)
          .forEach((member) => {
            membersByKey.set(slugify(member.name), member);
          });

        const importByKey = new Map<string, Omit<Member, "id" | "wardId">>();
        importedMembers.forEach((member) => {
          importByKey.set(slugify(member.name), {
            ...member,
            birthDate: normalizeDateInput(member.birthDate),
          });
        });

        let createdCount = 0;
        let updatedCount = 0;
        const importedKeys = new Set(importByKey.keys());
        const untouchedMemberIds = new Set(
          currentDb.members
            .filter((member) => member.wardId === input.wardId && !importedKeys.has(slugify(member.name)))
            .map((member) => member.id),
        );
        const importedRecords = Array.from(importByKey.entries()).map(([key, member]) => {
          const existing = membersByKey.get(key);

          if (existing) {
            updatedCount += 1;
            return {
              ...withRecordMetadata(
                {
                  ...member,
                  id: existing.id,
                  wardId: input.wardId,
                },
                existing,
                actorUserId,
              ),
              archivedAt: undefined,
              archivedByUserId: undefined,
            } satisfies Member;
          }

          createdCount += 1;
          return withRecordMetadata(
            {
              ...member,
              id: uid("member"),
              wardId: input.wardId,
            },
            undefined,
            actorUserId,
          ) satisfies Member;
        });

        const importedRecordIds = new Set(importedRecords.map((member) => member.id));
        const archivedMissingMemberIds = input.removeMissing ? untouchedMemberIds : new Set<string>();
        let nextDb: Database = {
          ...currentDb,
          members: [
            ...importedRecords,
            ...currentDb.members.flatMap((member) => {
              if (member.wardId !== input.wardId) return [member];
              if (importedRecordIds.has(member.id)) return [];
              if (!input.removeMissing || !untouchedMemberIds.has(member.id)) return [member];

              return [withArchiveMetadata(member, true, actorUserId)];
            }),
          ],
        };

        if (input.removeMissing) {
          nextDb = clearDeletedMemberReferences(nextDb, archivedMissingMemberIds, actorUserId);
        }

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: input.wardId,
          action: "IMPORT_MEMBERS",
          module: "membros",
          itemLabel: `${importedRecords.length} membros`,
          summary: input.removeMissing
            ? `Importou ${importedRecords.length} membros, atualizou ${updatedCount}, criou ${createdCount} e removeu ${untouchedMemberIds.size} fora do CSV.`
            : `Importou ${importedRecords.length} membros, atualizou ${updatedCount} e criou ${createdCount}.`,
        });
      });

      toast.success(`${importedMembers.length} ${importedMembers.length === 1 ? "membro importado" : "membros importados"}.`);
    }

    function addMemberNote(memberId: string, text: string) {
      if (!text.trim()) return;
      const memberExists = db.members.some((member) => member.id === memberId);
      if (!memberExists) return;

      setDb((currentDb) => {
        const member = currentDb.members.find((item) => item.id === memberId);
        if (!member) return currentDb;

        const note: MemberNote = {
          id: uid("note"),
          memberId,
          createdAt: nowIso(),
          createdBy: currentDb.session.currentUserId ?? "system",
          text: text.trim(),
        };

        const nextDb = {
          ...currentDb,
          memberNotes: [note, ...currentDb.memberNotes],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: member.wardId,
          action: "CREATE_MEMBER_NOTE",
          module: "membros",
          itemLabel: member.name,
          summary: "Adicionou anotação administrativa ao membro.",
        });
      });

      toast.success("Anotação adicionada.");
    }

    function saveUser(input: Omit<User, "id" | "createdAt" | "lastAccessAt"> & { id?: string }) {
      const exists = input.id ? db.users.some((user) => user.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("user");
        const existing = currentDb.users.find((user) => user.id === id);
        const actorUserId = getActorUserId(currentDb);
        const user: User = withRecordMetadata(
          {
            ...input,
            id,
            permissionOverrides: normalizePermissionSet(input.permissionOverrides),
            permissionsConfigured: true,
            createdAt: existing?.createdAt ?? nowIso(),
            lastAccessAt: existing?.lastAccessAt,
          },
          existing,
          actorUserId,
        );

        const nextDb = {
          ...currentDb,
          users: existing
            ? currentDb.users.map((current) => (current.id === id ? user : current))
            : [user, ...currentDb.users],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: user.wardId,
          action: existing ? "UPDATE_USER" : "CREATE_USER",
          module: "usuarios",
          itemLabel: user.name,
          summary: existing ? "Atualizou perfil e permissões." : "Criou novo usuário com acesso fake local.",
        });
      });

      toast.success(exists ? "Usuário atualizado." : "Usuário cadastrado.");
    }

    function toggleUserStatus(userId: string) {
      const targetUser = db.users.find((user) => user.id === userId);
      if (!targetUser) return;
      const nextStatus: User["status"] = targetUser.status === "active" ? "inactive" : "active";

      setDb((currentDb) => {
        const target = currentDb.users.find((user) => user.id === userId);
        if (!target) return currentDb;

        const nextStatus: User["status"] = target.status === "active" ? "inactive" : "active";
        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          users: currentDb.users.map((user) => (user.id === userId ? withRecordMetadata({ ...user, status: nextStatus }, user, actorUserId) : user)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: target.wardId,
          action: "TOGGLE_USER_STATUS",
          module: "usuarios",
          itemLabel: target.name,
          summary: `Alterou status do usuário para ${nextStatus}.`,
        });
      });

      toast.success(nextStatus === "active" ? "Usuário ativado." : "Usuário desativado.");
    }

    function saveMinute(input: SaveMinuteInput) {
      const id = input.id ?? uid("minute");
      const existing = db.sacramentMinutes.find((minute) => minute.id === id);

      setDb((currentDb) => {
        const existing = currentDb.sacramentMinutes.find((minute) => minute.id === id);
        const actorUserId = getActorUserId(currentDb);
        const nextVersionId = uid("version");
        const minute: SacramentMinute = withRecordMetadata(
          {
            ...input,
            id,
            createdAt: existing?.createdAt ?? nowIso(),
            updatedAt: nowIso(),
            versionIds: [nextVersionId, ...(existing?.versionIds ?? [])],
          },
          existing,
          actorUserId,
        );

        const nextDb = {
          ...currentDb,
          sacramentMinutes: existing
            ? currentDb.sacramentMinutes.map((current) => (current.id === id ? minute : current))
            : [minute, ...currentDb.sacramentMinutes],
          minuteVersions: [
            {
              id: nextVersionId,
              minuteId: id,
              createdAt: nowIso(),
              createdBy: actorUserId ?? "",
              snapshot: minute.form,
              status: minute.status,
            },
            ...currentDb.minuteVersions,
          ],
        };

        const audited = withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: minute.wardId,
          action: existing ? "UPDATE_MINUTE" : "CREATE_MINUTE",
          module: "atas",
          itemLabel: minute.title,
          summary: existing ? "Atualizou ata sacramental." : "Criou nova ata sacramental.",
        });

        return audited;
      });

      toast.success(existing ? "Ata salva." : "Ata cadastrada.");
      return id;
    }

    function saveHymn(input: Omit<Hymn, "id"> & { id?: string }) {
      const existing = input.id ? db.hymns.find((hymn) => hymn.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("hymn");
        const currentExisting = currentDb.hymns.find((hymn) => hymn.id === id);
        const exists = Boolean(currentExisting);
        const actorUserId = getActorUserId(currentDb);
        const hymn = withRecordMetadata(
          {
            ...input,
            id,
            number: input.number.trim(),
            title: input.title.trim(),
            active: input.active !== false,
          },
          currentExisting,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          hymns: exists ? currentDb.hymns.map((current) => (current.id === id ? hymn : current)) : [hymn, ...currentDb.hymns],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: exists ? "UPDATE_HYMN" : "CREATE_HYMN",
          module: "sistema",
          itemLabel: `Hino ${hymn.number}`,
          summary: exists ? "Atualizou hino do catálogo." : "Criou hino no catálogo.",
        });
      });

      toast.success(existing ? "Hino atualizado." : "Hino cadastrado.");
    }

    function deleteHymn(hymnId: string) {
      const target = db.hymns.find((hymn) => hymn.id === hymnId);
      if (!target) return;

      setDb((currentDb) => {
        const hymn = currentDb.hymns.find((item) => item.id === hymnId);
        if (!hymn) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = clearDeletedHymnReferences(
          {
            ...currentDb,
            hymns: currentDb.hymns.filter((item) => item.id !== hymnId),
          },
          new Set([hymnId]),
          actorUserId,
        );

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: currentDb.session.currentWardId ?? "",
          action: "DELETE_HYMN",
          module: "sistema",
          itemLabel: `Hino ${hymn.number}`,
          summary: "Deletou hino do catálogo e removeu vínculos das atas.",
        });
      });

      toast.success("Hino deletado.");
    }

    function saveCompanionship(input: Omit<MissionaryCompanionship, "id"> & { id?: string }) {
      const exists = input.id ? db.missionaryCompanionships.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("comp");
        const existing = currentDb.missionaryCompanionships.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const companionship = withRecordMetadata({ ...input, id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          missionaryCompanionships: exists
            ? currentDb.missionaryCompanionships.map((item) => (item.id === id ? companionship : item))
            : [companionship, ...currentDb.missionaryCompanionships],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: companionship.wardId,
          action: exists ? "UPDATE_COMPANIONSHIP" : "CREATE_COMPANIONSHIP",
          module: "missionaries",
          itemLabel: companionship.name,
          summary: exists ? "Atualizou companheirismo missionário." : "Criou companheirismo missionário.",
        });
      });

      toast.success(exists ? "Dupla missionária atualizada." : "Dupla missionária cadastrada.");
    }

    function saveHostHouse(input: Omit<HostHouse, "id"> & { id?: string }) {
      const exists = input.id ? db.hostHouses.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("house");
        const existing = currentDb.hostHouses.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const house = withRecordMetadata({ ...input, id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          hostHouses: exists ? currentDb.hostHouses.map((item) => (item.id === id ? house : item)) : [house, ...currentDb.hostHouses],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: house.wardId,
          action: exists ? "UPDATE_HOST_HOUSE" : "CREATE_HOST_HOUSE",
          module: "missionaries",
          itemLabel: house.familyName,
          summary: exists ? "Atualizou casa anfitriã." : "Criou nova casa anfitriã.",
        });
      });

      toast.success(exists ? "Casa anfitriã atualizada." : "Casa anfitriã cadastrada.");
    }

    function saveLunchSchedule(input: Omit<LunchSchedule, "id"> & { id?: string }) {
      const existing = input.id ? db.lunchSchedules.find((item) => item.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("lunch");
        const existing = currentDb.lunchSchedules.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const lunch = withRecordMetadata({ ...input, id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          lunchSchedules: exists ? currentDb.lunchSchedules.map((item) => (item.id === id ? lunch : item)) : [lunch, ...currentDb.lunchSchedules],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: lunch.wardId,
          action: exists ? "UPDATE_LUNCH" : "CREATE_LUNCH",
          module: "missionaries",
          itemLabel: `${lunch.date} ${lunch.time}`,
          summary: exists ? "Atualizou agendamento de almoço missionário." : "Criou agendamento de almoço missionário.",
        });
      });

      toast.success(existing ? (existing.status !== input.status ? "Status do almoço atualizado." : "Almoço atualizado.") : "Almoço cadastrado.");
    }

    function deleteLunchSchedule(lunchId: string) {
      const lunchExists = db.lunchSchedules.some((item) => item.id === lunchId);
      if (!lunchExists) return;

      setDb((currentDb) => {
        const lunch = currentDb.lunchSchedules.find((item) => item.id === lunchId);
        if (!lunch) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          lunchSchedules: currentDb.lunchSchedules.map((item) => (item.id === lunchId ? withArchiveMetadata(item, true, actorUserId) : item)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: lunch.wardId,
          action: "DELETE_LUNCH",
          module: "missionaries",
          itemLabel: `${lunch.date} ${lunch.time}`,
          summary: "Removeu agendamento de almoço missionário.",
        });
      });

      toast.success("Almoço removido.");
    }

    function saveCaravan(input: Omit<Caravan, "id"> & { id?: string }) {
      const existing = input.id ? db.caravans.find((item) => item.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("caravan");
        const currentExisting = currentDb.caravans.find((item) => item.id === id);
        const exists = Boolean(currentExisting);
        const actorUserId = getActorUserId(currentDb);
        const caravan: Caravan = withRecordMetadata(
          {
            ...input,
            id,
            seatMode: "quantity",
            departureDate: normalizeDateInput(input.departureDate),
            returnDate: normalizeDateInput(input.returnDate),
            availableSeats: Math.max(0, Math.trunc(Number(input.availableSeats) || 0)),
            archivedAt: input.archivedAt ?? currentExisting?.archivedAt,
          },
          currentExisting,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          caravans: exists ? currentDb.caravans.map((item) => (item.id === id ? caravan : item)) : [caravan, ...currentDb.caravans],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: caravan.wardId,
          action: exists ? "UPDATE_CARAVAN" : "CREATE_CARAVAN",
          module: "caravanas",
          itemLabel: caravan.destination,
          summary: exists ? "Atualizou cadastro de caravana." : "Criou nova caravana.",
        });
      });

      toast.success(existing ? "Caravana atualizada." : "Caravana cadastrada.");
    }

    function setCaravanArchiveState(caravanId: string, archived: boolean) {
      const target = db.caravans.find((item) => item.id === caravanId);
      if (!target) return;

      setDb((currentDb) => {
        const caravan = currentDb.caravans.find((item) => item.id === caravanId);
        if (!caravan) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          caravans: currentDb.caravans.map((item) => (item.id === caravanId ? withArchiveMetadata(item, archived, actorUserId) : item)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: caravan.wardId,
          action: archived ? "ARCHIVE_CARAVAN" : "UNARCHIVE_CARAVAN",
          module: "caravanas",
          itemLabel: caravan.destination,
          summary: archived ? "Arquivou caravana." : "Desarquivou caravana.",
        });
      });

      toast.success(archived ? "Caravana arquivada." : "Caravana desarquivada.");
    }

    function archiveCaravan(caravanId: string) {
      setCaravanArchiveState(caravanId, true);
    }

    function unarchiveCaravan(caravanId: string) {
      setCaravanArchiveState(caravanId, false);
    }

    function saveCaravanPerson(input: Omit<CaravanPerson, "id"> & { id?: string }) {
      const existing = input.id ? db.caravanPeople.find((item) => item.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("caravan_person");
        const existing = currentDb.caravanPeople.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const person: CaravanPerson = withRecordMetadata(
          {
            ...input,
            id,
            birthDate: normalizeDateInput(input.birthDate),
            documentValue: input.documentValue.trim(),
            name: input.name.trim(),
            phone: input.phone.trim(),
            notes: input.notes.trim(),
          },
          existing,
          actorUserId,
        );
        const nextDb = {
          ...currentDb,
          caravanPeople: exists
            ? currentDb.caravanPeople.map((item) => (item.id === id ? person : item))
            : [person, ...currentDb.caravanPeople],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: person.wardId,
          action: exists ? "UPDATE_CARAVAN_PERSON" : "CREATE_CARAVAN_PERSON",
          module: "caravanas",
          itemLabel: person.name,
          summary: exists ? "Atualizou pessoa da caravana." : "Criou pessoa da caravana.",
        });
      });

      toast.success(existing ? "Pessoa atualizada." : "Pessoa cadastrada.");
    }

    function setCaravanPersonArchiveState(personId: string, archived: boolean) {
      const target = db.caravanPeople.find((item) => item.id === personId);
      if (!target) return;

      if (archived) {
        const blockingCaravan = findBlockingCaravanForPersonArchive({
          caravans: db.caravans,
          personId,
          registrations: db.caravanRegistrations,
        });

        if (blockingCaravan) {
          toast.error(`Não é possível arquivar: pessoa inscrita em ${blockingCaravan.destination}.`);
          return;
        }
      }

      setDb((currentDb) => {
        const person = currentDb.caravanPeople.find((item) => item.id === personId);
        if (!person) return currentDb;

        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          caravanPeople: currentDb.caravanPeople.map((item) => (item.id === personId ? withArchiveMetadata(item, archived, actorUserId) : item)),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: person.wardId,
          action: archived ? "ARCHIVE_CARAVAN_PERSON" : "UNARCHIVE_CARAVAN_PERSON",
          module: "caravanas",
          itemLabel: person.name,
          summary: archived ? "Arquivou pessoa da caravana." : "Desarquivou pessoa da caravana.",
        });
      });

      toast.success(archived ? "Pessoa arquivada." : "Pessoa desarquivada.");
    }

    function archiveCaravanPerson(personId: string) {
      setCaravanPersonArchiveState(personId, true);
    }

    function unarchiveCaravanPerson(personId: string) {
      setCaravanPersonArchiveState(personId, false);
    }

    function saveCaravanRegistration(input: SaveCaravanRegistrationInput) {
      const existing = input.id ? db.caravanRegistrations.find((item) => item.id === input.id) : undefined;

      setDb((currentDb) => {
        const id = input.id ?? uid("caravan_registration");
        const existingForPerson = currentDb.caravanRegistrations.find(
          (item) => item.caravanId === input.caravanId && item.personId === input.personId && item.id !== id,
        );

        if (existingForPerson) {
          return currentDb;
        }

        const existing = currentDb.caravanRegistrations.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const registration: CaravanRegistration = withRecordMetadata(
          {
            ...input,
            id,
            consumesSeat: input.consumesSeat !== false,
            isApproved: input.isApproved === true,
            isPaid: input.isPaid === true,
            createdAt: existing?.createdAt ?? nowIso(),
          },
          existing,
          actorUserId,
        );
        const personName = currentDb.caravanPeople.find((person) => person.id === registration.personId)?.name ?? "Pessoa";
        const nextDb = {
          ...currentDb,
          caravanRegistrations: exists
            ? currentDb.caravanRegistrations.map((item) => (item.id === id ? registration : item))
            : [registration, ...currentDb.caravanRegistrations],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: registration.wardId,
          action: exists ? "UPDATE_CARAVAN_REGISTRATION" : "CREATE_CARAVAN_REGISTRATION",
          module: "caravanas",
          itemLabel: personName,
          summary: registration.consumesSeat ? "Inscreveu pessoa ocupando banco." : "Inscreveu criança de colo sem ocupar banco.",
        });
      });

      toast.success(existing ? "Inscrição atualizada." : "Pessoa inscrita na caravana.");
    }

    function deleteCaravanRegistration(registrationId: string) {
      const target = db.caravanRegistrations.find((item) => item.id === registrationId);
      if (!target) return;

      setDb((currentDb) => {
        const registration = currentDb.caravanRegistrations.find((item) => item.id === registrationId);
        if (!registration) return currentDb;

        const personName = currentDb.caravanPeople.find((person) => person.id === registration.personId)?.name ?? "Pessoa";
        const actorUserId = getActorUserId(currentDb);
        const nextDb = {
          ...currentDb,
          caravanRegistrations: currentDb.caravanRegistrations.map((item) =>
            item.id === registrationId ? withArchiveMetadata(item, true, actorUserId) : item,
          ),
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: registration.wardId,
          action: "DELETE_CARAVAN_REGISTRATION",
          module: "caravanas",
          itemLabel: personName,
          summary: "Removeu passageiro inscrito na caravana.",
        });
      });

      toast.success("Passageiro removido da caravana.");
    }

    function savePatrolMember(input: Omit<PatrolMember, "id"> & { id?: string }) {
      const exists = input.id ? db.patrolMembers.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("patrol_member");
        const existing = currentDb.patrolMembers.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const member = withRecordMetadata({ ...input, id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          patrolMembers: exists ? currentDb.patrolMembers.map((item) => (item.id === id ? member : item)) : [member, ...currentDb.patrolMembers],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: member.wardId,
          action: exists ? "UPDATE_PATROL_MEMBER" : "CREATE_PATROL_MEMBER",
          module: "ronda",
          itemLabel: member.name,
          summary: exists ? "Atualizou participante de ronda." : "Criou participante de ronda.",
        });
      });

      toast.success(exists ? "Participante atualizado." : "Participante cadastrado.");
    }

    function savePatrolSchedule(input: Omit<PatrolSchedule, "id"> & { id?: string }) {
      const exists = input.id ? db.patrolSchedules.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("patrol_schedule");
        const existing = currentDb.patrolSchedules.find((item) => item.id === id);
        const exists = Boolean(existing);
        const actorUserId = getActorUserId(currentDb);
        const schedule = withRecordMetadata({ ...input, id }, existing, actorUserId);
        const nextDb = {
          ...currentDb,
          patrolSchedules: exists
            ? currentDb.patrolSchedules.map((item) => (item.id === id ? schedule : item))
            : [schedule, ...currentDb.patrolSchedules],
        };

        return withAuditLog(nextDb, currentDb.session.currentUserId, {
          wardId: schedule.wardId,
          action: exists ? "UPDATE_PATROL_SCHEDULE" : "CREATE_PATROL_SCHEDULE",
          module: "ronda",
          itemLabel: schedule.date,
          summary: exists ? "Atualizou escala de ronda." : "Criou nova escala de ronda.",
        });
      });

      toast.success(exists ? "Escala atualizada." : "Escala cadastrada.");
    }

    function updateCalendarWeekStartsOn(value: CalendarWeekStartsOn) {
      setDb((currentDb) => ({
        ...currentDb,
        appPreferences: {
          ...currentDb.appPreferences,
          calendarWeekStartsOn: value,
        },
      }));

      toast.success("Preferência de calendário atualizada.");
    }

    function updateDateFormat(value: DateFormat) {
      setDb((currentDb) => ({
        ...currentDb,
        appPreferences: {
          ...currentDb.appPreferences,
          dateFormat: value,
        },
      }));

      toast.success("Formato de data atualizado.");
    }

    return {
      db,
      ready: appReady,
      wards: db.wards,
      roles: db.roles,
      currentUser,
      currentWard,
      currentUserPermissions,
      usersByWard,
      membersByWard,
      memberNotesByWard,
      minutesByWard,
      companionshipsByWard,
      hostHousesByWard,
      lunchSchedulesByWard,
      caravansByWard,
      caravanPeopleByWard,
      caravanRegistrationsByWard,
      activeDocumentTypes,
      patrolMembersByWard,
      patrolSchedulesByWard,
      auditLogsByWard,
      appPreferences: db.appPreferences,
      loginAs,
      resolveAuthenticatedUser,
      completeStakeOnboarding,
      completeWardOnboarding,
      joinExistingWard,
      logout,
      switchWard,
      resetDemoData,
      changeCurrentUserRole,
      hasPermission,
      saveStake,
      archiveStake,
      unarchiveStake,
      deleteStake,
      saveWard,
      saveSystemWard,
      archiveWard,
      unarchiveWard,
      deleteWard,
      saveMember,
      deleteMembers,
      importMembers,
      addMemberNote,
      saveUser,
      toggleUserStatus,
      saveMinute,
      saveHymn,
      deleteHymn,
      saveCompanionship,
      saveHostHouse,
      saveLunchSchedule,
      deleteLunchSchedule,
      saveCaravan,
      archiveCaravan,
      unarchiveCaravan,
      saveCaravanPerson,
      archiveCaravanPerson,
      unarchiveCaravanPerson,
      saveCaravanRegistration,
      deleteCaravanRegistration,
      savePatrolMember,
      savePatrolSchedule,
      updateCalendarWeekStartsOn,
      updateDateFormat,
    };
  }, [appReady, currentUser, currentUserPermissions, currentWard, currentWardId, db]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribeToHydration, getHydrationSnapshot, () => false);
  const initialDb = useMemo(() => createEmptyDatabase(), []);

  return (
    <AppProviderContent key={ready ? "hydrated" : "ssr"} initialDb={initialDb} ready={ready}>
      {children}
    </AppProviderContent>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }
  return context;
}

export function useMinuteDefaults() {
  const { currentUser, currentWard } = useAppContext();

  return {
    wardId: currentWard?.id ?? "",
    title: "Reunião Sacramental",
    date: todayDate(),
    status: "draft" as const,
    presidency: "Bispado",
    responsibleUserId: currentUser?.id ?? "",
    form: createEmptyMinuteForm(),
  };
}

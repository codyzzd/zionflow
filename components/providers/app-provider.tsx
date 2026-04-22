"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { createEmptyMinuteForm, createSeedDatabase } from "@/lib/demo-data";
import { loadDatabase, resetDatabase, saveDatabase } from "@/lib/storage";
import { normalizeDateInput, nowIso, slugify, todayDate, uid } from "@/lib/utils";
import type {
  AuditLog,
  AppPreferences,
  CalendarWeekStartsOn,
  DateFormat,
  Database,
  HostHouse,
  HybridField,
  LunchSchedule,
  Member,
  MemberNote,
  MinuteFormData,
  MissionaryCompanionship,
  PatrolMember,
  PatrolSchedule,
  PermissionKey,
  Role,
  SacramentMinute,
  SessionState,
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
  patrolMembersByWard: PatrolMember[];
  patrolSchedulesByWard: PatrolSchedule[];
  auditLogsByWard: AuditLog[];
  appPreferences: AppPreferences;
  loginAs: (userId: string) => void;
  logout: () => void;
  switchWard: (wardId: string) => void;
  resetDemoData: () => void;
  hasPermission: (permission: PermissionKey) => boolean;
  saveMember: (input: Omit<Member, "id"> & { id?: string }) => void;
  deleteMembers: (memberIds: string[]) => void;
  importMembers: (input: ImportMembersInput) => void;
  addMemberNote: (memberId: string, text: string) => void;
  saveUser: (input: Omit<User, "id" | "createdAt" | "lastAccessAt"> & { id?: string }) => void;
  toggleUserStatus: (userId: string) => void;
  saveMinute: (input: SaveMinuteInput) => string;
  saveCompanionship: (input: Omit<MissionaryCompanionship, "id"> & { id?: string }) => void;
  saveHostHouse: (input: Omit<HostHouse, "id"> & { id?: string }) => void;
  saveLunchSchedule: (input: Omit<LunchSchedule, "id"> & { id?: string }) => void;
  deleteLunchSchedule: (lunchId: string) => void;
  savePatrolMember: (input: Omit<PatrolMember, "id"> & { id?: string }) => void;
  savePatrolSchedule: (input: Omit<PatrolSchedule, "id"> & { id?: string }) => void;
  updateCalendarWeekStartsOn: (value: CalendarWeekStartsOn) => void;
  updateDateFormat: (value: DateFormat) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function subscribeToHydration() {
  return () => {};
}

function resolvePermissions(db: Database, user?: User) {
  if (!user) return [];
  const rolePermissions = db.roles.find((role) => role.id === user.roleId)?.permissions ?? [];
  return Array.from(new Set([...rolePermissions, ...user.permissionOverrides]));
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

function clearDeletedMemberReferences(db: Database, memberIds: Set<string>) {
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
    users: db.users.map((user) => (user.memberId && memberIds.has(user.memberId) ? { ...user, memberId: undefined } : user)),
    hostHouses: db.hostHouses.map((house) => (house.hostMemberId && memberIds.has(house.hostMemberId) ? { ...house, hostMemberId: undefined } : house)),
    lunchSchedules: db.lunchSchedules.map((lunch) => (memberIds.has(lunch.hostMemberId) ? { ...lunch, hostMemberId: "" } : lunch)),
    patrolMembers: db.patrolMembers.map((member) => (member.memberId && memberIds.has(member.memberId) ? { ...member, memberId: undefined } : member)),
    sacramentMinutes: db.sacramentMinutes.map((minute) => ({
      ...minute,
      form: clearMinuteForm(minute.form),
      updatedAt: nowIso(),
    })),
  };
}

function AppProviderContent({ children, initialDb, ready }: { children: ReactNode; initialDb: Database; ready: boolean }) {
  const [db, setDb] = useState<Database>(initialDb);

  useEffect(() => {
    if (ready) {
      saveDatabase(db);
    }
  }, [db, ready]);

  const currentUser = db.users.find((user) => user.id === db.session.currentUserId);
  const currentWardId = db.session.currentWardId ?? currentUser?.wardId;
  const currentWard = db.wards.find((ward) => ward.id === currentWardId);
  const currentUserPermissions = resolvePermissions(db, currentUser);

  const value = useMemo<AppContextValue>(() => {
    const usersByWard = db.users.filter((user) => user.wardId === currentWardId);
    const membersByWard = db.members.filter((member) => member.wardId === currentWardId);
    const memberIds = new Set(membersByWard.map((member) => member.id));
    const memberNotesByWard = db.memberNotes.filter((note) => memberIds.has(note.memberId));
    const minutesByWard = db.sacramentMinutes.filter((minute) => minute.wardId === currentWardId);
    const companionshipsByWard = db.missionaryCompanionships.filter((companionship) => companionship.wardId === currentWardId);
    const hostHousesByWard = db.hostHouses.filter((house) => house.wardId === currentWardId);
    const lunchSchedulesByWard = db.lunchSchedules.filter((lunch) => lunch.wardId === currentWardId);
    const patrolMembersByWard = db.patrolMembers.filter((member) => member.wardId === currentWardId);
    const patrolSchedulesByWard = db.patrolSchedules.filter((schedule) => schedule.wardId === currentWardId);
    const auditLogsByWard = db.auditLogs.filter((log) => log.wardId === currentWardId);

    function loginAs(userId: string) {
      setDb((currentDb) => {
        const user = currentDb.users.find((item) => item.id === userId);
        if (!user || user.status !== "active") return currentDb;

        const nextUsers = currentDb.users.map((item) =>
          item.id === userId ? { ...item, lastAccessAt: nowIso() } : item,
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
          summary: "Entrou no sistema pelo login fake local.",
        });
      });
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

    function hasPermission(permission: PermissionKey) {
      return currentUserPermissions.includes(permission);
    }

    function saveMember(input: Omit<Member, "id"> & { id?: string }) {
      const exists = input.id ? db.members.some((member) => member.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("member");
        const exists = currentDb.members.some((member) => member.id === id);
        const member = { ...input, birthDate: normalizeDateInput(input.birthDate), id };
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

        const wardId = membersToDelete[0].wardId;
        const itemLabel = membersToDelete.length === 1 ? membersToDelete[0].name : `${membersToDelete.length} membros`;
        const nextDb = clearDeletedMemberReferences(
          {
            ...currentDb,
            members: currentDb.members.filter((member) => !ids.has(member.id)),
          },
          ids,
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
              ...member,
              id: existing.id,
              wardId: input.wardId,
            } satisfies Member;
          }

          createdCount += 1;
          return {
            ...member,
            id: uid("member"),
            wardId: input.wardId,
          } satisfies Member;
        });

        const importedRecordIds = new Set(importedRecords.map((member) => member.id));
        let nextDb: Database = {
          ...currentDb,
          members: [
            ...importedRecords,
            ...currentDb.members.filter((member) => {
              if (member.wardId !== input.wardId) return true;
              if (importedRecordIds.has(member.id)) return false;
              return !input.removeMissing;
            }),
          ],
        };

        if (input.removeMissing) {
          nextDb = clearDeletedMemberReferences(nextDb, untouchedMemberIds);
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
        const user: User = {
          ...input,
          id,
          createdAt: existing?.createdAt ?? nowIso(),
          lastAccessAt: existing?.lastAccessAt,
        };

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
        const nextDb = {
          ...currentDb,
          users: currentDb.users.map((user) => (user.id === userId ? { ...user, status: nextStatus } : user)),
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
        const nextVersionId = uid("version");
        const minute: SacramentMinute = {
          ...input,
          id,
          createdAt: existing?.createdAt ?? nowIso(),
          updatedAt: nowIso(),
          versionIds: [nextVersionId, ...(existing?.versionIds ?? [])],
        };

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
              createdBy: currentDb.session.currentUserId ?? "system",
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

    function saveCompanionship(input: Omit<MissionaryCompanionship, "id"> & { id?: string }) {
      const exists = input.id ? db.missionaryCompanionships.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("comp");
        const exists = currentDb.missionaryCompanionships.some((item) => item.id === id);
        const companionship = { ...input, id };
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
        const exists = currentDb.hostHouses.some((item) => item.id === id);
        const house = { ...input, id };
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
        const exists = currentDb.lunchSchedules.some((item) => item.id === id);
        const lunch = { ...input, id };
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

        const nextDb = {
          ...currentDb,
          lunchSchedules: currentDb.lunchSchedules.filter((item) => item.id !== lunchId),
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

    function savePatrolMember(input: Omit<PatrolMember, "id"> & { id?: string }) {
      const exists = input.id ? db.patrolMembers.some((item) => item.id === input.id) : false;

      setDb((currentDb) => {
        const id = input.id ?? uid("patrol_member");
        const exists = currentDb.patrolMembers.some((item) => item.id === id);
        const member = { ...input, id };
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
        const exists = currentDb.patrolSchedules.some((item) => item.id === id);
        const schedule = { ...input, id };
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
      ready,
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
      patrolMembersByWard,
      patrolSchedulesByWard,
      auditLogsByWard,
      appPreferences: db.appPreferences,
      loginAs,
      logout,
      switchWard,
      resetDemoData,
      hasPermission,
      saveMember,
      deleteMembers,
      importMembers,
      addMemberNote,
      saveUser,
      toggleUserStatus,
      saveMinute,
      saveCompanionship,
      saveHostHouse,
      saveLunchSchedule,
      deleteLunchSchedule,
      savePatrolMember,
      savePatrolSchedule,
      updateCalendarWeekStartsOn,
      updateDateFormat,
    };
  }, [currentUser, currentUserPermissions, currentWard, currentWardId, db, ready]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const initialDb = useMemo(() => (ready ? loadDatabase() : createSeedDatabase()), [ready]);

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

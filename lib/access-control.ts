import type { PermissionKey } from "@/types/domain";

export type AccessLevel = "hidden" | "view" | "edit";

export type AccessArea = {
  id: string;
  label: string;
  viewPermission: PermissionKey;
  managePermission?: PermissionKey;
};

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  hidden: "Não pode visualizar",
  view: "Pode visualizar",
  edit: "Pode visualizar e editar",
};

export const ACCESS_MATRIX_AREAS: AccessArea[] = [
  { id: "dashboard", label: "Dashboard", viewPermission: "dashboard.view" },
  { id: "ward", label: "Ala", viewPermission: "ward.view", managePermission: "ward.manage" },
  { id: "stake", label: "Estaca", viewPermission: "stake.view", managePermission: "stake.manage" },
  { id: "members", label: "Membros", viewPermission: "members.view", managePermission: "members.manage" },
  { id: "minutes", label: "Atas Sacramentais", viewPermission: "minutes.view", managePermission: "minutes.manage" },
  { id: "frequency", label: "Frequência", viewPermission: "frequency.view", managePermission: "frequency.manage" },
  { id: "missionary", label: "Missionários", viewPermission: "missionary.view", managePermission: "missionary.manage" },
  { id: "lunch", label: "Calendário de almoços", viewPermission: "lunch.view", managePermission: "lunch.manage" },
  { id: "patrol", label: "Ronda", viewPermission: "patrol.view", managePermission: "patrol.manage" },
  { id: "caravan-approve", label: "Caravana - Aprovar", viewPermission: "caravan.approve.view", managePermission: "caravan.approve.manage" },
  { id: "caravan-manage", label: "Caravana - Gerenciar caravanas", viewPermission: "caravan.manage.view", managePermission: "caravan.manage.manage" },
  { id: "users", label: "Usuários e acessos", viewPermission: "users.view", managePermission: "users.manage" },
];

export const ALWAYS_ALLOWED_PERMISSIONS: PermissionKey[] = [
  "caravan.view",
  "caravan.manage",
  "caravan.register.view",
  "caravan.register.manage",
];

export function permissionsForAccessLevel(area: AccessArea, level: AccessLevel): PermissionKey[] {
  if (level === "hidden") return [];

  if (level === "edit" && area.managePermission) {
    return [area.viewPermission, area.managePermission];
  }

  return [area.viewPermission];
}

export function accessLevelFromPermissions(area: AccessArea, permissions: PermissionKey[]): AccessLevel {
  if (area.managePermission && permissions.includes(area.managePermission)) return "edit";
  if (permissions.includes(area.viewPermission)) return "view";
  return "hidden";
}

export function normalizePermissionSet(permissions: PermissionKey[]) {
  return Array.from(new Set([...permissions, ...ALWAYS_ALLOWED_PERMISSIONS]));
}

export function permissionsFromLegacyRole(roleId: string, permissions: PermissionKey[]) {
  if (permissions.includes("caravan.view")) {
    permissions.push("caravan.register.view");
  }

  if (permissions.includes("caravan.manage")) {
    permissions.push(
      "caravan.register.view",
      "caravan.register.manage",
      "caravan.approve.view",
      "caravan.approve.manage",
      "caravan.manage.view",
      "caravan.manage.manage",
    );
  }

  if (permissions.includes("missionary.view")) {
    permissions.push("lunch.view");
  }

  if (permissions.includes("missionary.manage")) {
    permissions.push("lunch.view", "lunch.manage");
  }

  if (permissions.includes("minutes.view")) {
    permissions.push("frequency.view");
  }

  if (permissions.includes("minutes.manage")) {
    permissions.push("frequency.view", "frequency.manage");
  }

  if (permissions.includes("users.manage")) {
    permissions.push("users.view");
  }

  if (roleId === "role_admin" || roleId === "role_bishopric") {
    permissions.push("ward.view", "ward.manage", "stake.view", "stake.manage", "users.view", "users.manage", "roles.manage");
  }

  return normalizePermissionSet(permissions);
}

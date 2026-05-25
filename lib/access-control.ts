import type { PermissionKey } from "@/types/domain";

export type AccessLevel = "hidden" | "view" | "edit";

export type AccessArea = {
  category: AccessAreaCategory;
  description: string;
  id: string;
  icon: AccessAreaIcon;
  label: string;
  viewPermission: PermissionKey;
  managePermission?: PermissionKey;
};

export type AccessAreaCategory = "general" | "organization" | "minutes" | "support" | "caravan" | "admin";
export type AccessAreaIcon = "building" | "bus" | "file-text" | "handshake" | "key" | "landmark" | "layout-dashboard" | "shield" | "utensils" | "users";

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  hidden: "Não pode visualizar",
  view: "Pode visualizar",
  edit: "Pode visualizar e editar",
};

export const ACCESS_MATRIX_AREAS: AccessArea[] = [
  {
    category: "general",
    description: "Visão geral dos indicadores, atalhos e atividades recentes da ala.",
    icon: "layout-dashboard",
    id: "dashboard",
    label: "Dashboard",
    viewPermission: "dashboard.view",
  },
  {
    category: "organization",
    description: "Dados cadastrais da ala, liderança local e informações de contato.",
    icon: "building",
    id: "ward",
    label: "Ala",
    viewPermission: "ward.view",
    managePermission: "ward.manage",
  },
  {
    category: "organization",
    description: "Dados da estaca e contexto administrativo das alas vinculadas.",
    icon: "landmark",
    id: "stake",
    label: "Estaca",
    viewPermission: "stake.view",
    managePermission: "stake.manage",
  },
  {
    category: "organization",
    description: "Cadastro, informações pessoais e histórico dos membros da ala.",
    icon: "users",
    id: "members",
    label: "Membros",
    viewPermission: "members.view",
    managePermission: "members.manage",
  },
  {
    category: "minutes",
    description: "Registro, consulta e edição das reuniões sacramentais da ala.",
    icon: "file-text",
    id: "minutes",
    label: "Atas",
    viewPermission: "minutes.view",
    managePermission: "minutes.manage",
  },
  {
    category: "minutes",
    description: "Consulta dos hinos disponíveis e usados nas atas sacramentais.",
    icon: "file-text",
    id: "hymns",
    label: "Hinos",
    viewPermission: "hymns.view",
  },
  {
    category: "minutes",
    description: "Acompanhamento e preenchimento da frequência registrada nas atas.",
    icon: "file-text",
    id: "frequency",
    label: "Frequência",
    viewPermission: "frequency.view",
    managePermission: "frequency.manage",
  },
  {
    category: "support",
    description: "Organização de duplas missionárias, áreas de atuação e acompanhamento local.",
    icon: "handshake",
    id: "missionary",
    label: "Missionários",
    viewPermission: "missionary.view",
    managePermission: "missionary.manage",
  },
  {
    category: "support",
    description: "Agenda de refeições, famílias anfitriãs e compromissos com missionários.",
    icon: "utensils",
    id: "lunch",
    label: "Calendário de almoços",
    viewPermission: "lunch.view",
    managePermission: "lunch.manage",
  },
  {
    category: "support",
    description: "Escalas, participantes e registros das rondas da unidade.",
    icon: "shield",
    id: "patrol",
    label: "Ronda",
    viewPermission: "patrol.view",
    managePermission: "patrol.manage",
  },
  {
    category: "caravan",
    description: "Revisão e aprovação das reservas feitas para caravanas.",
    icon: "bus",
    id: "caravan-approve",
    label: "Aprovar",
    viewPermission: "caravan.approve.view",
    managePermission: "caravan.approve.manage",
  },
  {
    category: "caravan",
    description: "Cadastro, edição, arquivamento e acompanhamento das caravanas.",
    icon: "bus",
    id: "caravan-manage",
    label: "Gerenciar caravanas",
    viewPermission: "caravan.manage.view",
    managePermission: "caravan.manage.manage",
  },
  {
    category: "admin",
    description: "Gestão de contas e matriz de acesso por área do sistema.",
    icon: "key",
    id: "users",
    label: "Usuários e acessos",
    viewPermission: "users.view",
    managePermission: "users.manage",
  },
];

const ACCESS_MATRIX_GROUP_DEFINITIONS: Array<{ id: AccessAreaCategory; label: string }> = [
  { id: "general", label: "Geral" },
  { id: "organization", label: "Organização" },
  { id: "minutes", label: "Atas Sacramentais" },
  { id: "support", label: "Apoio e atividades" },
  { id: "caravan", label: "Caravana" },
  { id: "admin", label: "Administração" },
];

export const ACCESS_MATRIX_AREA_GROUPS: Array<{ id: AccessAreaCategory; label: string; areas: AccessArea[] }> = ACCESS_MATRIX_GROUP_DEFINITIONS.map((group) => ({
  ...group,
  areas: ACCESS_MATRIX_AREAS.filter((area) => area.category === group.id),
})).filter((group) => group.areas.length > 0);

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
    permissions.push("hymns.view", "frequency.view");
  }

  if (permissions.includes("minutes.manage")) {
    permissions.push("hymns.view", "frequency.view", "frequency.manage");
  }

  if (permissions.includes("users.manage")) {
    permissions.push("users.view");
  }

  if (roleId === "role_admin" || roleId === "role_bishopric") {
    permissions.push("ward.view", "ward.manage", "stake.view", "stake.manage", "users.view", "users.manage", "roles.manage");
  }

  return normalizePermissionSet(permissions);
}

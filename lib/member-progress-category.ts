import type { MemberProgressCategory } from "@/types/domain";

export const MEMBER_PROGRESS_CATEGORY_OPTIONS: Array<{
  value: MemberProgressCategory;
  label: string;
  description: string;
}> = [
  {
    value: "disconnected",
    label: "Desligado",
    description: "O membro não está em acompanhamento ativo.",
  },
  {
    value: "rescue",
    label: "Resgate",
    description: "Para membros afastados ou sem contato.",
  },
  {
    value: "follow_up",
    label: "Acompanhamento",
    description: "Para membros que precisam de cuidado contínuo.",
  },
  {
    value: "integration",
    label: "Integração",
    description: "Para ajudar membros a criarem vínculos com a ala.",
  },
  {
    value: "need",
    label: "Necessidade",
    description: "Para registrar ajudas práticas, familiares ou espirituais.",
  },
  {
    value: "missionary",
    label: "Missionário",
    description: "Para acompanhar convites, pesquisadores e amigos de membros.",
  },
];

export const memberProgressCategoryLabels = Object.fromEntries(
  MEMBER_PROGRESS_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<MemberProgressCategory, string>;

export const memberProgressCategoryDescriptions = Object.fromEntries(
  MEMBER_PROGRESS_CATEGORY_OPTIONS.map((option) => [option.value, option.description]),
) as Record<MemberProgressCategory, string>;

export function normalizeMemberProgressCategory(value: unknown): MemberProgressCategory {
  return MEMBER_PROGRESS_CATEGORY_OPTIONS.some((option) => option.value === value) ? (value as MemberProgressCategory) : "disconnected";
}

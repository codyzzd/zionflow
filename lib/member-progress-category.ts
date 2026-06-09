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

export const memberProgressCategoryBadgeClasses: Record<MemberProgressCategory, string> = {
  disconnected: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  rescue: "border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  follow_up: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  integration: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  need: "border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  missionary: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
};

export function normalizeMemberProgressCategory(value: unknown): MemberProgressCategory {
  return MEMBER_PROGRESS_CATEGORY_OPTIONS.some((option) => option.value === value) ? (value as MemberProgressCategory) : "disconnected";
}

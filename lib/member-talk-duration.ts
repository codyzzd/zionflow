import type { Member } from "@/types/domain";

export const TALK_DURATION_OPTIONS: Array<{ value: Member["sacramentTalkDuration"]; label: string; shortLabel: string }> = [
  { value: "not_designable", label: "Não designável", shortLabel: "Não designável" },
  { value: "5", label: "5 minutos", shortLabel: "5 min" },
  { value: "10", label: "10 minutos", shortLabel: "10 min" },
  { value: "15", label: "15 minutos", shortLabel: "15 min" },
];

export const talkDurationLabels: Record<Member["sacramentTalkDuration"], string> = TALK_DURATION_OPTIONS.reduce(
  (labels, option) => ({ ...labels, [option.value]: option.label }),
  {} as Record<Member["sacramentTalkDuration"], string>,
);

export const talkDurationShortLabels: Record<Member["sacramentTalkDuration"], string> = TALK_DURATION_OPTIONS.reduce(
  (labels, option) => ({ ...labels, [option.value]: option.shortLabel }),
  {} as Record<Member["sacramentTalkDuration"], string>,
);

export function normalizeTalkDuration(value: unknown): Member["sacramentTalkDuration"] {
  return value === "5" || value === "10" || value === "15" || value === "not_designable" ? value : "not_designable";
}

export function canSpeakWithTalkDuration(value: Member["sacramentTalkDuration"]) {
  return value !== "not_designable";
}

export function formatTalkDurationForSpeakerOption(value: Member["sacramentTalkDuration"]) {
  return value === "not_designable" ? talkDurationLabels.not_designable : talkDurationShortLabels[value];
}

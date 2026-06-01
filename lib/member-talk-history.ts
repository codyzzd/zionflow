import { normalizeDateInput } from "@/lib/utils";
import type { SacramentMinute } from "@/types/domain";

export type MemberTalkHistory = {
  lastTalkDate: string;
  lastTalkMinuteId: string;
  summary: string;
};

export type MemberTalkOccurrence = {
  date: string;
  minuteId: string;
  speakerLabel: "Primeiro" | "Segundo" | "Terceiro";
  theme: string;
};

const DAY_IN_MS = 86400000;
const APP_TIME_ZONE = "America/Fortaleza";
const SPEAKER_FIELDS = [
  { key: "speaker1", label: "Primeiro", themeKey: "speaker1Theme" },
  { key: "speaker2", label: "Segundo", themeKey: "speaker2Theme" },
  { key: "speaker3", label: "Terceiro", themeKey: "speaker3Theme" },
] as const;

function currentAppDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function parseDateParts(date: string) {
  const normalizedDate = normalizeDateInput(date);
  const match = normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return undefined;

  return {
    date: normalizedDate,
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonths(parts: { year: number; month: number; day: number }, months: number) {
  const monthIndex = parts.month - 1 + months;
  const year = parts.year + Math.floor(monthIndex / 12);
  const month = ((monthIndex % 12) + 12) % 12 + 1;
  const day = Math.min(parts.day, daysInMonth(year, month));

  return { year, month, day };
}

function datePartsToTime(parts: { year: number; month: number; day: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function formatDurationPart(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatMemberTalkRecency(lastTalkDate: string, today = currentAppDate()) {
  const lastTalkParts = parseDateParts(lastTalkDate);
  const todayParts = parseDateParts(today);

  if (!lastTalkParts || !todayParts) return "";
  if (lastTalkParts.date > todayParts.date) return "";
  if (lastTalkParts.date === todayParts.date) return "Hoje";

  const wholeMonths =
    (todayParts.year - lastTalkParts.year) * 12 +
    todayParts.month -
    lastTalkParts.month -
    (todayParts.day < lastTalkParts.day ? 1 : 0);
  const monthAnchor = addMonths(lastTalkParts, Math.max(wholeMonths, 0));
  const remainingDays = Math.round((datePartsToTime(todayParts) - datePartsToTime(monthAnchor)) / DAY_IN_MS);

  if (wholeMonths <= 0) return formatDurationPart(remainingDays, "dia", "dias");

  const monthLabel = formatDurationPart(wholeMonths, "mês", "meses");
  if (remainingDays <= 0) return monthLabel;

  return `${monthLabel} e ${formatDurationPart(remainingDays, "dia", "dias")}`;
}

export function buildMemberTalkHistory(minutes: SacramentMinute[], today = currentAppDate()) {
  const normalizedToday = normalizeDateInput(today);
  const historyByMemberId = new Map<string, MemberTalkHistory>();

  if (!normalizedToday) return historyByMemberId;

  minutes.forEach((minute) => {
    const minuteDate = normalizeDateInput(minute.date);
    if (!minuteDate || minuteDate > normalizedToday) return;

    SPEAKER_FIELDS.forEach((field) => {
      const speaker = minute.form[field.key];
      if (speaker.mode !== "linked" || !speaker.linkedId) return;

      const current = historyByMemberId.get(speaker.linkedId);
      if (current && current.lastTalkDate >= minuteDate) return;

      historyByMemberId.set(speaker.linkedId, {
        lastTalkDate: minuteDate,
        lastTalkMinuteId: minute.id,
        summary: formatMemberTalkRecency(minuteDate, normalizedToday),
      });
    });
  });

  return historyByMemberId;
}

export function buildMemberTalkOccurrences(minutes: SacramentMinute[]) {
  const occurrencesByMemberId = new Map<string, MemberTalkOccurrence[]>();

  minutes.forEach((minute) => {
    const minuteDate = normalizeDateInput(minute.date);
    if (!minuteDate) return;

    SPEAKER_FIELDS.forEach((field) => {
      const speaker = minute.form[field.key];
      if (speaker.mode !== "linked" || !speaker.linkedId) return;

      const occurrences = occurrencesByMemberId.get(speaker.linkedId) ?? [];
      occurrences.push({
        date: minuteDate,
        minuteId: minute.id,
        speakerLabel: field.label,
        theme: minute.form[field.themeKey].trim(),
      });
      occurrencesByMemberId.set(speaker.linkedId, occurrences);
    });
  });

  occurrencesByMemberId.forEach((occurrences) => {
    occurrences.sort((a, b) => b.date.localeCompare(a.date));
  });

  return occurrencesByMemberId;
}

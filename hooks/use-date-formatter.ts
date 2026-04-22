"use client";

import { useAppContext } from "@/components/providers/app-provider";
import { normalizeDateInput } from "@/lib/utils";

const APP_LOCALE = "pt-BR";
const APP_TIME_ZONE = "America/Fortaleza";

export function useDateFormatter() {
  const { appPreferences } = useAppContext();
  const dateStyle = appPreferences.dateFormat;

  function formatDate(date: string) {
    const normalizedDate = normalizeDateInput(date);
    if (!normalizedDate) return "Data inválida";

    const dateObj = new Date(`${normalizedDate}T12:00:00`);

    if (dateStyle === "medium") {
      const day = dateObj.getDate();
      const month = new Intl.DateTimeFormat(APP_LOCALE, { month: "short" }).format(dateObj).replace(".", "");
      const year = dateObj.getFullYear();
      return `${day} ${month} ${year}`;
    }

    return new Intl.DateTimeFormat(APP_LOCALE, {
      dateStyle,
      timeZone: APP_TIME_ZONE,
    }).format(dateObj);
  }

  function formatDateTime(date: string) {
    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) return "Data inválida";

    return new Intl.DateTimeFormat(APP_LOCALE, {
      dateStyle: dateStyle === "long" ? "long" : "short",
      timeStyle: "short",
      timeZone: APP_TIME_ZONE,
    }).format(parsedDate);
  }

  return { formatDate, formatDateTime };
}

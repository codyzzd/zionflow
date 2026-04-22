import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

const APP_LOCALE = "pt-BR"
const APP_TIME_ZONE = "America/Fortaleza"
const DAY_IN_MS = 86400000

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function toDateOnly(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return ""
  }

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
}

function normalizeYear(value: string) {
  if (value.length !== 2) return Number(value)

  const year = Number(value)
  return year >= 30 ? 1900 + year : 2000 + year
}

export function normalizeDateInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ""

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (isoMatch) {
    return toDateOnly(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
  }

  const yearFirstMatch = trimmed.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})(?:\D.*)?$/)
  if (yearFirstMatch) {
    return toDateOnly(Number(yearFirstMatch[1]), Number(yearFirstMatch[2]), Number(yearFirstMatch[3]))
  }

  const delimitedMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?:\D.*)?$/)
  if (delimitedMatch) {
    const first = Number(delimitedMatch[1])
    const second = Number(delimitedMatch[2])
    const year = normalizeYear(delimitedMatch[3])
    const dayFirst = toDateOnly(year, second, first)

    return dayFirst || toDateOnly(year, first, second)
  }

  const serial = Number(trimmed.replace(",", "."))
  if (Number.isInteger(serial) && serial >= 20000 && serial <= 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * DAY_IN_MS)

    return toDateOnly(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ""

  return toDateOnly(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

export function formatDate(date: string) {
  const normalizedDate = normalizeDateInput(date)
  if (!normalizedDate) return "Data inválida"

  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(`${normalizedDate}T12:00:00`))
}

export function formatDateTime(date: string) {
  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return "Data inválida"

  return new Intl.DateTimeFormat(APP_LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(parsedDate)
}

export function formatRelativeDay(date: string) {
  const normalizedDate = normalizeDateInput(date)
  if (!normalizedDate) return "Data inválida"

  const target = new Date(`${normalizedDate}T12:00:00`)
  const today = new Date()
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const compare = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const diffDays = Math.round((compare - current) / 86400000)

  if (diffDays === 0) return "Hoje"
  if (diffDays === 1) return "Amanhã"
  if (diffDays === -1) return "Ontem"

  return new Intl.DateTimeFormat(APP_LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(target)
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

export function nowIso() {
  return new Date().toISOString()
}

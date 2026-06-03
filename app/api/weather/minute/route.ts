import { NextResponse, type NextRequest } from "next/server";

import type { MinuteWeatherSnapshot } from "@/types/domain";

const APP_TIME_ZONE = "America/Fortaleza";

type OpenMeteoWeatherResponse = {
  daily?: {
    time?: string[];
    temperature_2m_min?: Array<number | null>;
    temperature_2m_mean?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    precipitation?: Array<number | null>;
  };
};

function parseCoordinate(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return value;
}

function todayDateInAppTimeZone() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}

function parseMeetingTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return undefined;

  const [hours = "", minutes = ""] = value.split(":");
  const hour = Number(hours);
  const minute = Number(minutes);

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;

  return value;
}

function firstNumber(values: Array<number | null> | undefined) {
  const value = values?.[0];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function findHourlyIndex(times: string[] | undefined, date: string, meetingTime: string) {
  if (!times?.length) return -1;

  const target = new Date(`${date}T${meetingTime}:00`).getTime();
  if (!Number.isFinite(target)) return -1;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const current = new Date(`${time}:00`).getTime();
    const distance = Math.abs(current - target);

    if (Number.isFinite(distance) && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function numberAt(values: Array<number | null> | undefined, index: number) {
  const value = index >= 0 ? values?.[index] : undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function rainLevel(precipitationMm?: number): MinuteWeatherSnapshot["rainLevel"] {
  if (precipitationMm === undefined || precipitationMm < 0.1) return "sem chuva";
  if (precipitationMm < 2.5) return "chuva fraca";
  if (precipitationMm < 10) return "chuva moderada";
  return "chuva forte";
}

function openMeteoRequestForDate(date: string) {
  const isForecast = date >= todayDateInAppTimeZone();
  const sourceType = isForecast ? "forecast" : "archive";
  const url = new URL(isForecast ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive");

  return { sourceType, url };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenMeteo(url: URL) {
  let lastDetails = "";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url).catch(() => null);

    if (response?.ok) return { response };

    lastStatus = response?.status;
    lastDetails = (await response?.text().catch(() => "")) ?? "";

    if (response && response.status < 500) break;
    if (attempt < 3) await wait(350 * attempt);
  }

  return { details: lastDetails, response: null, status: lastStatus };
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { date?: unknown; latitude?: unknown; longitude?: unknown; meetingTime?: unknown } | null;
  const date = parseDate(body?.date);
  const latitude = parseCoordinate(body?.latitude);
  const longitude = parseCoordinate(body?.longitude);
  const meetingTime = parseMeetingTime(body?.meetingTime);

  if (!date || latitude === undefined || longitude === undefined || !meetingTime) {
    return NextResponse.json({ error: "Informe data, latitude, longitude e horário da reunião para buscar o clima." }, { status: 400 });
  }

  const { sourceType, url } = openMeteoRequestForDate(date);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("daily", "temperature_2m_min,temperature_2m_mean,temperature_2m_max,precipitation_sum");
  url.searchParams.set("hourly", "temperature_2m,precipitation");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("precipitation_unit", "mm");

  const { details, response, status } = await fetchOpenMeteo(url);

  if (!response?.ok) {
    console.error("Open-Meteo weather request failed.", {
      date,
      details: details?.slice(0, 500),
      sourceType,
      status,
    });

    return NextResponse.json({ error: "O serviço de clima não respondeu agora." }, { status: 502 });
  }

  const data = (await response.json().catch(() => null)) as OpenMeteoWeatherResponse | null;
  const daily = data?.daily;
  const hourly = data?.hourly;
  const hourlyIndex = findHourlyIndex(hourly?.time, date, meetingTime);
  const precipitationMm = numberAt(hourly?.precipitation, hourlyIndex) ?? firstNumber(daily?.precipitation_sum);
  const temperatureAtMeetingC = numberAt(hourly?.temperature_2m, hourlyIndex);
  const weather: MinuteWeatherSnapshot = {
    source: "open-meteo",
    fetchedAt: new Date().toISOString(),
    latitude,
    longitude,
    meetingTime,
    temperatureMinC: firstNumber(daily?.temperature_2m_min),
    temperatureMeanC: temperatureAtMeetingC ?? firstNumber(daily?.temperature_2m_mean),
    temperatureMaxC: firstNumber(daily?.temperature_2m_max),
    precipitationMm,
    rainLevel: rainLevel(precipitationMm),
  };

  return NextResponse.json({ weather });
}

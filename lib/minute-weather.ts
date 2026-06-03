import type { MinuteWeatherSnapshot, Ward } from "@/types/domain";

export const WARD_WEATHER_REQUIRED_MESSAGE = "Informe latitude, longitude e horário da reunião no cadastro da ala para buscar o clima da ata.";

export function hasWardWeatherSettings(ward: Ward | undefined): ward is Ward & { latitude: number; longitude: number; meetingTime: string } {
  return Boolean(
    ward &&
      typeof ward.latitude === "number" &&
      Number.isFinite(ward.latitude) &&
      typeof ward.longitude === "number" &&
      Number.isFinite(ward.longitude) &&
      /^\d{2}:\d{2}$/.test(ward.meetingTime),
  );
}

export async function fetchMinuteWeather(date: string, ward: Ward | undefined): Promise<MinuteWeatherSnapshot> {
  if (!hasWardWeatherSettings(ward)) {
    throw new Error(WARD_WEATHER_REQUIRED_MESSAGE);
  }

  const response = await fetch("/api/weather/minute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      date,
      latitude: ward.latitude,
      longitude: ward.longitude,
      meetingTime: ward.meetingTime,
    }),
  });
  const payload = (await response.json().catch(() => null)) as { error?: string; weather?: MinuteWeatherSnapshot } | null;

  if (!response.ok || !payload?.weather) {
    throw new Error(payload?.error ?? "Não foi possível buscar o clima da ata.");
  }

  return payload.weather;
}

export function formatTemperature(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} C` : "-";
}

export function formatPrecipitation(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm` : "-";
}

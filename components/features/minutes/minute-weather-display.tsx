"use client";

import { Droplets, Thermometer } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MinuteWeatherSnapshot } from "@/types/domain";

type RainIntensity = 0 | 1 | 2 | 3;

function formatTemperatureShort(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : "-";
}

function formatPrecipitationShort(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm` : "-";
}

function temperatureToneClass(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "bg-muted text-muted-foreground ring-muted-foreground/15 [&>svg]:text-muted-foreground";
  }

  if (value <= 22) {
    return "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300 [&>svg]:text-sky-500";
  }

  if (value <= 27) {
    return "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300 [&>svg]:text-amber-500";
  }

  if (value <= 31) {
    return "bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300 [&>svg]:text-orange-500";
  }

  return "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300 [&>svg]:text-red-500";
}

function rainIntensity(weather: MinuteWeatherSnapshot): RainIntensity {
  if (weather.rainLevel === "sem chuva") return 0;
  if (weather.rainLevel === "chuva fraca") return 1;
  if (weather.rainLevel === "chuva moderada") return 2;
  if (weather.rainLevel === "chuva forte") return 3;

  const precipitation = weather.precipitationMm;
  if (typeof precipitation !== "number" || !Number.isFinite(precipitation) || precipitation <= 0) return 0;
  if (precipitation <= 2) return 1;
  if (precipitation <= 10) return 2;
  return 3;
}

export function MinuteWeatherDisplay({ className, weather }: { className?: string; weather: MinuteWeatherSnapshot | undefined }) {
  if (!weather) return <span className={className}>-</span>;

  const intensity = rainIntensity(weather);

  return (
    <div className={cn("flex min-w-max items-center gap-1.5 whitespace-nowrap", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium tabular-nums ring-1",
          temperatureToneClass(weather.temperatureMeanC),
        )}
        title="Temperatura média"
      >
        <Thermometer className="size-3.5 shrink-0" />
        {formatTemperatureShort(weather.temperatureMeanC)}
      </span>
      <span
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-700 tabular-nums ring-1 ring-blue-500/20 dark:text-blue-300 [&>svg]:text-blue-500"
        title="Chuva"
      >
        <Droplets className="size-3.5 shrink-0" />
        {formatPrecipitationShort(weather.precipitationMm)}
        <span className="ml-0.5 inline-flex h-3 items-end gap-0.5" aria-hidden="true">
          {[1, 2, 3].map((level) => (
            <span
              className={cn(
                "w-1 rounded-full transition-[background-color,opacity]",
                level === 1 ? "h-1.5" : level === 2 ? "h-2.5" : "h-3",
                level <= intensity ? "bg-blue-500 opacity-90" : "bg-blue-500/25 opacity-45",
              )}
              key={level}
            />
          ))}
        </span>
      </span>
    </div>
  );
}

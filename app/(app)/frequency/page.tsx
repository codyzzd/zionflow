"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Gauge, Minus, TrendingDown, TrendingUp, UsersRound, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { fetchMinuteWeather, WARD_WEATHER_REQUIRED_MESSAGE } from "@/lib/minute-weather";
import { cn, todayDate } from "@/lib/utils";
import type { SacramentMinute } from "@/types/domain";

const CHART_WIDTH = 1000;
const CHART_HEIGHT = 340;
const CHART_PADDING_TOP = 28;
const CHART_PADDING_RIGHT = 18;
const CHART_PADDING_BOTTOM = 76;
const CHART_PADDING_LEFT = 44;

type ChartPoint = {
  id: string;
  date: string;
  attendance: number;
  type: "real" | "projection";
  expected?: number;
  upper?: number;
  lower?: number;
  minute?: SacramentMinute;
};

function attendanceLabel(attendance: number) {
  return attendance > 0 ? attendance.toString() : "Pendente";
}

function averageAttendance(minutes: SacramentMinute[]) {
  const filled = minutes.filter((minute) => minute.form.attendance > 0);
  if (!filled.length) return 0;

  return Math.round(filled.reduce((total, minute) => total + minute.form.attendance, 0) / filled.length);
}

function attendanceChangePercent(minutes: SacramentMinute[]) {
  const [latest, previous] = minutes;
  if (!latest || !previous || previous.form.attendance <= 0) return null;

  return Math.round(((latest.form.attendance - previous.form.attendance) / previous.form.attendance) * 100);
}

function attendanceChangeLabel(percent: number | null) {
  if (percent === null) return "Sem base";
  if (percent !== 0) return "vs ata anterior";
  return "Sem mudança vs ata anterior";
}

function attendanceChangeValue(percent: number | null) {
  if (percent === null) return "-";
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function attendanceChangeToneClass(percent: number | null) {
  if (percent === null || percent === 0) return "text-foreground";
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-red-600 dark:text-red-400";
}

function attendanceShareLabel(attendance: number, activeMemberCount: number) {
  if (!activeMemberCount || attendance <= 0) return null;
  return `${attendanceSharePercentLabel(attendance, activeMemberCount)} dos frequentando`;
}

function attendanceSharePercentLabel(attendance: number, activeMemberCount: number) {
  if (!activeMemberCount || attendance <= 0) return null;
  return `${Math.round((attendance / activeMemberCount) * 100)}%`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextSundayDates(afterDate: string, count: number) {
  const date = new Date(`${afterDate}T12:00:00`);
  const daysUntilSunday = (7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilSunday);

  return Array.from({ length: count }, (_, index) => {
    const sunday = new Date(date);
    sunday.setDate(date.getDate() + index * 7);
    return toDateInputValue(sunday);
  });
}

function linearRegression(minutes: SacramentMinute[]) {
  if (!minutes.length) return { intercept: 0, residualStdDev: 0, slope: 0 };
  if (minutes.length === 1) return { intercept: minutes[0].form.attendance, residualStdDev: 0, slope: 0 };

  const points = minutes.map((minute, index) => ({ x: index, y: minute.form.attendance }));
  const xAverage = points.reduce((total, point) => total + point.x, 0) / points.length;
  const yAverage = points.reduce((total, point) => total + point.y, 0) / points.length;
  const numerator = points.reduce((total, point) => total + (point.x - xAverage) * (point.y - yAverage), 0);
  const denominator = points.reduce((total, point) => total + (point.x - xAverage) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yAverage - slope * xAverage;
  const residuals = points.map((point) => point.y - (intercept + slope * point.x));
  const residualVariance = residuals.reduce((total, residual) => total + residual ** 2, 0) / Math.max(1, residuals.length - 1);

  return { intercept, residualStdDev: Math.sqrt(residualVariance), slope };
}

function projectedAttendanceScenarios(minutes: SacramentMinute[], count: number) {
  if (!minutes.length) return [];

  const { intercept, residualStdDev, slope } = linearRegression(minutes);
  const average = averageAttendance(minutes);
  const minimumScenarioGap = Math.max(3, Math.round(average * 0.08));

  return Array.from({ length: count }, (_, index) => {
    const step = index + 1;
    const normal = Math.max(0, Math.round(intercept + slope * (minutes.length + index)));
    const uncertainty = Math.max(minimumScenarioGap, Math.round(residualStdDev * Math.sqrt(step) * 0.85));

    return {
      normal,
      lower: Math.max(0, normal - uncertainty),
      upper: Math.max(0, normal + uncertainty),
    };
  });
}

function predictedAttendanceFromPrevious(minutes: SacramentMinute[]) {
  if (minutes.length < 2) return null;

  const { intercept, slope } = linearRegression(minutes);
  return Math.max(0, Math.round(intercept + slope * minutes.length));
}

function retrospectiveAttendanceComparisons(minutes: SacramentMinute[]) {
  const comparisons = new Map<string, { delta: number; predicted: number }>();
  const filled = [...minutes]
    .filter((minute) => minute.form.attendance > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  filled.forEach((minute, index) => {
    const predicted = predictedAttendanceFromPrevious(filled.slice(0, index));
    if (predicted === null) return;

    comparisons.set(minute.id, {
      delta: minute.form.attendance - predicted,
      predicted,
    });
  });

  return comparisons;
}

function predictionDeltaLabel(delta: number) {
  if (delta > 0) return `+${delta} acima`;
  if (delta < 0) return `${delta} abaixo`;
  return "no previsto";
}

function predictionDeltaToneClass(delta: number) {
  if (delta > 0) return "text-emerald-600 dark:text-emerald-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

function buildLinePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function buildAreaPath(points: Array<{ lowerY?: number; upperY?: number; x: number }>) {
  const filledPoints = points.filter((point): point is { lowerY: number; upperY: number; x: number } => typeof point.lowerY === "number" && typeof point.upperY === "number");
  if (!filledPoints.length) return "";

  const upperPath = filledPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.upperY.toFixed(2)}`).join(" ");
  const lowerPath = [...filledPoints]
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.lowerY.toFixed(2)}`)
    .join(" ");

  return `${upperPath} ${lowerPath} Z`;
}

function formatTemperatureShort(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : "-";
}

function formatPrecipitationShort(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm` : "-";
}

function chartTooltip(point: ChartPoint, dateLabel: string) {
  const details = [`${dateLabel}`, `Frequência: ${point.attendance}`];
  if (point.type === "projection") {
    details[1] = `Previsão: ${point.attendance}`;
    if (typeof point.lower === "number" && typeof point.upper === "number") details.push(`Faixa provável: ${point.lower} a ${point.upper}`);
    if (typeof point.expected === "number") details.push(`Frequência esperada: ${point.expected}`);
    return details.join("\n");
  }

  const weather = point.minute?.form.weather;
  if (weather) {
    details.push(`Temperatura: ${formatTemperatureShort(weather.temperatureMeanC)}`);
    details.push(`Chuva: ${formatPrecipitationShort(weather.precipitationMm)}`);
  }

  return details.join("\n");
}

function predictedTrendSummary(projections: ChartPoint[]) {
  const projectedPoints = projections.filter((point) => point.type === "projection");
  if (projectedPoints.length < 2) return "Tendência prevista: sem base suficiente";

  const first = projectedPoints[0].attendance;
  const last = projectedPoints.at(-1)?.attendance ?? first;
  const delta = last - first;

  if (delta >= 4) return "Tendência prevista: alta provável";
  if (delta <= -4) return "Tendência prevista: queda provável";
  if (delta > 0) return "Tendência prevista: estabilidade com leve chance de alta";
  if (delta < 0) return "Tendência prevista: estabilidade com leve chance de queda";
  return "Tendência prevista: estabilidade";
}

function projectionConfidenceLabel(realCount: number, residualStdDev: number, average: number) {
  if (realCount < 3) return "baixa";
  if (!average || residualStdDev / average > 0.18) return "baixa";
  if (residualStdDev / average > 0.1) return "média";
  return "alta";
}

function predictedTrendTone(label: string) {
  if (label.includes("alta")) {
    return {
      card: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
      icon: TrendingUp,
      iconWrap: "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
    };
  }

  if (label.includes("queda")) {
    return {
      card: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
      icon: TrendingDown,
      iconWrap: "bg-red-100 text-red-700 ring-red-300 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25",
    };
  }

  return {
    card: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300",
    icon: Minus,
    iconWrap: "bg-sky-100 text-sky-700 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  };
}

function confidenceTone(label: string) {
  if (label === "alta") {
    return {
      card: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
      iconWrap: "bg-emerald-100 text-emerald-700 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
    };
  }

  if (label === "baixa") {
    return {
      card: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
      iconWrap: "bg-red-100 text-red-700 ring-red-300 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/25",
    };
  }

  return {
    card: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
    iconWrap: "bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
  };
}

function sentenceCase(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1) : value;
}

export default function FrequencyPage() {
  const { currentWard, hasPermission, membersByWard, minutesByWard, saveMinute } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageFrequency = hasPermission("frequency.manage");

  function chartDateLabel(date: string) {
    const [year, month, day] = date.split("-");
    return day && month && year ? `${day}/${month}/${year}` : formatDate(date);
  }

  function chartDateParts(date: string) {
    const [year, month, day] = date.split("-");
    return day && month && year ? [`${day}/${month}`, year] : [formatDate(date), ""];
  }

  const [search, setSearch] = useState("");
  const [selectedMinuteId, setSelectedMinuteId] = useState<string | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState("");

  const sortedMinutes = useMemo(
    () => [...minutesByWard].sort((a, b) => b.date.localeCompare(a.date)),
    [minutesByWard],
  );
  const filteredMinutes = useMemo(
    () =>
      sortedMinutes.filter((minute) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;

        return `${formatDate(minute.date)} ${minute.title} ${attendanceLabel(minute.form.attendance)}`
          .toLowerCase()
          .includes(query);
      }),
    [formatDate, search, sortedMinutes],
  );

  const selectedMinute = selectedMinuteId ? minutesByWard.find((minute) => minute.id === selectedMinuteId) : undefined;
  const activeMemberCount = membersByWard.filter((member) => member.churchActivityStatus === "attending").length;
  const filledMinutes = sortedMinutes.filter((minute) => minute.form.attendance > 0);
  const pendingMinutes = sortedMinutes.filter((minute) => minute.form.attendance === 0 && minute.date <= todayDate());
  const lastFilledMinute = filledMinutes[0];
  const attendanceChangePercentValue = attendanceChangePercent(filledMinutes);
  const realTrendMinutes = [...filledMinutes].reverse();
  const visibleRealTrendMinutes = realTrendMinutes.slice(-8);
  const projectionDates = lastFilledMinute ? nextSundayDates(lastFilledMinute.date, 4) : [];
  const projectionValues = projectedAttendanceScenarios(realTrendMinutes, 4);
  const nextProjectionShareLabel = projectionValues[0] ? attendanceShareLabel(projectionValues[0].normal, activeMemberCount) : null;
  const expectedAttendance = averageAttendance(realTrendMinutes);
  const { residualStdDev } = linearRegression(realTrendMinutes);
  const attendanceComparisons = useMemo(() => retrospectiveAttendanceComparisons(sortedMinutes), [sortedMinutes]);
  const trendData: ChartPoint[] = [
    ...visibleRealTrendMinutes.map((minute) => ({
      id: minute.id,
      date: minute.date,
      attendance: minute.form.attendance,
      expected: expectedAttendance,
      minute,
      type: "real" as const,
    })),
    ...projectionDates.map((date, index) => ({
      id: `projection-${date}`,
      date,
      attendance: projectionValues[index]?.normal ?? 0,
      expected: expectedAttendance,
      lower: projectionValues[index]?.lower ?? 0,
      upper: projectionValues[index]?.upper ?? 0,
      type: "projection" as const,
    })),
  ];
  const chartValues = trendData.flatMap((point) => [point.attendance, point.expected, point.upper, point.lower].filter((value): value is number => typeof value === "number"));
  const chartMinValue = Math.max(0, Math.min(...chartValues, 0) - 8);
  const chartMaxValue = Math.max(...chartValues, 1) + 8;
  const chartRange = Math.max(1, chartMaxValue - chartMinValue);
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const showInlineWeather = trendData.length <= 9;
  const chartCoordinates = trendData.map((point, index) => {
    const x = CHART_PADDING_LEFT + (trendData.length <= 1 ? chartInnerWidth / 2 : (index / (trendData.length - 1)) * chartInnerWidth);
    const toY = (value: number) => CHART_PADDING_TOP + ((chartMaxValue - value) / chartRange) * chartInnerHeight;

    return {
      ...point,
      x,
      y: toY(point.attendance),
      expectedY: typeof point.expected === "number" ? toY(point.expected) : undefined,
      lowerY: typeof point.lower === "number" ? toY(point.lower) : undefined,
      upperY: typeof point.upper === "number" ? toY(point.upper) : undefined,
    };
  });
  const realCoordinates = chartCoordinates.filter((point) => point.type === "real");
  const lastRealCoordinate = realCoordinates.at(-1);
  const projectionCoordinates = chartCoordinates.filter((point) => point.type === "projection");
  const projectionBaseCoordinates = lastRealCoordinate ? [lastRealCoordinate, ...projectionCoordinates] : projectionCoordinates;
  const realLinePath = buildLinePath(realCoordinates);
  const projectionLinePath = buildLinePath(projectionBaseCoordinates);
  const uncertaintyAreaPath = buildAreaPath(projectionCoordinates);
  const expectedLinePath = buildLinePath(chartCoordinates.filter((point) => typeof point.expectedY === "number").map((point) => ({ x: point.x, y: point.expectedY! })));
  const projectedRangeValues = projectionCoordinates.flatMap((point) => [point.lower, point.upper].filter((value): value is number => typeof value === "number"));
  const projectedRangeLabel = projectedRangeValues.length ? `${Math.min(...projectedRangeValues)} a ${Math.max(...projectedRangeValues)} pessoas` : "-";
  const confidenceLabel = projectionConfidenceLabel(realTrendMinutes.length, residualStdDev, expectedAttendance);
  const predictedTrendLabel = predictedTrendSummary(trendData);
  const predictedTrendDisplay = predictedTrendLabel.replace("Tendência prevista: ", "");
  const predictedTrendStyle = predictedTrendTone(predictedTrendLabel);
  const PredictedTrendIcon = predictedTrendStyle.icon;
  const confidenceStyle = confidenceTone(confidenceLabel);

  function openAttendanceDrawer(minute: SacramentMinute) {
    setSelectedMinuteId(minute.id);
    setAttendanceDraft(minute.form.attendance > 0 ? minute.form.attendance.toString() : "");
  }

  function closeAttendanceDrawer() {
    setSelectedMinuteId(null);
    setAttendanceDraft("");
  }

  async function saveAttendance() {
    if (!selectedMinute || !currentWard) return;

    const attendance = Math.max(0, Math.round(Number(attendanceDraft)));
    if (!Number.isFinite(attendance)) return;

    let weather = selectedMinute.form.weather;
    try {
      weather = await fetchMinuteWeather(selectedMinute.date, currentWard);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível buscar o clima da ata.";
      if (message === WARD_WEATHER_REQUIRED_MESSAGE) {
        toast.info(message);
      } else {
        toast.error(message);
      }
    }

    saveMinute({
      id: selectedMinute.id,
      wardId: currentWard.id,
      title: selectedMinute.title,
      date: selectedMinute.date,
      status: selectedMinute.status,
      presidency: selectedMinute.presidency,
      responsibleUserId: selectedMinute.responsibleUserId,
      form: {
        ...selectedMinute.form,
        attendance,
        weather,
      },
    });
    closeAttendanceDrawer();
  }

  const columns = useMemo<ColumnDef<SacramentMinute>[]>(
    () => [
      {
        accessorKey: "date",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Data {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (
          <TablePrimaryAction asChild>
            <Link href={`/meetings/${row.original.id}`}>{formatDate(row.original.date)}</Link>
          </TablePrimaryAction>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) =>
          row.original.form.attendance > 0 ? (
            <Badge variant="secondary">Preenchida</Badge>
          ) : (
            <Badge variant="outline">Pendente</Badge>
          ),
      },
      {
        id: "attendance",
        header: () => <div className="text-right">Frequência</div>,
        cell: ({ row }) => {
          const attendance = row.original.form.attendance;
          const comparison = attendanceComparisons.get(row.original.id);
          const shareLabel = attendanceShareLabel(attendance, activeMemberCount);

          if (attendance <= 0) {
            return <div className="text-right font-medium tabular-nums">{attendanceLabel(attendance)}</div>;
          }

          return (
            <div className="text-right">
              <p className="font-medium tabular-nums">{attendance}</p>
              {comparison ? (
                <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                  Previsto {comparison.predicted} · <span className={predictionDeltaToneClass(comparison.delta)}>{predictionDeltaLabel(comparison.delta)}</span>
                </p>
              ) : null}
              {shareLabel ? <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{shareLabel}</p> : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            {canManageFrequency ? (
              <TableActionButton label="Editar frequência" onClick={() => openAttendanceDrawer(row.original)}>
                <Pencil />
              </TableActionButton>
            ) : null}
            <TableActionButton asChild label="Abrir ata">
              <Link href={`/meetings/${row.original.id}`}>
                <ExternalLink />
              </Link>
            </TableActionButton>
          </div>
        ),
      },
    ],
    [activeMemberCount, attendanceComparisons, canManageFrequency, formatDate],
  );

  return (
    <PermissionGuard permission="frequency.view">
      <div className="min-w-0">
        <PageHeader
          eyebrow="Atas Sacramentais"
          title="Frequência"
          description="Área dedicada para preencher e acompanhar a frequência registrada em cada ata sacramental."
        />

        <div className="space-y-6">
          <div className="grid min-w-0 gap-3 md:grid-cols-3">
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Média</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{averageAttendance(sortedMinutes) || "-"}</p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">{filledMinutes.length} atas preenchidas</p>
            </div>
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Última</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{lastFilledMinute?.form.attendance || "-"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{lastFilledMinute ? formatDate(lastFilledMinute.date) : "Sem frequência"}</p>
              <p className={cn("mt-1 text-sm font-medium tabular-nums", attendanceChangeToneClass(attendanceChangePercentValue))}>
                {attendanceChangePercentValue === null || attendanceChangePercentValue === 0
                  ? attendanceChangeLabel(attendanceChangePercentValue)
                  : `${attendanceChangeValue(attendanceChangePercentValue)} ${attendanceChangeLabel(attendanceChangePercentValue)}`}
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Pendentes</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{pendingMinutes.length}</p>
              <p className="mt-1 text-sm text-muted-foreground">Atas passadas sem frequência</p>
            </div>
          </div>

          <div className="min-w-0 overflow-hidden rounded-lg bg-card p-4 ring-1 ring-border">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-base font-medium">Progresso da frequência</h2>
                <p className="text-sm text-muted-foreground">Histórico registrado e previsão provável para os próximos 4 domingos.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-5 rounded-full bg-primary" />
                  Frequência registrada
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-0 w-5 border-t-2 border-dashed border-primary" />
                  Previsão
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-5 rounded-full bg-primary/15 ring-1 ring-primary/20" />
                  Margem provável
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-0 w-5 border-t-2 border-dotted border-muted-foreground" />
                  Frequência esperada
                </span>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              {trendData.length ? (
                <div className="relative h-[320px] min-h-[300px] w-full md:h-[340px]">
                  <svg
                    aria-label="Gráfico de linha da frequência sacramental com projeções"
                    className="absolute inset-0 size-full overflow-visible"
                    preserveAspectRatio="none"
                    role="img"
                    viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  >
                    {[0, 1, 2, 3].map((tick) => {
                      const y = CHART_PADDING_TOP + (tick / 3) * chartInnerHeight;

                      return (
                        <g key={tick}>
                          <line
                            className="stroke-border"
                            strokeDasharray={tick === 3 ? undefined : "3 6"}
                            vectorEffect="non-scaling-stroke"
                            x1={CHART_PADDING_LEFT}
                            x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                            y1={y}
                            y2={y}
                          />
                        </g>
                      );
                    })}

                    {uncertaintyAreaPath ? (
                      <path className="fill-primary/15 stroke-primary/20" d={uncertaintyAreaPath} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    ) : null}
                    {lastRealCoordinate && projectionCoordinates.length ? (
                      <line
                        className="stroke-muted-foreground/30"
                        strokeDasharray="4 8"
                        vectorEffect="non-scaling-stroke"
                        x1={lastRealCoordinate.x}
                        x2={lastRealCoordinate.x}
                        y1={CHART_PADDING_TOP}
                        y2={CHART_HEIGHT - CHART_PADDING_BOTTOM + 8}
                      />
                    ) : null}
                    {expectedLinePath ? (
                      <path
                        className="fill-none stroke-muted-foreground/70"
                        d={expectedLinePath}
                        strokeDasharray="2 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {projectionLinePath ? (
                      <path
                        className="fill-none stroke-primary"
                        d={projectionLinePath}
                        strokeDasharray="6 7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}
                    {realLinePath ? (
                      <path className="fill-none stroke-primary" d={realLinePath} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                    ) : null}
                  </svg>

                  {[0, 1, 2, 3].map((tick) => {
                    const y = CHART_PADDING_TOP + (tick / 3) * chartInnerHeight;
                    const value = Math.round(chartMaxValue - (tick / 3) * chartRange);

                    return (
                      <span
                        className="pointer-events-none absolute left-0 -translate-y-1/2 text-[10px] text-muted-foreground tabular-nums"
                        key={tick}
                        style={{ top: `${(y / CHART_HEIGHT) * 100}%` }}
                      >
                        {value}
                      </span>
                    );
                  })}

                  {chartCoordinates.map((point) => {
                    const isProjection = point.type === "projection";
                    const pointDateLabel = chartDateLabel(point.date);
                    const pointTitle = chartTooltip(point, pointDateLabel);
                    const pointStyle = {
                      left: `${(point.x / CHART_WIDTH) * 100}%`,
                      top: `${(point.y / CHART_HEIGHT) * 100}%`,
                    };
                    const pointContent = (
                      <>
                        <span
                          className={cn(
                            "absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums",
                            isProjection ? "text-slate-700 dark:text-slate-200" : "text-foreground",
                          )}
                        >
                          {isProjection ? `Prev. ${point.attendance}` : point.attendance}
                        </span>
                        <span
                          className={cn(
                            "block rounded-full border-[2.5px] transition-[background-color,border-color,transform]",
                            isProjection ? "size-2.5 border-slate-500 bg-background dark:border-slate-300" : "size-3 border-background bg-primary",
                          )}
                        />
                      </>
                    );

                    return point.minute && canManageFrequency ? (
                      <button
                        aria-label={`Editar frequência de ${pointDateLabel}: ${point.attendance}`}
                        className="absolute z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
                        key={point.id}
                        onClick={() => openAttendanceDrawer(point.minute!)}
                        style={pointStyle}
                        title={pointTitle}
                        type="button"
                      >
                        {pointContent}
                      </button>
                    ) : (
                      <div
                        aria-label={`${pointDateLabel}: ${point.attendance}`}
                        className="absolute z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                        key={point.id}
                        role="img"
                        style={pointStyle}
                        title={pointTitle}
                      >
                        {pointContent}
                      </div>
                    );
                  })}

                  {chartCoordinates.map((point) => {
                    const isProjection = point.type === "projection";
                    const [dateLine, yearLine] = chartDateParts(point.date);
                    const weather = point.minute?.form.weather;

                    return (
                      <div
                        className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center text-center leading-none"
                        key={`axis-${point.id}`}
                        style={{ left: `${(point.x / CHART_WIDTH) * 100}%`, top: `${((CHART_HEIGHT - 42) / CHART_HEIGHT) * 100}%` }}
                      >
                        <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground tabular-nums">{dateLine}</span>
                        <span className="mt-1 whitespace-nowrap text-[9px] text-muted-foreground/80 tabular-nums">{isProjection ? "projeção" : yearLine}</span>
                        {showInlineWeather && weather ? (
                          <span className="mt-2 hidden whitespace-nowrap rounded-md bg-muted/70 px-1.5 py-0.5 text-[9px] text-muted-foreground tabular-nums md:inline">
                            {formatTemperatureShort(weather.temperatureMeanC)} | {formatPrecipitationShort(weather.precipitationMm)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex h-56 items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground">
                  Preencha a primeira frequência para gerar a linha de tendência.
                </div>
              )}
            </div>

            {projectionCoordinates.length ? (
              <div className="mt-4 grid gap-2 border-t border-border pt-4 text-sm md:grid-cols-2 xl:grid-cols-4">
                <div className={cn("flex items-center gap-3 rounded-md border px-3 py-2.5", predictedTrendStyle.card)}>
                  <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1", predictedTrendStyle.iconWrap)}>
                    <PredictedTrendIcon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-current/75">Tendência prevista</p>
                    <p className="mt-1 text-pretty text-base font-semibold leading-snug">{sentenceCase(predictedTrendDisplay)}</p>
                  </div>
                </div>
                <div className={cn("flex items-center gap-3 rounded-md border px-3 py-2.5", confidenceStyle.card)}>
                  <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1", confidenceStyle.iconWrap)}>
                    <Gauge className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-current/75">Confiança</p>
                    <p className="mt-1 text-base font-semibold">{sentenceCase(confidenceLabel)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-md border border-sky-300 bg-sky-50 px-3 py-2.5 text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 ring-1 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25">
                    <UsersRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-current/75">Membros frequentando</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{activeMemberCount || "-"}</p>
                    <p className="mt-0.5 truncate text-sm text-current/75">
                      {lastFilledMinute && activeMemberCount
                        ? `Última: ${lastFilledMinute.form.attendance} de ${activeMemberCount} · ${attendanceSharePercentLabel(lastFilledMinute.form.attendance, activeMemberCount)}`
                        : "Sem base de membros"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-md border border-cyan-300 bg-cyan-50 px-3 py-2.5 text-cyan-800 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-cyan-100 text-cyan-700 ring-1 ring-cyan-300 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/25">
                    <UsersRound className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-current/75">Faixa provável</p>
                    <p className="mt-1 text-base font-semibold tabular-nums">{projectedRangeLabel}</p>
                    <p className="mt-0.5 truncate text-sm text-current/75">
                      {projectionValues[0] ? `Próxima: ${projectionValues[0].normal}${nextProjectionShareLabel ? ` · ${attendanceSharePercentLabel(projectionValues[0].normal, activeMemberCount)}` : ""}` : "Sem próxima previsão"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <SearchInput
              className="md:max-w-lg"
              placeholder="Buscar por data, ata ou frequência"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <DataTable
              columns={columns}
              data={filteredMinutes}
              emptyMessage="Nenhuma ata encontrada com os filtros atuais."
              getRowId={(minute) => minute.id}
            />
          </div>
        </div>

        {canManageFrequency ? (
          <Drawer direction="right" open={Boolean(selectedMinute)} onOpenChange={(open) => !open && closeAttendanceDrawer()}>
            <DrawerContent className="sm:max-w-md" direction="right">
              <DrawerHeader className="border-b">
                <DrawerTitle>Editar frequência</DrawerTitle>
                <DrawerDescription>
                  {selectedMinute ? `${formatDate(selectedMinute.date)} - ${selectedMinute.title}` : "Atualize a frequência da ata selecionada."}
                </DrawerDescription>
              </DrawerHeader>

              <div className="flex-1 px-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="attendance">Frequência</Label>
                  <Input
                    id="attendance"
                    inputMode="numeric"
                    min={0}
                    placeholder="Ex.: 164"
                    type="number"
                    value={attendanceDraft}
                    onChange={(event) => setAttendanceDraft(event.target.value)}
                  />
                </div>
              </div>

              <DrawerFooter className="border-t bg-background">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeAttendanceDrawer} variant="ghost">
                    Cancelar
                  </Button>
                  <Button disabled={!selectedMinute || !attendanceDraft.trim()} onClick={saveAttendance}>
                    Salvar frequência
                  </Button>
                </div>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : null}
      </div>
    </PermissionGuard>
  );
}

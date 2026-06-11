"use client";

import { ArrowRight, CalendarDays, TrendingDown, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn, todayDate } from "@/lib/utils";
import type { LunchSchedule, MissionaryCompanionship, SacramentMinute, Weekday } from "@/types/domain";

const weekdaysByIndex: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const memberAttendanceMeta: Array<{
  key: "attending" | "not_attending";
  label: string;
  barClassName: string;
  textClassName: string;
}> = [
  {
    key: "attending",
    label: "Frequentando",
    barClassName: "bg-emerald-600",
    textClassName: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "not_attending",
    label: "Não frequentando",
    barClassName: "bg-red-600",
    textClassName: "text-red-700 dark:text-red-300",
  },
];

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthDates() {
  const currentDate = new Date(`${todayDate()}T12:00:00`);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return {
    dates: Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1)),
    label: new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "America/Fortaleza",
    }).format(currentDate),
  };
}

function calculateLunchCoverage(
  companionships: MissionaryCompanionship[],
  lunches: LunchSchedule[],
  pDayWeekday: Weekday,
) {
  const activeCompanionships = companionships.filter((companionship) => companionship.status === "active");
  const activeIds = new Set(activeCompanionships.map((companionship) => companionship.id));
  const { dates, label } = currentMonthDates();

  if (!activeCompanionships.length) {
    return { completeDays: 0, eligibleDays: 0, incompleteDays: 0, label, progressPercent: 0 };
  }

  const lunchesByDate = lunches.reduce<Map<string, LunchSchedule[]>>((map, lunch) => {
    const current = map.get(lunch.date) ?? [];
    map.set(lunch.date, [...current, lunch]);
    return map;
  }, new Map());

  const totals = dates.reduce(
    (result, date) => {
      if (weekdaysByIndex[date.getDay()] === pDayWeekday) return result;

      const coveredIds = new Set(
        (lunchesByDate.get(dateKey(date)) ?? [])
          .flatMap((lunch) => lunch.companionshipIds)
          .filter((companionshipId) => activeIds.has(companionshipId)),
      );
      const complete = activeCompanionships.every((companionship) => coveredIds.has(companionship.id));

      return {
        eligibleDays: result.eligibleDays + 1,
        completeDays: result.completeDays + (complete ? 1 : 0),
        incompleteDays: result.incompleteDays + (complete ? 0 : 1),
      };
    },
    { completeDays: 0, eligibleDays: 0, incompleteDays: 0 },
  );

  return {
    ...totals,
    label,
    progressPercent: totals.eligibleDays ? Math.round((totals.completeDays / totals.eligibleDays) * 100) : 0,
  };
}

function attendanceChange(minutes: SacramentMinute[]) {
  const [latest, previous] = minutes;
  if (!latest || !previous || previous.form.attendance <= 0) return null;
  return Math.round(((latest.form.attendance - previous.form.attendance) / previous.form.attendance) * 100);
}

function buildAttendanceChart(minutes: SacramentMinute[]) {
  const chronological = [...minutes].reverse();
  if (!chronological.length) return { path: "", points: [] };

  const values = chronological.map((minute) => minute.form.attendance);
  const padding = Math.max(4, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 0.06));
  const minimum = Math.max(0, Math.min(...values) - padding);
  const maximum = Math.max(...values) + padding;
  const range = Math.max(1, maximum - minimum);

  const points = chronological.map((minute, index) => ({
    minute,
    x: chronological.length === 1 ? 50 : 6 + (index / (chronological.length - 1)) * 88,
    y: 32 - ((minute.form.attendance - minimum) / range) * 24,
  }));

  return {
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
    points,
  };
}

function shortDate(date: string) {
  const [, month, day] = date.split("-");
  return day && month ? `${day}/${month}` : date;
}

function DashboardLinkCard({
  children,
  href,
  label,
  className,
}: {
  children: ReactNode;
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      aria-label={label}
      className={cn("group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2", className)}
      href={href}
    >
      <Card className="h-full transition-colors group-hover:border-primary/35">
        {children}
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const {
    companionshipsByWard,
    currentWard,
    lunchSchedulesByWard,
    membersByWard,
    minutesByWard,
  } = useAppContext();
  const { formatDate } = useDateFormatter();

  const memberAttendanceCounts = [
    membersByWard.filter((member) => member.churchActivityStatus === "attending").length,
    membersByWard.filter((member) => member.churchActivityStatus !== "attending").length,
  ];
  const memberAttendancePercentages = memberAttendanceCounts.map((count) =>
    membersByWard.length ? (count / membersByWard.length) * 100 : 0,
  );
  const lunchCoverage = calculateLunchCoverage(
    companionshipsByWard,
    lunchSchedulesByWard,
    currentWard?.lunchPDayWeekday ?? "monday",
  );
  const recentAttendance = [...minutesByWard]
    .filter((minute) => minute.form.attendance > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  const latestAttendance = recentAttendance[0];
  const change = attendanceChange(recentAttendance);
  const attendanceChart = buildAttendanceChart(recentAttendance);
  const ChangeIcon = change !== null && change < 0 ? TrendingDown : TrendingUp;

  return (
    <PermissionGuard permission="dashboard.view">
      <div>
        <PageHeader
          eyebrow="Dashboard"
          title={currentWard?.name ?? "Dashboard da Ala"}
          description="Visão rápida da participação dos membros, da cobertura dos almoços e da frequência sacramental."
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <DashboardLinkCard href="/members/attendance" label="Abrir frequência dos membros">
            <CardHeader className="grid-cols-[1fr_auto]">
              <div>
                <CardTitle>Frequência dos membros</CardTitle>
                <CardDescription>Status atual dos membros cadastrados</CardDescription>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <Users className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {membersByWard.length ? (
                <>
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-3xl font-semibold tabular-nums">{membersByWard.length}</p>
                      <p className="mt-1 text-sm text-muted-foreground">membros acompanhados</p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div
                    aria-label={`${memberAttendanceCounts[0]} frequentando; ${memberAttendanceCounts[1]} não frequentando`}
                    className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                  >
                    {memberAttendanceMeta.map((item, index) => (
                      <span
                        className={cn("h-full first:rounded-l-full last:rounded-r-full", item.barClassName)}
                        key={item.key}
                        style={{ width: `${memberAttendancePercentages[index]}%` }}
                      />
                    ))}
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {memberAttendanceMeta.map((item, index) => (
                      <div className="min-w-0 rounded-lg bg-muted/45 px-2 py-3 text-center" key={item.key}>
                        <div className={cn("text-xl font-semibold tabular-nums", item.textClassName)}>{memberAttendanceCounts[index]}</div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-44 flex-1 items-center justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                  Nenhum membro cadastrado para gerar o resumo.
                </div>
              )}
            </CardContent>
          </DashboardLinkCard>

          <DashboardLinkCard href="/lunch-calendar" label="Abrir calendário de almoços">
            <CardHeader className="grid-cols-[1fr_auto]">
              <div>
                <CardTitle>Almoços missionários</CardTitle>
                <CardDescription className="capitalize">Cobertura de {lunchCoverage.label}</CardDescription>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <CalendarDays className="size-5" />
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {companionshipsByWard.some((companionship) => companionship.status === "active") ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className={cn("text-3xl font-semibold tabular-nums", lunchCoverage.incompleteDays ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
                        {lunchCoverage.incompleteDays}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {lunchCoverage.incompleteDays === 1 ? "dia ainda está incompleto" : "dias ainda estão incompletos"}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="mt-auto pt-8">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Dias completos</span>
                      <span className="font-medium tabular-nums">
                        {lunchCoverage.completeDays} de {lunchCoverage.eligibleDays}
                      </span>
                    </div>
                    <div
                      aria-label={`${lunchCoverage.progressPercent}% dos dias disponíveis estão completos`}
                      className="h-3 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={lunchCoverage.progressPercent}
                    >
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width]"
                        style={{ width: `${lunchCoverage.progressPercent}%` }}
                      />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      P-DAY excluído. Um dia só fica completo quando todas as duplas ativas têm almoço.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex min-h-44 flex-1 items-center justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                  Nenhuma dupla ativa cadastrada para calcular a cobertura.
                </div>
              )}
            </CardContent>
          </DashboardLinkCard>

          <DashboardLinkCard className="xl:col-span-2" href="/frequency" label="Abrir frequência sacramental">
            <CardHeader className="grid-cols-[1fr_auto]">
              <div>
                <CardTitle>Frequência sacramental</CardTitle>
                <CardDescription>Últimos domingos com frequência preenchida</CardDescription>
              </div>
              <ArrowRight className="mt-2 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </CardHeader>
            <CardContent>
              {latestAttendance ? (
                <div className="grid gap-6 md:grid-cols-[220px_1fr] md:items-end">
                  <div>
                    <p className="text-4xl font-semibold tabular-nums">{latestAttendance.form.attendance}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(latestAttendance.date)}</p>
                    <div
                      className={cn(
                        "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
                        change === null || change === 0
                          ? "bg-muted text-muted-foreground"
                          : change > 0
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/10 text-red-600 dark:text-red-400",
                      )}
                    >
                      {change === null || change === 0 ? null : <ChangeIcon className="size-4" />}
                      {change === null ? "Sem domingo anterior" : change === 0 ? "Sem mudança" : `${change > 0 ? "+" : ""}${change}% vs domingo anterior`}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-lg bg-muted/35 px-3 pb-2 pt-3">
                    <div
                      aria-label={`Tendência das últimas ${recentAttendance.length} frequências preenchidas`}
                      className="relative h-40 w-full"
                      role="img"
                    >
                      <svg
                        aria-hidden="true"
                        className="absolute inset-0 size-full overflow-visible"
                        preserveAspectRatio="none"
                        viewBox="0 0 100 40"
                      >
                        <line className="stroke-border" strokeDasharray="2 3" strokeWidth="0.5" vectorEffect="non-scaling-stroke" x1="4" x2="96" y1="34" y2="34" />
                        <line className="stroke-border" strokeDasharray="2 3" strokeWidth="0.5" vectorEffect="non-scaling-stroke" x1="4" x2="96" y1="20" y2="20" />
                        <line className="stroke-border" strokeDasharray="2 3" strokeWidth="0.5" vectorEffect="non-scaling-stroke" x1="4" x2="96" y1="7" y2="7" />
                        {attendanceChart.path ? (
                          <path
                            className="fill-none stroke-primary"
                            d={attendanceChart.path}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.5"
                            vectorEffect="non-scaling-stroke"
                          />
                        ) : null}
                      </svg>

                      {attendanceChart.points.map((point, index) => {
                        const isLatest = index === attendanceChart.points.length - 1;

                        return (
                          <div
                            className="absolute z-10 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                            key={point.minute.id}
                            style={{ left: `${point.x}%`, top: `${(point.y / 40) * 100}%` }}
                            title={`${formatDate(point.minute.date)}: ${point.minute.form.attendance}`}
                          >
                            <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-foreground tabular-nums">
                              {point.minute.form.attendance}
                            </span>
                            <span
                              className={cn(
                                "block size-3 rounded-full border-[2.5px]",
                                isLatest ? "border-background bg-primary" : "border-primary bg-background",
                              )}
                            />
                          </div>
                        );
                      })}

                      {attendanceChart.points.map((point) => (
                        <span
                          className="pointer-events-none absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground tabular-nums"
                          key={`date-${point.minute.id}`}
                          style={{ left: `${point.x}%` }}
                        >
                          {shortDate(point.minute.date)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-44 items-center justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground">
                  Preencha a frequência de uma ata sacramental para visualizar a tendência.
                </div>
              )}
            </CardContent>
          </DashboardLinkCard>
        </div>
      </div>
    </PermissionGuard>
  );
}

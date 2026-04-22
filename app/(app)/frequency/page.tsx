"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn, todayDate } from "@/lib/utils";
import type { SacramentMinute } from "@/types/domain";

function attendanceLabel(attendance: number) {
  return attendance > 0 ? attendance.toString() : "Pendente";
}

function averageAttendance(minutes: SacramentMinute[]) {
  const filled = minutes.filter((minute) => minute.form.attendance > 0);
  if (!filled.length) return 0;

  return Math.round(filled.reduce((total, minute) => total + minute.form.attendance, 0) / filled.length);
}

function attendanceTrendPercent(minutes: SacramentMinute[]) {
  const [latest, previous] = minutes;
  if (!latest || !previous || previous.form.attendance <= 0) return null;

  return Math.round(((latest.form.attendance - previous.form.attendance) / previous.form.attendance) * 100);
}

function trendLabel(percent: number | null) {
  if (percent === null) return "Sem base";
  if (percent > 0) return `Crescendo ${percent}%`;
  if (percent < 0) return `Caindo ${Math.abs(percent)}%`;
  return "Estável";
}

function trendValue(percent: number | null) {
  if (percent === null) return "-";
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function trendToneClass(percent: number | null) {
  if (percent === null || percent === 0) return "text-foreground";
  if (percent > 0) return "text-emerald-600 dark:text-emerald-400";
  return "text-red-600 dark:text-red-400";
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

function projectedAttendances(minutes: SacramentMinute[], count: number) {
  if (!minutes.length) return [];
  if (minutes.length === 1) return Array.from({ length: count }, () => minutes[0].form.attendance);

  const points = minutes.map((minute, index) => ({ x: index, y: minute.form.attendance }));
  const xAverage = points.reduce((total, point) => total + point.x, 0) / points.length;
  const yAverage = points.reduce((total, point) => total + point.y, 0) / points.length;
  const numerator = points.reduce((total, point) => total + (point.x - xAverage) * (point.y - yAverage), 0);
  const denominator = points.reduce((total, point) => total + (point.x - xAverage) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yAverage - slope * xAverage;

  return Array.from({ length: count }, (_, index) => Math.max(0, Math.round(intercept + slope * (points.length + index))));
}

export default function FrequencyPage() {
  const { currentWard, hasPermission, minutesByWard, saveMinute } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageMinutes = hasPermission("minutes.manage");

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
  const filledMinutes = sortedMinutes.filter((minute) => minute.form.attendance > 0);
  const pendingMinutes = sortedMinutes.filter((minute) => minute.form.attendance === 0 && minute.date <= todayDate());
  const lastFilledMinute = filledMinutes[0];
  const trendPercent = attendanceTrendPercent(filledMinutes);
  const realTrendMinutes = [...filledMinutes].reverse();
  const visibleRealTrendMinutes = realTrendMinutes.slice(-8);
  const projectionDates = lastFilledMinute ? nextSundayDates(lastFilledMinute.date, 4) : [];
  const projectionValues = projectedAttendances(realTrendMinutes, 4);
  const trendData = [
    ...visibleRealTrendMinutes.map((minute) => ({
      id: minute.id,
      date: minute.date,
      attendance: minute.form.attendance,
      type: "real" as const,
    })),
    ...projectionDates.map((date, index) => ({
      id: `projection-${date}`,
      date,
      attendance: projectionValues[index] ?? 0,
      type: "projection" as const,
    })),
  ];
  const chartMaxAttendance = Math.max(...trendData.map((point) => point.attendance), 1);

  function openAttendanceDrawer(minute: SacramentMinute) {
    setSelectedMinuteId(minute.id);
    setAttendanceDraft(minute.form.attendance > 0 ? minute.form.attendance.toString() : "");
  }

  function closeAttendanceDrawer() {
    setSelectedMinuteId(null);
    setAttendanceDraft("");
  }

  function saveAttendance() {
    if (!selectedMinute || !currentWard) return;

    const attendance = Math.max(0, Math.round(Number(attendanceDraft)));
    if (!Number.isFinite(attendance)) return;

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
        cell: ({ row }) => formatDate(row.original.date),
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
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums">{attendanceLabel(row.original.form.attendance)}</div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {canManageMinutes ? (
              <Button onClick={() => openAttendanceDrawer(row.original)} size="sm" variant="ghost">
                Editar
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${row.original.id}`}>Abrir ata</Link>
            </Button>
          </div>
        ),
      },
    ],
    [canManageMinutes, formatDate],
  );

  return (
    <PermissionGuard permission="minutes.view">
      <div className="min-w-0">
        <PageHeader
          eyebrow="Atas Sacramentais"
          title="Frequência"
          description="Área dedicada para preencher e acompanhar a frequência registrada em cada ata sacramental."
        />

        <div className="space-y-6">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Média</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{averageAttendance(sortedMinutes) || "-"}</p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">{filledMinutes.length} atas preenchidas</p>
            </div>
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Última</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{lastFilledMinute?.form.attendance || "-"}</p>
              <p className="mt-1 text-sm text-muted-foreground">{lastFilledMinute ? formatDate(lastFilledMinute.date) : "Sem frequência"}</p>
            </div>
            <div className="min-w-0 rounded-lg bg-card p-4 ring-1 ring-border">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Tendência</p>
              <p className={cn("mt-2 text-3xl font-semibold tabular-nums", trendToneClass(trendPercent))}>{trendValue(trendPercent)}</p>
              <p className={cn("mt-1 text-sm", trendToneClass(trendPercent))}>{trendLabel(trendPercent)} vs ata anterior</p>
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
                <p className="text-sm text-muted-foreground">Trajeto real das últimas atas preenchidas e projeção para os próximos 4 domingos.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm bg-primary" />
                  Real
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm border border-dashed border-muted-foreground bg-muted-foreground/20" />
                  Projeção
                </span>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              {trendData.length ? (
                <div className="flex h-72 items-end gap-2 border-b border-border pb-2 md:gap-3">
                  {trendData.map((point) => {
                    const height = Math.max(8, (point.attendance / chartMaxAttendance) * 100);
                    const [dateLine, yearLine] = chartDateParts(point.date);
                    const minute = point.type === "real" ? minutesByWard.find((item) => item.id === point.id) : undefined;
                    const isEditable = canManageMinutes && Boolean(minute);
                    const chartColumn = (
                      <>
                        <p className="text-xs font-medium tabular-nums md:text-sm">{point.attendance}</p>
                        <div className="flex h-40 w-full items-end rounded-md bg-muted/50 px-1.5 py-1.5 md:h-44 md:px-2 md:py-2">
                          <div
                            aria-hidden="true"
                            className={cn(
                              "w-full rounded-sm transition-[height,background-color,border-color]",
                              point.type === "real"
                                ? "bg-primary"
                                : "border border-dashed border-muted-foreground bg-muted-foreground/20",
                            )}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                        <div className="text-center text-[10px] leading-3 text-muted-foreground tabular-nums md:text-xs md:leading-4">
                          <p>{dateLine}</p>
                          {yearLine ? <p>{yearLine}</p> : null}
                        </div>
                      </>
                    );

                    return isEditable && minute ? (
                      <button
                        aria-label={`Editar frequência de ${chartDateLabel(point.date)}: ${point.attendance}`}
                        className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md transition-transform hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
                        key={point.id}
                        onClick={() => openAttendanceDrawer(minute)}
                        type="button"
                      >
                        {chartColumn}
                      </button>
                    ) : (
                      <div
                        aria-label={`${chartDateLabel(point.date)}: ${point.attendance}`}
                        className="flex min-w-0 flex-1 flex-col items-center gap-2"
                        key={point.id}
                      >
                        {chartColumn}
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
          </div>

          <div className="space-y-4">
            <Input
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

        {canManageMinutes ? (
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

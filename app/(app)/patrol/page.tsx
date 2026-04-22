"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsUpDown, Pencil, Plus, X } from "lucide-react";
import { type KeyboardEvent, useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate, todayDate } from "@/lib/utils";
import type { CalendarWeekStartsOn, ConfirmationStatus, PatrolMember, PatrolSchedule, PatrolStatus } from "@/types/domain";

type PatrolScheduleForm = {
  id?: string;
  date: string;
  sacramentalMemberIds: string[];
  classMemberIds: string[];
  notes: string;
  status: PatrolStatus;
  confirmationStatus: ConfirmationStatus;
};

type PatrolMemberSelectProps = {
  label: string;
  members: PatrolMember[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  placeholder: string;
};

const emptyScheduleForm: PatrolScheduleForm = {
  date: "",
  sacramentalMemberIds: [],
  classMemberIds: [],
  notes: "",
  status: "scheduled",
  confirmationStatus: "not_viewed",
};

const weekdaysByStart: Record<CalendarWeekStartsOn, string[]> = {
  sunday: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  monday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
};

function parseDate(date: string) {
  return new Date(`${date}T12:00:00`);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function buildMonthCells(monthDate: Date, weekStartsOn: CalendarWeekStartsOn) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() - (weekStartsOn === "monday" ? 1 : 0) + 7) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const dayOffset = index - firstWeekday + 1;
    const date = new Date(year, month, dayOffset);

    return {
      date,
      key: toDateKey(date),
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
      isSunday: date.getDay() === 0,
    };
  });
}

function formatScheduleDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Fortaleza",
    weekday: "short",
  }).format(parseDate(date));
}

function resolveSacramentalMemberIds(schedule: PatrolSchedule) {
  if (schedule.sacramentalMemberIds?.length) return schedule.sacramentalMemberIds;
  return schedule.primaryPatrolMemberId ? [schedule.primaryPatrolMemberId] : [];
}

function resolveClassMemberIds(schedule: PatrolSchedule) {
  if (schedule.classMemberIds?.length) return schedule.classMemberIds;
  return schedule.secondaryPatrolMemberId ? [schedule.secondaryPatrolMemberId] : [];
}

function MemberTagList({ ids, membersById }: { ids: string[]; membersById: Map<string, PatrolMember> }) {
  if (!ids.length) {
    return <span className="text-muted-foreground">Sem irmãos definidos</span>;
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {ids.map((id) => (
        <Badge key={id} variant="secondary">
          {membersById.get(id)?.name ?? "Irmão removido"}
        </Badge>
      ))}
    </div>
  );
}

function PatrolMemberSelect({ label, members, selectedIds, onSelectedIdsChange, placeholder }: PatrolMemberSelectProps) {
  const selectedMembers = selectedIds.map((id) => members.find((member) => member.id === id)).filter((member): member is PatrolMember => Boolean(member));

  function toggleMember(memberId: string) {
    onSelectedIdsChange(selectedIds.includes(memberId) ? selectedIds.filter((id) => id !== memberId) : [...selectedIds, memberId]);
  }

  function removeMember(memberId: string) {
    onSelectedIdsChange(selectedIds.filter((id) => id !== memberId));
  }

  return (
    <div>
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="h-auto min-h-10 w-full justify-between px-3 py-2" type="button" variant="outline">
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5 text-left">
              {selectedMembers.length ? (
                selectedMembers.map((member) => (
                  <Badge key={member.id} className="max-w-full" variant="secondary">
                    <span className="truncate">{member.name}</span>
                    <span
                      aria-label={`Remover ${member.name}`}
                      className="ml-1 inline-flex rounded-full hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeMember(member.id);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <X className="size-3" />
                    </span>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Digite para buscar" />
            <CommandList>
              <CommandEmpty>Nenhum irmão encontrado.</CommandEmpty>
              <CommandGroup>
                {members.map((member) => (
                  <CommandItem
                    data-checked={selectedIds.includes(member.id)}
                    key={member.id}
                    onSelect={() => toggleMember(member.id)}
                    value={member.name}
                  >
                    {member.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function PatrolScheduleSummary({ membersById, schedule }: { membersById: Map<string, PatrolMember>; schedule: PatrolSchedule }) {
  const sacramentalMemberIds = resolveSacramentalMemberIds(schedule);
  const classMemberIds = resolveClassMemberIds(schedule);

  return (
    <div className="rounded-md border bg-background px-2 py-1.5 text-xs shadow-sm">
      <p className="font-medium">Sacramental</p>
      <p className="truncate text-muted-foreground">
        {sacramentalMemberIds.map((id) => membersById.get(id)?.name ?? "Irmão removido").join(", ") || "Sem irmãos definidos"}
      </p>
      <p className="mt-1 font-medium">Aulas</p>
      <p className="truncate text-muted-foreground">{classMemberIds.map((id) => membersById.get(id)?.name ?? "Irmão removido").join(", ") || "Sem irmãos definidos"}</p>
    </div>
  );
}

export default function PatrolPage() {
  const { appPreferences, currentWard, hasPermission, patrolMembersByWard, patrolSchedulesByWard, savePatrolSchedule } = useAppContext();
  const canManagePatrol = hasPermission("patrol.manage");
  const initialSelectedDate = useMemo(() => todayDate(), []);

  const [monthDate, setMonthDate] = useState(() => parseDate(initialSelectedDate));
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [sundayOnly, setSundayOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<PatrolScheduleForm>({ ...emptyScheduleForm, date: initialSelectedDate });
  const [error, setError] = useState("");

  const activePatrolMembers = useMemo(() => patrolMembersByWard.filter((member) => member.active), [patrolMembersByWard]);

  const patrolMembersById = useMemo(
    () => new Map(patrolMembersByWard.map((member) => [member.id, member])),
    [patrolMembersByWard],
  );

  const schedulesByDate = useMemo(
    () =>
      patrolSchedulesByWard.reduce<Map<string, typeof patrolSchedulesByWard>>((map, schedule) => {
        const schedules = map.get(schedule.date) ?? [];
        map.set(schedule.date, [...schedules, schedule]);
        return map;
      }, new Map()),
    [patrolSchedulesByWard],
  );

  const weekdays = weekdaysByStart[appPreferences.calendarWeekStartsOn];
  const monthCells = useMemo(() => buildMonthCells(monthDate, appPreferences.calendarWeekStartsOn), [appPreferences.calendarWeekStartsOn, monthDate]);
  const sundayCells = useMemo(() => monthCells.filter((cell) => cell.isCurrentMonth && cell.isSunday), [monthCells]);
  const selectedSchedules = schedulesByDate.get(selectedDate) ?? [];

  function moveMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function handleDateCellKeyDown(event: KeyboardEvent<HTMLDivElement>, date: string) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    setSelectedDate(date);
  }

  function toggleSundayOnly() {
    setSundayOnly((current) => {
      const next = !current;

      if (next && !sundayCells.some((cell) => cell.key === selectedDate)) {
        const firstSunday = sundayCells[0];
        if (firstSunday) setSelectedDate(firstSunday.key);
      }

      return next;
    });
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setScheduleForm({ ...emptyScheduleForm, date: selectedDate });
      setError("");
    }
  }

  function openCreateDrawer(date = selectedDate) {
    setScheduleForm({ ...emptyScheduleForm, date });
    setSelectedDate(date);
    setMonthDate(parseDate(date));
    setError("");
    setDrawerOpen(true);
  }

  function openEditDrawer(schedule: PatrolSchedule) {
    setScheduleForm({
      id: schedule.id,
      date: schedule.date,
      sacramentalMemberIds: resolveSacramentalMemberIds(schedule),
      classMemberIds: resolveClassMemberIds(schedule),
      notes: schedule.notes,
      status: schedule.status,
      confirmationStatus: schedule.confirmationStatus,
    });
    setSelectedDate(schedule.date);
    setMonthDate(parseDate(schedule.date));
    setError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentSchedule() {
    setError("");

    if (!currentWard || !scheduleForm.date || !scheduleForm.sacramentalMemberIds.length || !scheduleForm.classMemberIds.length) {
      setError("Preencha data, irmãos da sacramental e irmãos das aulas.");
      return;
    }

    savePatrolSchedule({
      id: scheduleForm.id,
      wardId: currentWard.id,
      date: scheduleForm.date,
      sacramentalMemberIds: scheduleForm.sacramentalMemberIds,
      classMemberIds: scheduleForm.classMemberIds,
      notes: scheduleForm.notes.trim(),
      status: scheduleForm.status,
      confirmationStatus: scheduleForm.confirmationStatus,
    });

    setSelectedDate(scheduleForm.date);
    setMonthDate(parseDate(scheduleForm.date));
    closeDrawer();
  }

  function renderDateCell(cell: (typeof monthCells)[number], variant: "month" | "sunday") {
    const schedules = schedulesByDate.get(cell.key) ?? [];
    const isSelected = cell.key === selectedDate;
    const isToday = cell.key === todayDate();

    return (
      <div
        aria-label={`Selecionar ${formatDate(cell.key)}`}
        key={cell.key}
        className={cn(
          "group relative cursor-pointer text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
          variant === "month" && "min-h-20 border-b border-r px-1 pb-1 pt-8 sm:min-h-32 sm:p-2 sm:pt-10 [&:nth-child(7n+1)]:border-l",
          variant === "sunday" && "min-h-40 rounded-lg border p-3 pt-14",
          !cell.isCurrentMonth && "bg-muted/25 text-muted-foreground/55",
          isSelected && "bg-primary/8 ring-1 ring-inset ring-primary/35",
        )}
        onClick={() => setSelectedDate(cell.key)}
        onKeyDown={(event) => handleDateCellKeyDown(event, cell.key)}
        role="button"
        tabIndex={0}
      >
        <div
          className={cn(
            "absolute flex items-start justify-between",
            variant === "month" ? "inset-x-1 top-1.5 gap-1 sm:inset-x-2 sm:top-2 sm:gap-2" : "inset-x-3 top-3 gap-2",
          )}
        >
          <span
            className={cn(
              "flex items-center justify-center rounded-full font-medium tabular-nums",
              variant === "month" ? "size-6 text-xs" : "size-8 text-sm",
              isToday && "bg-primary text-primary-foreground",
            )}
          >
            {cell.day}
          </span>
          <span className="flex items-center gap-1">
            {canManagePatrol ? (
              <Button
                aria-label={`Adicionar escala em ${formatDate(cell.key)}`}
                className={cn(
                  "shadow-sm transition-[opacity,transform] duration-150 ease-out",
                  isSelected
                    ? "pointer-events-auto scale-100 opacity-100"
                    : "pointer-events-none scale-[0.25] opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  openCreateDrawer(cell.key);
                }}
                size="icon-xs"
                tabIndex={isSelected ? 0 : -1}
                type="button"
              >
                <Plus />
              </Button>
            ) : null}
          </span>
        </div>

        {variant === "month" ? (
          <div className="flex justify-center sm:hidden">
            {schedules.length ? (
              <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-medium text-primary tabular-nums">
                {schedules.length}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className={cn(variant === "month" ? "hidden space-y-1 sm:block" : "space-y-2")}>
          {schedules.slice(0, 2).map((schedule) => (
            <PatrolScheduleSummary key={schedule.id} membersById={patrolMembersById} schedule={schedule} />
          ))}
          {schedules.length > 2 ? <p className="text-xs text-muted-foreground tabular-nums">+{schedules.length - 2} escala(s)</p> : null}
          {canManagePatrol && !schedules.length && cell.isCurrentMonth && isSelected ? (
            <p className="text-xs text-muted-foreground">{variant === "sunday" ? "Sem escala cadastrada." : "Use o painel ao lado para cadastrar."}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <PermissionGuard permission="patrol.view">
      <PageHeader
        eyebrow="Ronda"
        title="Escala de segurança"
        description="Calendário mensal com os irmãos designados para sacramental e aulas."
        actions={
          canManagePatrol ? (
            <Button onClick={() => openCreateDrawer()} size="lg">
              <Plus />
              Nova escala
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="capitalize">{monthLabel(monthDate)}</CardTitle>
                <CardDescription>Selecione uma data para ver todos os detalhes.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={toggleSundayOnly} variant={sundayOnly ? "default" : "outline"}>
                  <CalendarDays className="size-4" />
                  {sundayOnly ? "Mês completo" : "Somente domingos"}
                </Button>
                <Button aria-label="Mês anterior" onClick={() => moveMonth(-1)} size="icon" variant="outline">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button aria-label="Próximo mês" onClick={() => moveMonth(1)} size="icon" variant="outline">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className={sundayOnly ? undefined : "px-2 sm:px-4"}>
            {sundayOnly ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{sundayCells.map((cell) => renderDateCell(cell, "sunday"))}</div>
            ) : (
              <div className="w-full overflow-hidden">
                <div className="w-full">
                  <div className="grid grid-cols-7 border-b text-center text-[10px] font-medium text-muted-foreground sm:text-left sm:text-xs">
                    {weekdays.map((weekday) => (
                      <div key={weekday} className="px-0.5 pb-2 sm:px-2">
                        {weekday}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7">
                    {monthCells.map((cell) => renderDateCell(cell, "month"))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{formatDate(selectedDate)}</CardTitle>
                <CardDescription>
                  {selectedSchedules.length ? "Escala cadastrada para esta data." : "Nenhuma escala cadastrada para esta data."}
                </CardDescription>
              </div>
              {canManagePatrol ? (
                <Button aria-label="Cadastrar escala nesta data" onClick={() => openCreateDrawer(selectedDate)} size="icon-sm" variant="outline">
                  <Plus />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSchedules.map((schedule) => (
              <div key={schedule.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium capitalize">{formatScheduleDate(schedule.date)}</p>
                    <p className="text-sm text-muted-foreground">Sacramental</p>
                  </div>
                  {canManagePatrol ? (
                    <Button onClick={() => openEditDrawer(schedule)} size="sm" variant="outline">
                      <Pencil />
                      Editar
                    </Button>
                  ) : null}
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Sacramental</p>
                    <MemberTagList ids={resolveSacramentalMemberIds(schedule)} membersById={patrolMembersById} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">Aulas</p>
                    <MemberTagList ids={resolveClassMemberIds(schedule)} membersById={patrolMembersById} />
                  </div>
                </div>

                {schedule.notes ? <p className="mt-3 text-sm text-muted-foreground">{schedule.notes}</p> : null}
              </div>
            ))}

            {!selectedSchedules.length ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Esta data ainda não tem escala.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {canManagePatrol ? (
        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{scheduleForm.id ? "Editar escala" : "Nova escala"}</DrawerTitle>
              <DrawerDescription>Selecione mais de um irmão digitando, escolhendo e mantendo as tags no campo.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, date: event.target.value }))}
                  />
                </div>

                <PatrolMemberSelect
                  label="Sacramental"
                  members={activePatrolMembers}
                  onSelectedIdsChange={(ids) => setScheduleForm((current) => ({ ...current, sacramentalMemberIds: ids }))}
                  placeholder="Digite e escolha irmãos"
                  selectedIds={scheduleForm.sacramentalMemberIds}
                />

                <PatrolMemberSelect
                  label="Aulas"
                  members={activePatrolMembers}
                  onSelectedIdsChange={(ids) => setScheduleForm((current) => ({ ...current, classMemberIds: ids }))}
                  placeholder="Digite e escolha irmãos"
                  selectedIds={scheduleForm.classMemberIds}
                />

                <div>
                  <Label>Observações</Label>
                  <Textarea
                    value={scheduleForm.notes}
                    onChange={(event) => setScheduleForm((current) => ({ ...current, notes: event.target.value }))}
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  Cancelar
                </Button>
                <Button
                  disabled={!currentWard || !scheduleForm.date || !scheduleForm.sacramentalMemberIds.length || !scheduleForm.classMemberIds.length}
                  onClick={saveCurrentSchedule}
                >
                  Salvar escala
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : null}
    </PermissionGuard>
  );
}

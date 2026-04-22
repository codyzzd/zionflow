"use client";

import { ChevronLeft, ChevronRight, ChevronsUpDown, Home, Mars, Pencil, Plus, Trash2, Venus, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDate, todayDate } from "@/lib/utils";
import type { CalendarWeekStartsOn, ConfirmationStatus, LunchSchedule, LunchStatus, MissionaryCompanionship } from "@/types/domain";

type LunchForm = {
  id?: string;
  date: string;
  time: string;
  companionshipIds: string[];
  hostMemberId: string;
  notes: string;
  status: LunchStatus;
  confirmationStatus: ConfirmationStatus;
};

type LegacyLunchSchedule = LunchSchedule & {
  hostHouseId?: string;
};

type CompanionshipSelectProps = {
  companionships: MissionaryCompanionship[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
};

const statusLabels = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
} as const;

const confirmationLabels = {
  not_viewed: "Não visualizado",
  viewed: "Visualizado",
  accepted: "Aceito",
  declined: "Recusado",
} as const;

const emptyLunchForm: LunchForm = {
  date: todayDate(),
  time: "12:00",
  companionshipIds: [],
  hostMemberId: "",
  notes: "",
  status: "pending",
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
    };
  });
}

function isCompanionship(value: MissionaryCompanionship | undefined): value is MissionaryCompanionship {
  return value !== undefined;
}

function CompanionshipIcon({ type, className }: { type: MissionaryCompanionship["type"]; className?: string }) {
  const MissionaryIcon = type === "sisters" ? Venus : Mars;
  const iconColorClassName = type === "sisters" ? "text-pink-500" : "text-blue-500";

  return <MissionaryIcon className={cn(className, iconColorClassName)} />;
}

function CompanionshipSelect({ companionships, selectedIds, onSelectedIdsChange }: CompanionshipSelectProps) {
  const selectedCompanionships = selectedIds
    .map((id) => companionships.find((companionship) => companionship.id === id))
    .filter(isCompanionship);

  function toggleCompanionship(companionshipId: string) {
    onSelectedIdsChange(
      selectedIds.includes(companionshipId)
        ? selectedIds.filter((id) => id !== companionshipId)
        : [...selectedIds, companionshipId],
    );
  }

  function removeCompanionship(companionshipId: string) {
    onSelectedIdsChange(selectedIds.filter((id) => id !== companionshipId));
  }

  return (
    <div>
      <Label>Duplas</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button className="h-auto min-h-10 w-full justify-between px-3 py-2" type="button" variant="outline">
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5 text-left">
              {selectedCompanionships.length ? (
                selectedCompanionships.map((companionship) => (
                  <Badge key={companionship.id} className="max-w-full" variant="secondary">
                    <CompanionshipIcon className="size-3" type={companionship.type} />
                    <span className="truncate">{companionship.name}</span>
                    <span
                      aria-label={`Remover ${companionship.name}`}
                      className="ml-1 inline-flex rounded-full hover:text-destructive"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeCompanionship(companionship.id);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <X className="size-3" />
                    </span>
                  </Badge>
                ))
              ) : (
                <span className="text-muted-foreground">Selecione uma ou mais duplas</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
          <Command>
            <CommandInput placeholder="Digite para buscar" />
            <CommandList>
              <CommandEmpty>Nenhuma dupla encontrada.</CommandEmpty>
              <CommandGroup>
                {companionships.map((companionship) => (
                  <CommandItem
                    data-checked={selectedIds.includes(companionship.id)}
                    key={companionship.id}
                    onSelect={() => toggleCompanionship(companionship.id)}
                    value={`${companionship.name} ${companionship.area}`}
                  >
                    <CompanionshipIcon className="size-4 text-muted-foreground" type={companionship.type} />
                    {companionship.name}
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

export default function LunchCalendarPage() {
  const {
    appPreferences,
    companionshipsByWard,
    currentWard,
    deleteLunchSchedule,
    hasPermission,
    hostHousesByWard,
    lunchSchedulesByWard,
    membersByWard,
    saveLunchSchedule,
  } = useAppContext();
  const canManageLunches = hasPermission("missionary.manage");
  const [monthDate, setMonthDate] = useState(() => parseDate(todayDate()));
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lunchForm, setLunchForm] = useState<LunchForm>({ ...emptyLunchForm, date: todayDate() });
  const [error, setError] = useState("");

  const lunchesByDate = useMemo(
    () =>
      lunchSchedulesByWard.reduce<Map<string, typeof lunchSchedulesByWard>>((map, lunch) => {
        const lunches = map.get(lunch.date) ?? [];
        map.set(lunch.date, [...lunches, lunch].sort((a, b) => a.time.localeCompare(b.time)));
        return map;
      }, new Map()),
    [lunchSchedulesByWard],
  );

  const weekdays = weekdaysByStart[appPreferences.calendarWeekStartsOn];
  const monthCells = useMemo(() => buildMonthCells(monthDate, appPreferences.calendarWeekStartsOn), [appPreferences.calendarWeekStartsOn, monthDate]);
  const activeCompanionships = useMemo(() => companionshipsByWard.filter((companionship) => companionship.status === "active"), [companionshipsByWard]);
  const selectedLunches = lunchesByDate.get(selectedDate) ?? [];
  const selectedDateLabel = formatDate(selectedDate);

  function moveMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function handleDateCellKeyDown(event: KeyboardEvent<HTMLDivElement>, date: string) {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    setSelectedDate(date);
  }

  function getLegacyHostMemberId(lunch: LegacyLunchSchedule) {
    if (lunch.hostMemberId) return lunch.hostMemberId;

    const legacyHouse = lunch.hostHouseId ? hostHousesByWard.find((house) => house.id === lunch.hostHouseId) : undefined;
    return legacyHouse?.hostMemberId ?? "";
  }

  function getHostMemberLabel(hostMemberId: string) {
    return membersByWard.find((member) => member.id === hostMemberId)?.name ?? "Anfitrião não definido";
  }

  function getLunchHostLabel(lunch: LegacyLunchSchedule) {
    const hostMemberId = getLegacyHostMemberId(lunch);

    return hostMemberId ? getHostMemberLabel(hostMemberId) : "Anfitrião não definido";
  }

  function getLunchCompanionships(companionshipIds: string[]) {
    return companionshipIds.map((id) => companionshipsByWard.find((item) => item.id === id)).filter(isCompanionship);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setLunchForm({ ...emptyLunchForm, date: selectedDate });
      setError("");
    }
  }

  function openCreateDrawer(date = selectedDate) {
    setLunchForm({ ...emptyLunchForm, date });
    setSelectedDate(date);
    setMonthDate(parseDate(date));
    setError("");
    setDrawerOpen(true);
  }

  function openEditDrawer(lunch: LunchSchedule) {
    setLunchForm({
      id: lunch.id,
      date: lunch.date,
      time: lunch.time,
      companionshipIds: lunch.companionshipIds,
      hostMemberId: getLegacyHostMemberId(lunch),
      notes: lunch.notes,
      status: lunch.status,
      confirmationStatus: lunch.confirmationStatus,
    });
    setSelectedDate(lunch.date);
    setMonthDate(parseDate(lunch.date));
    setError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentLunch() {
    setError("");

    if (!currentWard || !lunchForm.date || !lunchForm.time || !lunchForm.hostMemberId || !lunchForm.companionshipIds.length) {
      setError("Preencha data, horário, anfitrião e pelo menos uma dupla.");
      return;
    }

    saveLunchSchedule({
      id: lunchForm.id,
      wardId: currentWard.id,
      date: lunchForm.date,
      time: lunchForm.time,
      companionshipIds: lunchForm.companionshipIds,
      hostMemberId: lunchForm.hostMemberId,
      notes: lunchForm.notes.trim(),
      status: lunchForm.status,
      confirmationStatus: lunchForm.confirmationStatus,
    });

    setSelectedDate(lunchForm.date);
    setMonthDate(parseDate(lunchForm.date));
    closeDrawer();
  }

  function updateLunchStatus(lunch: LunchSchedule, status: LunchStatus) {
    if (!currentWard) return;

    saveLunchSchedule({
      id: lunch.id,
      wardId: currentWard.id,
      date: lunch.date,
      time: lunch.time,
      companionshipIds: lunch.companionshipIds,
      hostMemberId: getLegacyHostMemberId(lunch),
      notes: lunch.notes,
      status,
      confirmationStatus: lunch.confirmationStatus,
    });
  }

  function removeLunch(lunch: LunchSchedule) {
    const confirmed = window.confirm(`Remover o almoço de ${formatDate(lunch.date)} às ${lunch.time}?`);
    if (!confirmed) return;

    deleteLunchSchedule(lunch.id);
  }

  return (
    <PermissionGuard permission="missionary.view">
      <PageHeader
        eyebrow="Calendário de almoços"
        title="Almoços missionários"
        description="Calendário mensal com família anfitriã, duplas e status de confirmação em cada almoço."
        actions={
          canManageLunches ? (
            <Button onClick={() => openCreateDrawer()} size="lg">
              <Plus />
              Novo almoço
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
                <CardDescription>Selecione um dia para ver todos os detalhes.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button aria-label="Mês anterior" onClick={() => moveMonth(-1)} size="icon" variant="outline">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button aria-label="Próximo mês" onClick={() => moveMonth(1)} size="icon" variant="outline">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
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
                  {monthCells.map((cell) => {
                    const lunches = lunchesByDate.get(cell.key) ?? [];
                    const isSelected = cell.key === selectedDate;
                    const isToday = cell.key === todayDate();

                    return (
                      <div
                        aria-label={`Selecionar ${formatDate(cell.key)}`}
                        key={cell.key}
                        className={cn(
                          "group relative min-h-20 cursor-pointer border-b border-r px-1 pb-1 pt-8 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-32 sm:p-2 sm:pt-10 [&:nth-child(7n+1)]:border-l",
                          !cell.isCurrentMonth && "bg-muted/25 text-muted-foreground/55",
                          isSelected && "bg-primary/8 ring-1 ring-inset ring-primary/35",
                        )}
                        onClick={() => setSelectedDate(cell.key)}
                        onKeyDown={(event) => handleDateCellKeyDown(event, cell.key)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="absolute inset-x-1 top-1.5 flex items-start justify-between gap-1 sm:inset-x-2 sm:top-2 sm:gap-2">
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                              isToday && "bg-primary text-primary-foreground",
                            )}
                          >
                            {cell.day}
                          </span>
                          <span className="flex items-center gap-1">
                            {canManageLunches ? (
                              <Button
                                aria-label={`Adicionar almoço em ${formatDate(cell.key)}`}
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

                        <div className="flex justify-center sm:hidden">
                          {lunches.length ? (
                            <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-medium text-primary tabular-nums">
                              {lunches.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="hidden space-y-1 sm:block">
                          {lunches.slice(0, 2).map((lunch) => {
                            const companionships = getLunchCompanionships(lunch.companionshipIds);

                            return (
                              <div key={lunch.id} className="rounded-md border bg-background px-2 py-1.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="flex min-w-0 items-center gap-1.5 font-medium">
                                    <Home className="size-3.5 shrink-0 text-muted-foreground" />
                                    <span className="truncate">{getLunchHostLabel(lunch)}</span>
                                  </p>
                                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{lunch.time}</span>
                                </div>
                                <div className="mt-1 space-y-0.5">
                                  {companionships.length ? (
                                    companionships.map((companionship) => {
                                      return (
                                        <p key={companionship.id} className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                                          <CompanionshipIcon className="size-3.5 shrink-0" type={companionship.type} />
                                          <span className="truncate">{companionship.name}</span>
                                        </p>
                                      );
                                    })
                                  ) : (
                                    <p className="text-muted-foreground">Dupla não definida</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {lunches.length > 2 ? <p className="text-xs text-muted-foreground tabular-nums">+{lunches.length - 2} almoço(s)</p> : null}
                          {canManageLunches && !lunches.length && cell.isCurrentMonth && isSelected ? (
                            <p className="text-xs text-muted-foreground">Use o painel ao lado para cadastrar.</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{selectedDateLabel}</CardTitle>
                <CardDescription>{selectedLunches.length ? "Almoços agendados para o dia." : "Nenhum almoço agendado."}</CardDescription>
              </div>
              {canManageLunches ? (
                <Button aria-label="Cadastrar almoço neste dia" onClick={() => openCreateDrawer(selectedDate)} size="icon-sm" variant="outline">
                  <Plus />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedLunches.map((lunch) => {
              const companionships = getLunchCompanionships(lunch.companionshipIds);

              return (
                <div key={lunch.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium tabular-nums">{lunch.time}</p>
                    {canManageLunches ? (
                      <Select value={lunch.status} onValueChange={(value) => value && updateLunchStatus(lunch, value as LunchStatus)}>
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pendente</SelectItem>
                          <SelectItem value="confirmed">Confirmado</SelectItem>
                          <SelectItem value="cancelled">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={lunch.status === "confirmed" ? "default" : "secondary"}>{statusLabels[lunch.status]}</Badge>
                    )}
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <p className="flex items-center gap-2">
                      <Home className="size-4 text-muted-foreground" />
                      {getLunchHostLabel(lunch)}
                    </p>
                    <div className="grid gap-1">
                      {companionships.length ? (
                        companionships.map((companionship) => {
                          return (
                            <p key={companionship.id} className="flex items-center gap-2">
                              <CompanionshipIcon className="size-4 text-muted-foreground" type={companionship.type} />
                              <span>{companionship.name}</span>
                            </p>
                          );
                        })
                      ) : (
                        <p className="text-muted-foreground">Dupla não definida</p>
                      )}
                    </div>
                  </div>
                  {lunch.notes ? <p className="mt-3 text-sm text-muted-foreground">{lunch.notes}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{confirmationLabels[lunch.confirmationStatus]}</Badge>
                  </div>
                  {canManageLunches ? (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button onClick={() => openEditDrawer(lunch)} size="sm" variant="outline">
                        <Pencil />
                        Editar
                      </Button>
                      <Button onClick={() => removeLunch(lunch)} size="sm" variant="destructive">
                        <Trash2 />
                        Remover
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {!selectedLunches.length ? (
              <div className="rounded-lg border bg-secondary/35 p-4 text-sm text-muted-foreground">
                Selecione outro dia do calendário para consultar os almoços.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {canManageLunches ? (
        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{lunchForm.id ? "Editar almoço" : "Novo almoço"}</DrawerTitle>
              <DrawerDescription>Cadastre o anfitrião, horário e uma ou mais duplas que vão almoçar juntas.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={lunchForm.date}
                      onChange={(event) => setLunchForm((current) => ({ ...current, date: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={lunchForm.time}
                      onChange={(event) => setLunchForm((current) => ({ ...current, time: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label>Anfitrião</Label>
                  <Select value={lunchForm.hostMemberId} onValueChange={(value) => setLunchForm((current) => ({ ...current, hostMemberId: value ?? "" }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {membersByWard.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <CompanionshipSelect
                  companionships={activeCompanionships}
                  onSelectedIdsChange={(ids) => setLunchForm((current) => ({ ...current, companionshipIds: ids }))}
                  selectedIds={lunchForm.companionshipIds}
                />

                <div>
                  <Label>Status</Label>
                  <Select value={lunchForm.status} onValueChange={(value) => value && setLunchForm((current) => ({ ...current, status: value as LunchStatus }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="confirmed">Confirmado</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Confirmação da família</Label>
                  <Select
                    value={lunchForm.confirmationStatus}
                    onValueChange={(value) => value && setLunchForm((current) => ({ ...current, confirmationStatus: value as ConfirmationStatus }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a confirmação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_viewed">Não visualizado</SelectItem>
                      <SelectItem value="viewed">Visualizado</SelectItem>
                      <SelectItem value="accepted">Aceito</SelectItem>
                      <SelectItem value="declined">Recusado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Observações</Label>
                  <Textarea
                    className="min-h-24"
                    value={lunchForm.notes}
                    onChange={(event) => setLunchForm((current) => ({ ...current, notes: event.target.value }))}
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
                  disabled={!currentWard || !lunchForm.date || !lunchForm.time || !lunchForm.hostMemberId || !lunchForm.companionshipIds.length}
                  onClick={saveCurrentLunch}
                >
                  {lunchForm.id ? "Salvar alterações" : "Cadastrar almoço"}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : null}
    </PermissionGuard>
  );
}

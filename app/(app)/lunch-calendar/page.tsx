"use client";

import { CalendarDays, ChevronLeft, ChevronRight, ChevronsUpDown, Copy, Home, List, Mars, Pencil, Plus, Trash2, Venus, X } from "lucide-react";
import { type KeyboardEvent, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { HybridSelector } from "@/components/shared/hybrid-selector";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn, todayDate } from "@/lib/utils";
import type {
  CalendarWeekStartsOn,
  ConfirmationStatus,
  HybridField,
  LunchCompanionshipSnapshot,
  LunchSchedule,
  MissionaryCompanionship,
  Weekday,
} from "@/types/domain";

type LunchForm = {
  id?: string;
  date: string;
  time: string;
  companionshipIds: string[];
  host: HybridField;
  notes: string;
  confirmationStatus: ConfirmationStatus;
};

type LegacyLunchSchedule = LunchSchedule & {
  hostHouseId?: string;
};

type LunchListScope = "complete" | "missing";
type MemberNameFormat = "full" | "first_last" | "first";
type MobileLunchView = "calendar" | "list";

type CompanionshipSelectProps = {
  companionships: LunchCompanionshipSnapshot[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
};

const confirmationLabels = {
  not_viewed: "Não visualizado",
  viewed: "Visualizado",
  accepted: "Aceito",
  declined: "Recusado",
} as const;

const confirmationBadgeVariants = {
  not_viewed: "secondary",
  viewed: "outline",
  accepted: "default",
  declined: "destructive",
} as const;

const emptyLunchForm: LunchForm = {
  date: todayDate(),
  time: "12:00",
  companionshipIds: [],
  host: { mode: "linked", linkedId: "", manualValue: "" },
  notes: "",
  confirmationStatus: "not_viewed",
};

const weekdaysByStart: Record<CalendarWeekStartsOn, string[]> = {
  sunday: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  monday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
};

const weekdayOptions: Array<{ value: Weekday; label: string }> = [
  { value: "sunday", label: "Domingo" },
  { value: "monday", label: "Segunda-feira" },
  { value: "tuesday", label: "Terça-feira" },
  { value: "wednesday", label: "Quarta-feira" },
  { value: "thursday", label: "Quinta-feira" },
  { value: "friday", label: "Sexta-feira" },
  { value: "saturday", label: "Sábado" },
];

const weekdaysByIndex: Weekday[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const abbreviatedWeekdaysByIndex = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MOBILE_LUNCH_VIEW_STORAGE_KEY = "superala:lunch-calendar:mobile-view";
const MOBILE_LUNCH_VIEW_CHANGE_EVENT = "superala:lunch-calendar:mobile-view-change";

function getStoredMobileLunchView(): MobileLunchView {
  const storedView = window.localStorage.getItem(MOBILE_LUNCH_VIEW_STORAGE_KEY);
  return storedView === "list" ? "list" : "calendar";
}

function subscribeToMobileLunchView(onStoreChange: () => void) {
  function handleStorageChange(event: StorageEvent) {
    if (event.key === MOBILE_LUNCH_VIEW_STORAGE_KEY) {
      onStoreChange();
    }
  }

  window.addEventListener("storage", handleStorageChange);
  window.addEventListener(MOBILE_LUNCH_VIEW_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorageChange);
    window.removeEventListener(MOBILE_LUNCH_VIEW_CHANGE_EVENT, onStoreChange);
  };
}

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

function monthDates(monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(year, month, index + 1);

    return {
      date,
      key: toDateKey(date),
      day: index + 1,
    };
  });
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

function startOfCalendarWeek(date: Date, weekStartsOn: CalendarWeekStartsOn) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const firstDayIndex = weekStartsOn === "monday" ? 1 : 0;
  const dayOffset = (start.getDay() - firstDayIndex + 7) % 7;

  start.setDate(start.getDate() - dayOffset);
  return start;
}

function calendarWeekDates(date: Date, weekStartsOn: CalendarWeekStartsOn) {
  const weekStart = startOfCalendarWeek(date, weekStartsOn);

  return Array.from({ length: 7 }, (_, index) => {
    const itemDate = new Date(weekStart);
    itemDate.setDate(weekStart.getDate() + index);

    return {
      date: itemDate,
      key: toDateKey(itemDate),
      day: itemDate.getDate(),
    };
  });
}

function isCompanionship(value: LunchCompanionshipSnapshot | undefined): value is LunchCompanionshipSnapshot {
  return value !== undefined;
}

function isHostFilled(host: HybridField) {
  return host.mode === "manual" ? Boolean(host.manualValue?.trim()) : Boolean(host.linkedId);
}

function formatMemberName(name: string, format: MemberNameFormat) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (format === "full" || parts.length <= 1) return parts.join(" ");
  if (format === "first") return parts[0];

  return `${parts[0]} ${parts.at(-1)}`;
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
    allCompanionshipsByWard,
    appPreferences,
    companionshipsByWard,
    currentWard,
    deleteLunchSchedule,
    hasPermission,
    hostHousesByWard,
    lunchSchedulesByWard,
    membersByWard,
    saveWard,
    saveLunchSchedule,
  } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageLunches = hasPermission("lunch.manage");
  const [monthDate, setMonthDate] = useState(() => parseDate(todayDate()));
  const [selectedDate, setSelectedDate] = useState(todayDate());
  const [selectedWeekDate, setSelectedWeekDate] = useState(todayDate());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [lunchListScope, setLunchListScope] = useState<LunchListScope>("complete");
  const [memberNameFormat, setMemberNameFormat] = useState<MemberNameFormat>("full");
  const [omitCompanionships, setOmitCompanionships] = useState(false);
  const [showWeekdays, setShowWeekdays] = useState(false);
  const mobileView = useSyncExternalStore(subscribeToMobileLunchView, getStoredMobileLunchView, () => "calendar");
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
  const visibleMonthDates = useMemo(() => monthDates(monthDate), [monthDate]);
  const selectedWeekStartKey = toDateKey(startOfCalendarWeek(parseDate(selectedWeekDate), appPreferences.calendarWeekStartsOn));
  const selectedWeekDates = useMemo(
    () =>
      calendarWeekDates(parseDate(selectedWeekDate), appPreferences.calendarWeekStartsOn).filter(
        (item) => item.date.getFullYear() === monthDate.getFullYear() && item.date.getMonth() === monthDate.getMonth(),
      ),
    [appPreferences.calendarWeekStartsOn, monthDate, selectedWeekDate],
  );
  const activeCompanionships = useMemo(() => companionshipsByWard.filter((companionship) => companionship.status === "active"), [companionshipsByWard]);
  const activeCompanionshipIds = useMemo(() => new Set(activeCompanionships.map((companionship) => companionship.id)), [activeCompanionships]);
  const allCompanionshipsById = useMemo(
    () => new Map(allCompanionshipsByWard.map((companionship) => [companionship.id, companionship])),
    [allCompanionshipsByWard],
  );
  const companionshipSnapshotsById = useMemo(() => {
    const snapshots = new Map<string, LunchCompanionshipSnapshot>();

    lunchSchedulesByWard.forEach((lunch) => {
      lunch.companionshipSnapshots?.forEach((snapshot) => snapshots.set(snapshot.id, snapshot));
    });

    return snapshots;
  }, [lunchSchedulesByWard]);
  const companionshipSelectOptions = useMemo(() => {
    const options: LunchCompanionshipSnapshot[] = [...activeCompanionships];
    const optionIds = new Set(options.map((companionship) => companionship.id));

    lunchForm.companionshipIds.forEach((companionshipId) => {
      if (optionIds.has(companionshipId)) return;

      const companionship = allCompanionshipsById.get(companionshipId) ?? companionshipSnapshotsById.get(companionshipId);
      if (!companionship) return;

      options.push(companionship);
      optionIds.add(companionshipId);
    });

    return options;
  }, [activeCompanionships, allCompanionshipsById, companionshipSnapshotsById, lunchForm.companionshipIds]);
  const lunchPDayWeekday = currentWard?.lunchPDayWeekday ?? "monday";
  const pDayLabel = weekdayOptions.find((option) => option.value === lunchPDayWeekday)?.label ?? "Segunda-feira";
  const selectedLunches = lunchesByDate.get(selectedDate) ?? [];
  const selectedDateLabel = formatDate(selectedDate);
  const hostMemberOptions = useMemo(
    () =>
      membersByWard.map((member) => ({
        value: member.id,
        label: `${member.name} • ${member.organization}`,
        searchValue: member.name,
      })),
    [membersByWard],
  );
  const coverageSummary = useMemo(() => {
    if (!activeCompanionships.length) {
      return {
        eligibleDays: 0,
        completeDays: 0,
        incompleteDays: 0,
        missingCompanionshipLunches: 0,
        headerText: "Nenhuma dupla ativa cadastrada",
        helperText: "Nenhuma dupla ativa cadastrada",
        progressPercent: 0,
      };
    }

    const totals = visibleMonthDates.reduce(
      (current, item) => {
        if (weekdaysByIndex[item.date.getDay()] === lunchPDayWeekday) return current;

        const coveredIds = new Set(
          (lunchesByDate.get(item.key) ?? []).flatMap((lunch) => lunch.companionshipIds).filter((id) => activeCompanionshipIds.has(id)),
        );
        const missingCount = activeCompanionships.filter((companionship) => !coveredIds.has(companionship.id)).length;

        return {
          eligibleDays: current.eligibleDays + 1,
          completeDays: current.completeDays + (missingCount ? 0 : 1),
          incompleteDays: current.incompleteDays + (missingCount ? 1 : 0),
          missingCompanionshipLunches: current.missingCompanionshipLunches + missingCount,
        };
      },
      {
        eligibleDays: 0,
        completeDays: 0,
        incompleteDays: 0,
        missingCompanionshipLunches: 0,
      },
    );

    return {
      ...totals,
      headerText: totals.missingCompanionshipLunches
        ? `Faltam ${totals.missingCompanionshipLunches} almoços de duplas neste mês`
        : "Todas as duplas têm almoço nos dias disponíveis",
      helperText: !totals.eligibleDays
        ? "Nenhum dia disponível fora do P-DAY"
        : totals.incompleteDays
          ? `${totals.completeDays} de ${totals.eligibleDays} dias disponíveis estão completos`
          : "Todos os dias disponíveis estão completos",
      progressPercent: totals.eligibleDays ? Math.round((totals.completeDays / totals.eligibleDays) * 100) : 0,
    };
  }, [activeCompanionshipIds, activeCompanionships, lunchPDayWeekday, lunchesByDate, visibleMonthDates]);

  function moveMonth(offset: number) {
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1);

    setMonthDate(nextMonth);
    setSelectedWeekDate(toDateKey(nextMonth));
  }

  function selectMobileView(view: MobileLunchView) {
    window.localStorage.setItem(MOBILE_LUNCH_VIEW_STORAGE_KEY, view);
    window.dispatchEvent(new Event(MOBILE_LUNCH_VIEW_CHANGE_EVENT));
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

  function getLunchHostField(lunch: LegacyLunchSchedule): HybridField {
    if (lunch.host) return lunch.host;

    return {
      mode: "linked",
      linkedId: getLegacyHostMemberId(lunch),
      manualValue: "",
    };
  }

  function getHostMemberLabel(hostMemberId: string, nameFormat: MemberNameFormat = "full") {
    const memberName = membersByWard.find((member) => member.id === hostMemberId)?.name;
    return memberName ? formatMemberName(memberName, nameFormat) : "Anfitrião não definido";
  }

  function getLunchHostLabel(lunch: LegacyLunchSchedule, nameFormat: MemberNameFormat = "full") {
    const host = getLunchHostField(lunch);

    if (host.mode === "manual") {
      return host.manualValue?.trim() || "Anfitrião não definido";
    }

    return host.linkedId ? getHostMemberLabel(host.linkedId, nameFormat) : "Anfitrião não definido";
  }

  function getLunchCompanionships(lunch: LunchSchedule) {
    return lunch.companionshipIds
      .map((id) => allCompanionshipsById.get(id) ?? lunch.companionshipSnapshots?.find((snapshot) => snapshot.id === id))
      .filter(isCompanionship);
  }

  function getMissingCompanionshipsForDate(date: string) {
    const coveredIds = new Set(
      (lunchesByDate.get(date) ?? []).flatMap((lunch) => lunch.companionshipIds).filter((id) => activeCompanionshipIds.has(id)),
    );

    return activeCompanionships.filter((companionship) => !coveredIds.has(companionship.id));
  }

  function isPDayDate(date: Date) {
    return weekdaysByIndex[date.getDay()] === lunchPDayWeekday;
  }

  function updateLunchPDayWeekday(value: Weekday) {
    if (!currentWard || !canManageLunches) return;

    saveWard({
      ...currentWard,
      lunchPDayWeekday: value,
    });
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
    setSelectedWeekDate(date);
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
      host: getLunchHostField(lunch),
      notes: lunch.notes,
      confirmationStatus: lunch.confirmationStatus,
    });
    setSelectedDate(lunch.date);
    setSelectedWeekDate(lunch.date);
    setMonthDate(parseDate(lunch.date));
    setError("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentLunch() {
    setError("");

    if (!currentWard || !lunchForm.date || !lunchForm.time || !isHostFilled(lunchForm.host) || !lunchForm.companionshipIds.length) {
      setError("Preencha data, horário, anfitrião e pelo menos uma dupla.");
      return;
    }

    saveLunchSchedule({
      id: lunchForm.id,
      wardId: currentWard.id,
      date: lunchForm.date,
      time: lunchForm.time,
      companionshipIds: lunchForm.companionshipIds,
      companionshipSnapshots: lunchForm.companionshipIds.flatMap((companionshipId) => {
        const companionship = allCompanionshipsById.get(companionshipId) ?? companionshipSnapshotsById.get(companionshipId);

        return companionship
          ? [
              {
                id: companionship.id,
                name: companionship.name,
                type: companionship.type,
                area: companionship.area,
              },
            ]
          : [];
      }),
      host: lunchForm.host,
      hostMemberId: lunchForm.host.mode === "linked" ? lunchForm.host.linkedId ?? "" : "",
      notes: lunchForm.notes.trim(),
      confirmationStatus: lunchForm.confirmationStatus,
    });

    setSelectedDate(lunchForm.date);
    setMonthDate(parseDate(lunchForm.date));
    closeDrawer();
  }

  function removeLunch(lunch: LunchSchedule) {
    deleteLunchSchedule(lunch.id);
  }

  function buildMonthLunchList() {
    const formattedMonthLabel = monthLabel(monthDate);
    const lines = [
      "Calendário de almoços missionários",
      formattedMonthLabel.charAt(0).toUpperCase() + formattedMonthLabel.slice(1),
      "",
    ];

    for (const item of visibleMonthDates) {
      const lunches = lunchesByDate.get(item.key) ?? [];
      const missingCompanionships = getMissingCompanionshipsForDate(item.key);
      const dayPrefix = showWeekdays ? `${item.day}. ${abbreviatedWeekdaysByIndex[item.date.getDay()]} -` : `${item.day}.`;

      if (isPDayDate(item.date)) {
        if (lunchListScope === "complete") lines.push(`${dayPrefix} P-DAY`);
        continue;
      }

      if (lunchListScope === "missing" && activeCompanionships.length && !missingCompanionships.length) continue;

      if (!activeCompanionships.length) {
        lines.push(`${dayPrefix} Nenhuma dupla ativa cadastrada`);
        continue;
      }

      const scheduledText = lunches.map((lunch) => {
        const hostLabel = getLunchHostLabel(lunch, memberNameFormat);

        if (omitCompanionships) return hostLabel;

        const companionshipNames = getLunchCompanionships(lunch)
          .map((companionship) => companionship.name)
          .join(", ");

        return `${hostLabel} - ${companionshipNames || "Dupla não definida"}`;
      });
      const missingNames = missingCompanionships.map((companionship) => companionship.name);

      if (!scheduledText.length) {
        lines.push(omitCompanionships ? `${dayPrefix} Sem almoço ainda` : `${dayPrefix} Sem almoço ainda - faltam: ${missingNames.join(", ")}`);
      } else if (missingNames.length) {
        lines.push(
          omitCompanionships
            ? `${dayPrefix} ${scheduledText.join(" / ")} / Ainda faltam almoços`
            : `${dayPrefix} ${scheduledText.join(" / ")} / Faltam: ${missingNames.join(", ")}`,
        );
      } else {
        lines.push(`${dayPrefix} ${scheduledText.join(" / ")}`);
      }
    }

    return lines.join("\n");
  }

  async function copyMonthLunchList() {
    try {
      await navigator.clipboard.writeText(buildMonthLunchList());
      toast.success("Lista de almoços copiada.");
      setCopyDialogOpen(false);
    } catch {
      toast.error("Não foi possível copiar a lista.");
    }
  }

  return (
    <PermissionGuard permission="lunch.view">
      <PageHeader
        eyebrow="Calendário de almoços"
        title="Almoços missionários"
        description="Calendário mensal com família anfitriã, duplas e status de confirmação em cada almoço."
        actions={
          <div className="flex flex-wrap gap-2">
            <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="outline">
                  <Copy />
                  Copiar lista
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Copiar lista de almoços</DialogTitle>
                  <DialogDescription>Configure o conteúdo que será copiado para compartilhar.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
                  <fieldset className="grid gap-2">
                    <legend className="mb-2 font-medium">Conteúdo da lista</legend>
                    <RadioGroup
                      className="grid gap-2 sm:grid-cols-2"
                      name="lunch-list-scope"
                      onValueChange={(value) => setLunchListScope(value as LunchListScope)}
                      value={lunchListScope}
                    >
                      {[
                        { value: "complete" as const, label: "Lista completa" },
                        { value: "missing" as const, label: "Somente dias que faltam" },
                      ].map((option) => (
                        <label
                          className={cn(
                            "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                            lunchListScope === option.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                          )}
                          key={option.value}
                        >
                          <RadioGroupItem value={option.value} />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </fieldset>

                  <fieldset className="grid gap-2">
                    <legend className="mb-2 font-medium">Formato do nome dos membros</legend>
                    <RadioGroup
                      className="grid gap-2 sm:grid-cols-3"
                      name="lunch-member-name-format"
                      onValueChange={(value) => setMemberNameFormat(value as MemberNameFormat)}
                      value={memberNameFormat}
                    >
                      {[
                        { value: "full" as const, label: "Nome completo" },
                        { value: "first_last" as const, label: "Primeiro e último" },
                        { value: "first" as const, label: "Primeiro nome" },
                      ].map((option) => (
                        <label
                          className={cn(
                            "flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                            memberNameFormat === option.value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                          )}
                          key={option.value}
                        >
                          <RadioGroupItem value={option.value} />
                          <span className="leading-tight">{option.label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </fieldset>

                  <fieldset className="grid gap-2">
                    <legend className="mb-2 font-medium">Opções adicionais</legend>
                    <div
                      className={cn(
                        "flex min-h-10 items-start gap-3 rounded-lg border p-3 transition-colors",
                        omitCompanionships ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        checked={omitCompanionships}
                        id="omit-lunch-companionships"
                        onCheckedChange={(checked) => setOmitCompanionships(checked === true)}
                      />
                      <span className="grid gap-1">
                        <Label className="cursor-pointer" htmlFor="omit-lunch-companionships">
                          Omitir nomes das duplas
                        </Label>
                        <span className="text-xs text-muted-foreground">Mostra somente os membros ou famílias anfitriãs em cada dia.</span>
                      </span>
                    </div>
                    <div
                      className={cn(
                        "flex min-h-10 items-start gap-3 rounded-lg border p-3 transition-colors",
                        showWeekdays ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        checked={showWeekdays}
                        id="show-lunch-weekdays"
                        onCheckedChange={(checked) => setShowWeekdays(checked === true)}
                      />
                      <span className="grid gap-1">
                        <Label className="cursor-pointer" htmlFor="show-lunch-weekdays">
                          Mostrar dias da semana
                        </Label>
                        <span className="text-xs text-muted-foreground">Adiciona Seg, Ter, Qua e os demais dias após o número.</span>
                      </span>
                    </div>
                  </fieldset>

                  <div className="grid gap-2">
                    <Label htmlFor="lunch-list-preview">Prévia</Label>
                    <Textarea
                      className="max-h-72 min-h-40 resize-none font-mono text-xs leading-relaxed"
                      id="lunch-list-preview"
                      readOnly
                      value={buildMonthLunchList()}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button onClick={() => setCopyDialogOpen(false)} variant="outline">
                    Cancelar
                  </Button>
                  <Button onClick={copyMonthLunchList}>
                    <Copy />
                    Copiar lista
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {canManageLunches ? (
              <Button onClick={() => openCreateDrawer()} size="lg">
                <Plus />
                Novo almoço
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="order-2 min-w-0 md:order-1">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="capitalize">{monthLabel(monthDate)}</CardTitle>
                <CardDescription>{coverageSummary.headerText}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground" htmlFor="lunch-p-day">
                    P-DAY
                  </Label>
                  {canManageLunches ? (
                    <Select value={lunchPDayWeekday} onValueChange={(value) => updateLunchPDayWeekday(value as Weekday)}>
                      <SelectTrigger className="h-9 w-[170px]" id="lunch-p-day">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {weekdayOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{pDayLabel}</Badge>
                  )}
                </div>
                <Button aria-label="Mês anterior" onClick={() => moveMonth(-1)} size="icon" variant="outline">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button aria-label="Próximo mês" onClick={() => moveMonth(1)} size="icon" variant="outline">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div aria-label="Visualização dos almoços" className="mt-3 grid grid-cols-2 rounded-lg border bg-muted/50 p-0.5 md:hidden" role="group">
              <Button
                aria-pressed={mobileView === "calendar"}
                className="min-h-10"
                onClick={() => selectMobileView("calendar")}
                variant={mobileView === "calendar" ? "secondary" : "ghost"}
              >
                <CalendarDays />
                Calendário
              </Button>
              <Button
                aria-pressed={mobileView === "list"}
                className="min-h-10"
                onClick={() => selectMobileView("list")}
                variant={mobileView === "list" ? "secondary" : "ghost"}
              >
                <List />
                Lista
              </Button>
            </div>
          </CardHeader>
          <CardContent className={cn("px-2 sm:px-4", mobileView === "list" && "hidden md:block")}>
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
                    const isPDay = isPDayDate(cell.date);
                    const missingCompanionships = cell.isCurrentMonth && !isPDay ? getMissingCompanionshipsForDate(cell.key) : [];

                    return (
                      <div
                        aria-label={`Selecionar ${formatDate(cell.key)}`}
                        key={cell.key}
                        className={cn(
                          "group relative min-h-20 cursor-pointer border-b border-r px-1 pb-1 pt-8 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-32 sm:p-2 sm:pt-10 [&:nth-child(7n+1)]:border-l",
                          !cell.isCurrentMonth && "bg-muted/25 text-muted-foreground/55",
                          cell.isCurrentMonth && isPDay && "bg-amber-50/70 dark:bg-amber-950/20",
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
                            {cell.isCurrentMonth && isPDay ? (
                              <Badge className="hidden bg-background/80 sm:inline-flex" variant="outline">
                                P-DAY
                              </Badge>
                            ) : null}
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
                          {cell.isCurrentMonth && isPDay ? (
                            <span className="mt-1 rounded-full border bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">P-DAY</span>
                          ) : lunches.length ? (
                            <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-medium text-primary tabular-nums">
                              {lunches.length}
                            </span>
                          ) : null}
                        </div>

                        <div className="hidden space-y-1 sm:block">
                          {lunches.slice(0, 2).map((lunch) => {
                            const companionships = getLunchCompanionships(lunch);

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
                          {cell.isCurrentMonth && !isPDay && missingCompanionships.length ? (
                            <p className="text-xs text-muted-foreground tabular-nums">Faltam {missingCompanionships.length}</p>
                          ) : null}
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

          <CardContent className={cn("px-3 md:hidden", mobileView === "calendar" && "hidden")}>
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border bg-background">
                <div className="grid grid-cols-7 border-b bg-muted/35 px-1 py-2 text-center text-[10px] font-medium text-muted-foreground">
                  {weekdays.map((weekday) => (
                    <span key={weekday}>{weekday}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 p-1">
                  {monthCells.map((cell) => {
                    const cellWeekStartKey = toDateKey(startOfCalendarWeek(cell.date, appPreferences.calendarWeekStartsOn));
                    const isSelectedWeek = cellWeekStartKey === selectedWeekStartKey;
                    const isToday = cell.key === todayDate();
                    const isPDay = isPDayDate(cell.date);
                    const missingCompanionships = cell.isCurrentMonth && !isPDay ? getMissingCompanionshipsForDate(cell.key) : [];
                    const hasMissingLunches = Boolean(activeCompanionships.length && missingCompanionships.length);

                    return (
                      <button
                        aria-label={
                          cell.isCurrentMonth
                            ? `Mostrar semana de ${formatDate(cell.key)}${
                                hasMissingLunches
                                  ? `, faltam almoços para ${missingCompanionships.length} ${
                                      missingCompanionships.length === 1 ? "dupla" : "duplas"
                                    }`
                                  : ""
                              }`
                            : `${formatDate(cell.key)} está fora do mês atual`
                        }
                        aria-pressed={cell.isCurrentMonth ? isSelectedWeek : undefined}
                        className={cn(
                          "relative flex min-h-10 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-[color,background-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]",
                          !cell.isCurrentMonth && "cursor-default text-muted-foreground/35",
                          cell.isCurrentMonth && "hover:bg-muted",
                          cell.isCurrentMonth && isSelectedWeek && "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
                          cell.isCurrentMonth && isToday && "font-semibold",
                        )}
                        disabled={!cell.isCurrentMonth}
                        key={cell.key}
                        onClick={() => setSelectedWeekDate(cell.key)}
                        type="button"
                      >
                        <span className={cn("flex size-7 items-center justify-center rounded-full", cell.isCurrentMonth && isToday && "bg-primary text-primary-foreground")}>
                          {cell.day}
                        </span>
                        {hasMissingLunches ? (
                          <span
                            aria-hidden="true"
                            className="absolute bottom-1 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-amber-400 ring-2 ring-background"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3 px-1">
                  <div>
                    <p className="text-sm font-medium">Almoços da semana</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(selectedWeekDates[0]?.key ?? selectedWeekDate)} a{" "}
                      {formatDate(selectedWeekDates.at(-1)?.key ?? selectedWeekDate)}
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border">
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[72px] px-2">Dia</TableHead>
                        <TableHead className="px-2">Almoços</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedWeekDates.map((item) => {
                        const lunches = lunchesByDate.get(item.key) ?? [];
                        const isPDay = isPDayDate(item.date);
                        const missingCompanionships = isPDay ? [] : getMissingCompanionshipsForDate(item.key);
                        const isComplete = Boolean(activeCompanionships.length) && !isPDay && !missingCompanionships.length;

                        return (
                          <TableRow className={cn(isPDay && "bg-amber-50/60 dark:bg-amber-950/20")} key={item.key}>
                            <TableCell className="px-2 py-3 align-top">
                              <p className="text-xs font-medium text-muted-foreground">{abbreviatedWeekdaysByIndex[item.date.getDay()]}</p>
                              <p className="text-lg font-semibold leading-tight tabular-nums">{item.day}</p>
                              {isPDay ? (
                                <Badge className="mt-1 px-1.5 py-0 text-[9px]" variant="outline">
                                  P-DAY
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="px-2 py-2 align-top">
                              {isPDay ? (
                                <p className="py-2 text-xs text-muted-foreground">Dia reservado para P-DAY.</p>
                              ) : (
                                <div className="min-w-0">
                                  <div className="divide-y">
                                    {lunches.map((lunch) => {
                                      const companionships = getLunchCompanionships(lunch);

                                      return (
                                        <div className="py-2 first:pt-0 last:pb-0" key={lunch.id}>
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="flex min-w-0 items-center gap-1.5 font-medium">
                                                <span className="shrink-0 tabular-nums">{lunch.time}</span>
                                                <span aria-hidden="true" className="text-muted-foreground">
                                                  ·
                                                </span>
                                                <Home className="size-3.5 shrink-0 text-muted-foreground" />
                                                <span className="truncate">{getLunchHostLabel(lunch)}</span>
                                              </p>
                                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                                {companionships.length ? (
                                                  companionships.map((companionship) => (
                                                    <span className="inline-flex min-w-0 items-center gap-1" key={companionship.id}>
                                                      <CompanionshipIcon className="size-3 shrink-0" type={companionship.type} />
                                                      <span>{companionship.name}</span>
                                                    </span>
                                                  ))
                                                ) : (
                                                  <span>Dupla não definida</span>
                                                )}
                                              </div>
                                              <Badge className="mt-1.5 px-1.5 py-0 text-[9px]" variant={confirmationBadgeVariants[lunch.confirmationStatus]}>
                                                {confirmationLabels[lunch.confirmationStatus]}
                                              </Badge>
                                            </div>

                                            {canManageLunches ? (
                                              <div className="flex shrink-0 gap-1">
                                                <Button
                                                  aria-label={`Editar almoço das ${lunch.time}`}
                                                  className="size-10"
                                                  onClick={() => openEditDrawer(lunch)}
                                                  size="icon"
                                                  variant="ghost"
                                                >
                                                  <Pencil />
                                                </Button>
                                                <DeleteConfirmationDialog
                                                  confirmLabel="Remover"
                                                  description={`Remover o almoço de ${formatDate(lunch.date)} às ${lunch.time}? Essa ação remove o agendamento.`}
                                                  onConfirm={() => removeLunch(lunch)}
                                                >
                                                  <Button
                                                    aria-label={`Remover almoço das ${lunch.time}`}
                                                    className="size-10"
                                                    size="icon"
                                                    variant="destructive"
                                                  >
                                                    <Trash2 />
                                                  </Button>
                                                </DeleteConfirmationDialog>
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {!lunches.length ? <p className="py-1 text-xs text-muted-foreground">Nenhum almoço agendado.</p> : null}

                                  <div className={cn("mt-2 flex items-start justify-between gap-2 border-t pt-2", !lunches.length && "mt-1")}>
                                    <div className="min-w-0 text-xs">
                                      {!activeCompanionships.length ? (
                                        <p className="text-muted-foreground">Nenhuma dupla ativa cadastrada.</p>
                                      ) : isComplete ? (
                                        <p className="font-medium text-primary">Dia completo</p>
                                      ) : (
                                        <>
                                          <p className="font-medium text-amber-700 dark:text-amber-300">
                                            Faltam {missingCompanionships.length} {missingCompanionships.length === 1 ? "dupla" : "duplas"}
                                          </p>
                                          <p className="mt-0.5 text-muted-foreground">{missingCompanionships.map((companionship) => companionship.name).join(", ")}</p>
                                        </>
                                      )}
                                    </div>
                                    {canManageLunches ? (
                                      <Button
                                        aria-label={`Adicionar almoço em ${formatDate(item.key)}`}
                                        className="size-10"
                                        onClick={() => openCreateDrawer(item.key)}
                                        size="icon"
                                        variant="outline"
                                      >
                                        <Plus />
                                      </Button>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="contents xl:order-2 xl:block xl:space-y-4">
          <Card className="order-1 md:order-2">
            <CardHeader>
              <CardTitle>Cobertura do mês</CardTitle>
              <CardDescription>{coverageSummary.helperText}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-3xl font-semibold tabular-nums">{coverageSummary.incompleteDays}</p>
                <p className="text-sm text-muted-foreground">
                  {coverageSummary.incompleteDays === 1 ? "dia incompleto" : "dias incompletos"}
                </p>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Almoços de duplas faltando</span>
                  <span className="font-medium tabular-nums">{coverageSummary.missingCompanionshipLunches}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Dias completos</span>
                  <span className="font-medium tabular-nums">
                    {coverageSummary.completeDays}/{coverageSummary.eligibleDays}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${coverageSummary.progressPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">{coverageSummary.progressPercent}% preenchido</p>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("order-3", mobileView === "list" && "hidden md:flex")}>
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
                const companionships = getLunchCompanionships(lunch);

                return (
                  <div key={lunch.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium tabular-nums">{lunch.time}</p>
                      <Badge variant={confirmationBadgeVariants[lunch.confirmationStatus]}>{confirmationLabels[lunch.confirmationStatus]}</Badge>
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
                    {canManageLunches ? (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button onClick={() => openEditDrawer(lunch)} size="sm" variant="outline">
                          <Pencil />
                          Editar
                        </Button>
                        <DeleteConfirmationDialog
                          confirmLabel="Remover"
                          description={`Remover o almoço de ${formatDate(lunch.date)} às ${lunch.time}? Essa ação remove o agendamento.`}
                          onConfirm={() => removeLunch(lunch)}
                        >
                          <Button size="sm" variant="destructive">
                            <Trash2 />
                            Remover
                          </Button>
                        </DeleteConfirmationDialog>
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
                    <DatePicker value={lunchForm.date} onChange={(value) => setLunchForm((current) => ({ ...current, date: value }))} />
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

                <HybridSelector
                  label="Anfitrião"
                  value={lunchForm.host}
                  options={hostMemberOptions}
                  manualPlaceholder="Digite ou selecione o anfitrião"
                  manualOptionLabel="Manual"
                  onChange={(value) => setLunchForm((current) => ({ ...current, host: value }))}
                />

                <CompanionshipSelect
                  companionships={companionshipSelectOptions}
                  onSelectedIdsChange={(ids) => setLunchForm((current) => ({ ...current, companionshipIds: ids }))}
                  selectedIds={lunchForm.companionshipIds}
                />

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
                  disabled={!currentWard || !lunchForm.date || !lunchForm.time || !isHostFilled(lunchForm.host) || !lunchForm.companionshipIds.length}
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

"use client";

import { CakeSlice, ChevronLeft, ChevronRight, Download, ExternalLink, MapPin, Phone, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  MemberActivityStatusIcon,
  MemberSexIcon,
  memberActivityStatusLabels as churchActivityStatusLabels,
  memberSexLabels as sexLabels,
  memberSexSurfaceClassNames,
} from "@/components/features/members/member-visual-indicators";
import { MemberDemographicPresetSelect } from "@/components/features/members/member-demographic-preset-select";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { buildBirthdayMonthCells, buildMemberBirthdaysCsv, getMemberBirthdaysForMonth } from "@/lib/member-birthdays";
import { cn, todayDate } from "@/lib/utils";
import type { CalendarWeekStartsOn, Member } from "@/types/domain";

type SexFilter = "all" | Member["sex"];
type ActivityStatusFilter = "all" | Member["churchActivityStatus"];

const weekdaysByStart: Record<CalendarWeekStartsOn, string[]> = {
  sunday: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  monday: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"],
};

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Fortaleza",
  }).format(date);
}

function dayLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Fortaleza",
    weekday: "short",
  })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

function parseAgeFilterValue(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function downloadCsv(csv: string, monthDate: Date) {
  const year = monthDate.getFullYear();
  const month = String(monthDate.getMonth() + 1).padStart(2, "0");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = `aniversariantes-${year}-${month}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MemberBirthdayPopover({
  age,
  birthDate,
  formatDate,
  member,
  children,
}: {
  age: number;
  birthDate: string;
  formatDate: (date: string) => string;
  member: Member;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-sm gap-3 p-4">
        <PopoverHeader>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PopoverTitle className="text-base text-pretty">{member.name}</PopoverTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {age} anos · {formatDate(birthDate)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <MemberSexIcon sex={member.sex} />
              <MemberActivityStatusIcon status={member.churchActivityStatus} />
            </div>
          </div>
        </PopoverHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/50 p-3 text-xs">
          <div>
            <p className="text-muted-foreground">Sexo</p>
            <p className="mt-0.5 font-medium">{sexLabels[member.sex]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Frequência</p>
            <p className="mt-0.5 font-medium">{churchActivityStatusLabels[member.churchActivityStatus]}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Nascimento</p>
            <p className="mt-0.5 font-medium tabular-nums">{formatDate(birthDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Organização</p>
            <p className="mt-0.5 font-medium">{member.organization || "Não informada"}</p>
          </div>
        </div>

        {member.phone || member.address ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            {member.phone ? (
              <p className="flex items-start gap-2">
                <Phone className="mt-0.5 size-3.5 shrink-0" />
                <span>{member.phone}</span>
              </p>
            ) : null}
            {member.address ? (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span className="line-clamp-2">{member.address}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        <Button asChild className="w-full">
          <Link href={`/members?member=${encodeURIComponent(member.id)}`}>
            Ver ficha do membro
            <ExternalLink />
          </Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default function MemberBirthdaysPage() {
  const { allMembersByWard, appPreferences, hasPermission } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canExportMembers = hasPermission("members.manage") || hasPermission("exports.run");
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState<ActivityStatusFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");

  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const monthlyBirthdays = useMemo(() => getMemberBirthdaysForMonth(allMembersByWard, monthDate), [allMembersByWard, monthDate]);
  const birthdays = useMemo(
    () =>
      monthlyBirthdays.filter((birthday) => {
        const matchesSex = sexFilter === "all" || birthday.member.sex === sexFilter;
        const matchesActivityStatus = activityStatusFilter === "all" || birthday.member.churchActivityStatus === activityStatusFilter;
        const matchesMinimumAge = minimumAge === null || birthday.age >= minimumAge;
        const matchesMaximumAge = maximumAge === null || birthday.age <= maximumAge;

        return matchesSex && matchesActivityStatus && matchesMinimumAge && matchesMaximumAge;
      }),
    [activityStatusFilter, maximumAge, minimumAge, monthlyBirthdays, sexFilter],
  );
  const advancedFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (sexFilter !== "all") chips.push(`Sexo: ${sexLabels[sexFilter]}`);
    if (activityStatusFilter !== "all") chips.push(`Frequência: ${churchActivityStatusLabels[activityStatusFilter]}`);
    if (minimumAge !== null) chips.push(`Idade >= ${minimumAge}`);
    if (maximumAge !== null) chips.push(`Idade <= ${maximumAge}`);

    return chips;
  }, [activityStatusFilter, maximumAge, minimumAge, sexFilter]);
  const hasAdvancedFilters = advancedFilterChips.length > 0;
  const birthdaysByDate = useMemo(() => {
    const grouped = new Map<string, typeof birthdays>();

    birthdays.forEach((birthday) => {
      grouped.set(birthday.date, [...(grouped.get(birthday.date) ?? []), birthday]);
    });

    return grouped;
  }, [birthdays]);
  const birthdaysByDay = useMemo(() => {
    const grouped = new Map<number, typeof birthdays>();

    birthdays.forEach((birthday) => {
      grouped.set(birthday.day, [...(grouped.get(birthday.day) ?? []), birthday]);
    });

    return [...grouped.entries()];
  }, [birthdays]);
  const monthCells = useMemo(
    () => buildBirthdayMonthCells(monthDate, appPreferences.calendarWeekStartsOn),
    [appPreferences.calendarWeekStartsOn, monthDate],
  );
  const weekdays = weekdaysByStart[appPreferences.calendarWeekStartsOn];

  function moveMonth(offset: number) {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function clearAdvancedFilters() {
    setSexFilter("all");
    setActivityStatusFilter("all");
    setMinimumAgeFilter("");
    setMaximumAgeFilter("");
  }

  function exportCsv() {
    if (!birthdays.length) return;

    downloadCsv(buildMemberBirthdaysCsv(birthdays), monthDate);
    toast.success(`${birthdays.length} aniversariante(s) exportado(s).`);
  }

  return (
    <PermissionGuard permission="members.view">
      <PageHeader
        eyebrow="Membros"
        title="Aniversariantes"
        description="Calendário mensal dos aniversários dos membros ativos da ala."
      />

      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={hasAdvancedFilters ? "secondary" : "outline"}>
                <SlidersHorizontal />
                Mais filtros
                {hasAdvancedFilters ? (
                  <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 tabular-nums" variant="secondary">
                    {advancedFilterChips.length}
                  </Badge>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-xl gap-4 p-4">
              <PopoverHeader>
                <PopoverTitle>Filtros avançados</PopoverTitle>
              </PopoverHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <MemberDemographicPresetSelect
                  className="sm:col-span-2"
                  filter={{ maximumAge: maximumAgeFilter, minimumAge: minimumAgeFilter, sex: sexFilter }}
                  onApply={(preset) => {
                    setSexFilter(preset.sex);
                    setMinimumAgeFilter(preset.minimumAge);
                    setMaximumAgeFilter(preset.maximumAge);
                  }}
                />
                <div className="space-y-1.5">
                  <Label>Sexo</Label>
                  <Select value={sexFilter} onValueChange={(value) => setSexFilter(value as SexFilter)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os sexos</SelectItem>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Frequência</Label>
                  <Select value={activityStatusFilter} onValueChange={(value) => setActivityStatusFilter(value as ActivityStatusFilter)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="attending">{churchActivityStatusLabels.attending}</SelectItem>
                      <SelectItem value="not_attending">{churchActivityStatusLabels.not_attending}</SelectItem>
                      <SelectItem value="away">{churchActivityStatusLabels.away}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Idade mínima</Label>
                  <Input
                    inputMode="numeric"
                    min={0}
                    placeholder="Idade mín."
                    type="number"
                    value={minimumAgeFilter}
                    onChange={(event) => setMinimumAgeFilter(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Idade máxima</Label>
                  <Input
                    inputMode="numeric"
                    min={0}
                    placeholder="Idade máx."
                    type="number"
                    value={maximumAgeFilter}
                    onChange={(event) => setMaximumAgeFilter(event.target.value)}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {canExportMembers ? (
            <Button disabled={!birthdays.length} onClick={exportCsv} variant="outline">
              <Download />
              Exportar CSV
            </Button>
          ) : null}
        </div>
        {hasAdvancedFilters ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {advancedFilterChips.map((chip) => (
              <Badge className="h-7 rounded-lg px-2.5 text-sm font-normal" key={chip} variant="secondary">
                {chip}
              </Badge>
            ))}
            <Button className="h-7 px-2 text-sm" onClick={clearAdvancedFilters} size="sm" variant="ghost">
              Limpar filtros
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="capitalize">{monthLabel(monthDate)}</CardTitle>
                <CardDescription>{birthdays.length ? `${birthdays.length} aniversariante(s) neste mês.` : "Nenhum aniversário neste mês."}</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button aria-label="Mês anterior" onClick={() => moveMonth(-1)} size="icon" variant="outline">
                  <ChevronLeft />
                </Button>
                <Button aria-label="Próximo mês" onClick={() => moveMonth(1)} size="icon" variant="outline">
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            <div className="w-full overflow-hidden">
              <div className="grid grid-cols-7 border-b text-center text-[10px] font-medium text-muted-foreground sm:text-left sm:text-xs">
                {weekdays.map((weekday) => (
                  <div className="px-0.5 pb-2 sm:px-2" key={weekday}>
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((cell) => {
                  const dayBirthdays = birthdaysByDate.get(cell.key) ?? [];
                  const isToday = cell.key === todayDate();

                  return (
                    <div
                      className={cn(
                        "relative min-h-20 border-b border-r px-1 pb-1 pt-8 sm:min-h-32 sm:p-2 sm:pt-10 [&:nth-child(7n+1)]:border-l",
                        !cell.isCurrentMonth && "bg-muted/25 text-muted-foreground/55",
                      )}
                      key={cell.key}
                    >
                      <span
                        className={cn(
                          "absolute left-1 top-1.5 flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums sm:left-2 sm:top-2",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {cell.day}
                      </span>
                      {cell.isCurrentMonth && dayBirthdays.length ? (
                        <>
                          <div className="flex justify-center sm:hidden">
                            <Badge className="h-5 min-w-5 px-1 text-[10px]" variant="secondary">
                              {dayBirthdays.length}
                            </Badge>
                          </div>
                          <div className="hidden space-y-1 sm:block">
                            {dayBirthdays.slice(0, 2).map((birthday) => (
                              <MemberBirthdayPopover
                                age={birthday.age}
                                birthDate={birthday.birthDate}
                                formatDate={formatDate}
                                key={birthday.member.id}
                                member={birthday.member}
                              >
                                <button
                                  className={cn(
                                    "flex min-h-7 w-full items-center rounded-md px-2 py-1 text-left text-xs font-medium text-foreground ring-1 transition-[background-color,box-shadow,transform] active:scale-[0.96]",
                                    memberSexSurfaceClassNames[birthday.member.sex],
                                  )}
                                  title={`${birthday.member.name}, ${birthday.age} anos`}
                                  type="button"
                                >
                                  <span className="min-w-0 flex-1 truncate">{birthday.member.name}</span>
                                  <MemberSexIcon className="ml-1" sex={birthday.member.sex} />
                                </button>
                              </MemberBirthdayPopover>
                            ))}
                            {dayBirthdays.length > 2 ? (
                              <p className="px-2 text-xs text-muted-foreground tabular-nums">+{dayBirthdays.length - 2}</p>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-0 max-h-[32rem] xl:h-0 xl:min-h-full xl:max-h-none">
          <CardHeader>
            <CardTitle className="capitalize">Aniversários de {monthLabel(monthDate)}</CardTitle>
            <CardDescription>Idade que cada membro completa no ano exibido.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            {birthdaysByDay.map(([day, dayBirthdays]) => (
              <section className="space-y-2" key={day}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(dayBirthdays[0].date)}</p>
                <div className="space-y-2">
                  {dayBirthdays.map((birthday) => (
                    <Link
                      className="flex items-center gap-3 rounded-lg border p-3 transition-[background-color,transform] hover:bg-muted/50 active:scale-[0.96]"
                      href={`/members?member=${encodeURIComponent(birthday.member.id)}`}
                      key={birthday.member.id}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <CakeSlice className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-0.5">
                          <span className="truncate font-medium">{birthday.member.name}</span>
                          <MemberSexIcon sex={birthday.member.sex} />
                        </span>
                        <span className="block text-xs text-muted-foreground">{formatDate(birthday.birthDate)}</span>
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MemberActivityStatusIcon status={birthday.member.churchActivityStatus} />
                          {churchActivityStatusLabels[birthday.member.churchActivityStatus]}
                        </span>
                      </span>
                      <Badge className="shrink-0" variant="secondary">
                        {birthday.age} anos
                      </Badge>
                    </Link>
                  ))}
                </div>
              </section>
            ))}

            {!birthdays.length ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <CakeSlice className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Nenhum membro ativo com aniversário neste mês.</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}

"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CalendarDays, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { MemberActivityStatusIcon, MemberSexIcon } from "@/components/features/members/member-visual-indicators";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { TALK_DURATION_OPTIONS, talkDurationShortLabels } from "@/lib/member-talk-duration";
import { cn, normalizeDateInput } from "@/lib/utils";
import type { Member, MemberAttendanceRecord } from "@/types/domain";

type AttendanceBucketKey = "present_last_sunday" | "missed_1" | "missed_2" | "missed_3" | "missed_4_plus";
type AttendanceBucketFilter = "all" | AttendanceBucketKey;
type CoordinatesFilter = "all" | "mapped" | "unmapped";
type SexFilter = "all" | Member["sex"];
type TalkDurationFilter = "all" | Member["sacramentTalkDuration"];

type MemberAttendanceSummary = {
  bucketKey: AttendanceBucketKey;
  lastPresentDate: string | null;
  member: Member;
  missedSundays: number;
  records: MemberAttendanceRecord[];
};

const attendanceBuckets: Array<{
  key: AttendanceBucketKey;
  label: string;
  shortLabel: string;
  className: string;
  textClassName: string;
}> = [
  {
    key: "present_last_sunday",
    label: "Veio no último domingo",
    shortLabel: "Último domingo",
    className: "bg-emerald-600",
    textClassName: "text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "missed_1",
    label: "Faltou 1 domingo",
    shortLabel: "1 domingo",
    className: "bg-lime-500",
    textClassName: "text-lime-700 dark:text-lime-300",
  },
  {
    key: "missed_2",
    label: "Faltou 2 domingos",
    shortLabel: "2 domingos",
    className: "bg-amber-500",
    textClassName: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "missed_3",
    label: "Faltou 3 domingos",
    shortLabel: "3 domingos",
    className: "bg-orange-600",
    textClassName: "text-orange-700 dark:text-orange-300",
  },
  {
    key: "missed_4_plus",
    label: "Não vêm há 4+ domingos",
    shortLabel: "4+ domingos",
    className: "bg-red-600",
    textClassName: "text-red-700 dark:text-red-300",
  },
];

const coordinatesFilterLabels: Record<CoordinatesFilter, string> = {
  all: "Todos mapas",
  mapped: "Com coordenadas",
  unmapped: "Sem coordenadas",
};

function getAttendanceBucket(missedSundays: number): AttendanceBucketKey {
  if (missedSundays <= 0) return "present_last_sunday";
  if (missedSundays === 1) return "missed_1";
  if (missedSundays === 2) return "missed_2";
  if (missedSundays === 3) return "missed_3";

  return "missed_4_plus";
}

function buildMemberAttendanceSummaries(members: Member[], records: MemberAttendanceRecord[]): MemberAttendanceSummary[] {
  const sundayDates = [...new Set(records.map((record) => record.date).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const recordsByMember = new Map<string, MemberAttendanceRecord[]>();

  records.forEach((record) => {
    recordsByMember.set(record.memberId, [...(recordsByMember.get(record.memberId) ?? []), record]);
  });

  return members.map((member) => {
    const memberRecords = [...(recordsByMember.get(member.id) ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    const presentDates = new Set(memberRecords.filter((record) => record.present).map((record) => record.date));
    const lastPresentIndex = sundayDates.findIndex((date) => presentDates.has(date));
    const missedSundays = lastPresentIndex >= 0 ? lastPresentIndex : sundayDates.length;

    return {
      bucketKey: getAttendanceBucket(missedSundays),
      lastPresentDate: lastPresentIndex >= 0 ? sundayDates[lastPresentIndex] : null,
      member,
      missedSundays,
      records: memberRecords,
    };
  });
}

function calculateAge(birthDate: string) {
  const normalizedDate = normalizeDateInput(birthDate);
  if (!normalizedDate) return null;

  const today = new Date();
  const birth = new Date(`${normalizedDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function parseAgeFilterValue(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function matchesAgeRange(age: number | null, minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return true;
  if (age === null) return false;
  if (minimum !== null && age < minimum) return false;
  if (maximum !== null && age > maximum) return false;

  return true;
}

function hasValidCoordinates(member: Member) {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

export default function MemberAttendancePage() {
  const { formatDate, formatDateTime } = useDateFormatter();
  const { allMembersByWard, memberAttendanceRecordsByWard } = useAppContext();
  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState<AttendanceBucketFilter>("all");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [coordinatesFilter, setCoordinatesFilter] = useState<CoordinatesFilter>("all");
  const [talkDurationFilter, setTalkDurationFilter] = useState<TalkDurationFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");

  const latestAttendanceUpdateAt = useMemo(
    () =>
      memberAttendanceRecordsByWard
        .map((record) => record.updatedAt ?? record.createdAt ?? "")
        .filter((date) => !Number.isNaN(new Date(date).getTime()))
        .sort((a, b) => b.localeCompare(a))[0] ?? null,
    [memberAttendanceRecordsByWard],
  );
  const summaries = useMemo(
    () => buildMemberAttendanceSummaries(allMembersByWard, memberAttendanceRecordsByWard),
    [allMembersByWard, memberAttendanceRecordsByWard],
  );
  const summariesByBucket = useMemo(() => {
    const grouped = new Map<AttendanceBucketKey, MemberAttendanceSummary[]>();

    attendanceBuckets.forEach((bucket) => grouped.set(bucket.key, []));
    summaries.forEach((summary) => grouped.set(summary.bucketKey, [...(grouped.get(summary.bucketKey) ?? []), summary]));

    return grouped;
  }, [summaries]);
  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredSummaries = useMemo(
    () =>
      summaries.filter((summary) => {
        const age = calculateAge(summary.member.birthDate);
        const matchesSearch =
          !normalizedSearch ||
          summary.member.name.toLowerCase().includes(normalizedSearch) ||
          summary.member.phone.toLowerCase().includes(normalizedSearch) ||
          summary.member.address.toLowerCase().includes(normalizedSearch);
        const matchesBucket = bucketFilter === "all" || summary.bucketKey === bucketFilter;
        const matchesSex = sexFilter === "all" || summary.member.sex === sexFilter;
        const memberHasCoordinates = hasValidCoordinates(summary.member);
        const matchesCoordinates =
          coordinatesFilter === "all" || (coordinatesFilter === "mapped" && memberHasCoordinates) || (coordinatesFilter === "unmapped" && !memberHasCoordinates);
        const matchesTalkDuration = talkDurationFilter === "all" || summary.member.sacramentTalkDuration === talkDurationFilter;
        const matchesAge = matchesAgeRange(age, minimumAge, maximumAge);

        return matchesSearch && matchesBucket && matchesSex && matchesCoordinates && matchesTalkDuration && matchesAge;
      }),
    [bucketFilter, coordinatesFilter, maximumAge, minimumAge, normalizedSearch, sexFilter, summaries, talkDurationFilter],
  );
  const totalMembers = summaries.length;
  const withoutRecords = summaries.filter((summary) => summary.records.length === 0).length;
  const hasAdvancedFilters =
    bucketFilter !== "all" || sexFilter !== "all" || coordinatesFilter !== "all" || talkDurationFilter !== "all" || minimumAge !== null || maximumAge !== null;
  const advancedFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (bucketFilter !== "all") chips.push(attendanceBuckets.find((bucket) => bucket.key === bucketFilter)?.label ?? "Situação");
    if (sexFilter !== "all") chips.push(`Sexo: ${sexFilter === "M" ? "Masculino" : "Feminino"}`);
    if (coordinatesFilter !== "all") chips.push(coordinatesFilterLabels[coordinatesFilter]);
    if (talkDurationFilter !== "all") chips.push(`Discurso: ${talkDurationShortLabels[talkDurationFilter]}`);
    if (minimumAge !== null) chips.push(`Idade >= ${minimumAge}`);
    if (maximumAge !== null) chips.push(`Idade <= ${maximumAge}`);

    return chips;
  }, [bucketFilter, coordinatesFilter, maximumAge, minimumAge, sexFilter, talkDurationFilter]);

  function clearAdvancedFilters() {
    setBucketFilter("all");
    setSexFilter("all");
    setCoordinatesFilter("all");
    setTalkDurationFilter("all");
    setMinimumAgeFilter("");
    setMaximumAgeFilter("");
  }

  const columns = useMemo<ColumnDef<MemberAttendanceSummary>[]>(
    () => [
      {
        id: "member",
        accessorFn: (summary) => summary.member.name,
        meta: { label: "Membro" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Membro {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const summary = row.original;

          return (
            <div className="flex min-w-0 items-center gap-2">
              <MemberSexIcon sex={summary.member.sex} />
              <MemberActivityStatusIcon status={summary.member.churchActivityStatus} />
              <div className="min-w-0">
                <TablePrimaryAction asChild>
                  <Link href={`/members?member=${encodeURIComponent(summary.member.id)}&tab=attendance`}>{summary.member.name}</Link>
                </TablePrimaryAction>
                <div className="flex min-w-0 items-center gap-1">
                  {summary.member.phone ? <p className="truncate text-xs text-muted-foreground">{summary.member.phone}</p> : null}
                  {summary.member.archivedAt ? <Badge variant="secondary">Arquivado</Badge> : null}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "bucket",
        accessorFn: (summary) => summary.missedSundays,
        meta: { label: "Situação" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Situação {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const bucket = attendanceBuckets.find((item) => item.key === row.original.bucketKey) ?? attendanceBuckets[0];

          return <Badge className={cn("border-transparent text-white", bucket.className)}>{bucket.shortLabel}</Badge>;
        },
      },
      {
        id: "lastPresentDate",
        accessorFn: (summary) => summary.lastPresentDate ?? "",
        meta: { label: "Última presença" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Última presença {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.lastPresentDate ? formatDate(row.original.lastPresentDate) : "Sem presença registrada"}
          </span>
        ),
      },
      {
        id: "records",
        accessorFn: (summary) => summary.records.length,
        meta: { label: "Registros" },
        header: ({ column }) => (
          <div className="text-right">
            <Button className="-mr-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
              Registros {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
            </Button>
          </div>
        ),
        cell: ({ row }) => <div className="text-right tabular-nums">{row.original.records.length}</div>,
      },
    ],
    [formatDate],
  );

  return (
    <PermissionGuard permission="members.view">
      <PageHeader
        eyebrow="Membros"
        title="Frequência dos membros"
        description="Distribuição dos membros cadastrados por presença nos últimos domingos importados."
      />

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Membros totais</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                <Users className="size-5 text-muted-foreground" />
                {totalMembers}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Última atualização</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
                <CalendarDays className="size-5 text-muted-foreground" />
                {latestAttendanceUpdateAt ? formatDateTime(latestAttendanceUpdateAt) : "Sem dados"}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Sem histórico importado</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{withoutRecords}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumo por domingos</CardTitle>
            <CardDescription>Da esquerda para a direita: presença mais recente até maior tempo sem vir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex h-12 overflow-hidden rounded-md border bg-muted">
              {attendanceBuckets.map((bucket) => {
                const count = summariesByBucket.get(bucket.key)?.length ?? 0;
                const width = totalMembers ? (count / totalMembers) * 100 : 0;

                return (
                  <div
                    aria-label={`${bucket.label}: ${count} membros`}
                    className={cn("flex min-w-0 items-center justify-center px-2 text-xs font-semibold text-white", bucket.className)}
                    key={bucket.key}
                    style={{ width: `${width}%` }}
                    title={`${bucket.label}: ${count}`}
                  >
                    {width >= 10 ? <span className="truncate tabular-nums">{count}</span> : null}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {attendanceBuckets.map((bucket) => {
                const bucketSummaries = summariesByBucket.get(bucket.key) ?? [];
                const percentage = totalMembers ? Math.round((bucketSummaries.length / totalMembers) * 100) : 0;

                return (
                  <div className="rounded-md border bg-background p-3" key={bucket.key}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={cn("text-sm font-medium", bucket.textClassName)}>{bucket.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{percentage}% dos membros cadastrados</p>
                      </div>
                      <span className="text-xl font-semibold tabular-nums">{bucketSummaries.length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <DataTable
          columns={columns}
          data={filteredSummaries}
          emptyMessage="Nenhum membro encontrado com os filtros atuais."
          enableColumnVisibility
          getRowId={(summary) => summary.member.id}
          pageSize={10}
          toolbar={
            <div className="space-y-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <SearchInput
                    className="min-w-0 flex-1 lg:max-w-sm"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar por nome, telefone ou endereço"
                    value={search}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="default" variant={hasAdvancedFilters ? "secondary" : "outline"}>
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
                        <div className="space-y-1.5">
                          <Label>Situação</Label>
                          <Select value={bucketFilter} onValueChange={(value) => setBucketFilter(value as AttendanceBucketFilter)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas as situações</SelectItem>
                              {attendanceBuckets.map((bucket) => (
                                <SelectItem key={bucket.key} value={bucket.key}>
                                  {bucket.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
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
                          <Label>Mapa</Label>
                          <Select value={coordinatesFilter} onValueChange={(value) => setCoordinatesFilter(value as CoordinatesFilter)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos mapas</SelectItem>
                              <SelectItem value="mapped">Com coordenadas</SelectItem>
                              <SelectItem value="unmapped">Sem coordenadas</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Discurso</Label>
                          <Select value={talkDurationFilter} onValueChange={(value) => setTalkDurationFilter(value as TalkDurationFilter)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos discursos</SelectItem>
                              {TALK_DURATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.shortLabel}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Idade mínima</Label>
                          <Input
                            inputMode="numeric"
                            min={0}
                            onChange={(event) => setMinimumAgeFilter(event.target.value)}
                            placeholder="Idade mín."
                            type="number"
                            value={minimumAgeFilter}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Idade máxima</Label>
                          <Input
                            inputMode="numeric"
                            min={0}
                            onChange={(event) => setMaximumAgeFilter(event.target.value)}
                            placeholder="Idade máx."
                            type="number"
                            value={maximumAgeFilter}
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
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
          }
        />
      </div>
    </PermissionGuard>
  );
}

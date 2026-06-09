"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ClockAlert, NotebookTabs, Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  memberActivityStatusLabels as churchActivityStatusLabels,
  memberSexLabels as sexLabels,
} from "@/components/features/members/member-visual-indicators";
import { MemberDemographicPresetSelect } from "@/components/features/members/member-demographic-preset-select";
import { useAppContext } from "@/components/providers/app-provider";
import { DashboardStatCard } from "@/components/shared/dashboard-stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { resolvePersistedMemberFrequencyStatus } from "@/lib/member-attendance";
import { TALK_DURATION_OPTIONS, talkDurationShortLabels } from "@/lib/member-talk-duration";
import {
  MEMBER_PROGRESS_CATEGORY_OPTIONS,
  memberProgressCategoryBadgeClasses,
  memberProgressCategoryLabels,
} from "@/lib/member-progress-category";
import { cn, localTodayDate, normalizeDateInput } from "@/lib/utils";
import type { Member, MemberAttendanceRecord, MemberNote, MemberProgressCategory } from "@/types/domain";

const STALE_PROGRESS_MS = 7 * 24 * 60 * 60 * 1000;
const PROGRESS_REFERENCE_TIME = new Date().getTime();
const RECENT_SUNDAY_COUNT = 6;

type ProgressStatus = "current" | "stale";
type ProgressStatusFilter = "all" | ProgressStatus;
type ProgressCategoryFilter = "all" | Exclude<MemberProgressCategory, "disconnected">;
type ActivityStatusFilter = "all" | Member["churchActivityStatus"];
type CoordinatesFilter = "all" | "mapped" | "unmapped";
type SexFilter = "all" | Member["sex"];
type TalkDurationFilter = "all" | Member["sacramentTalkDuration"];

type MemberProgressRow = {
  attendanceByDate: Map<string, MemberAttendanceRecord>;
  member: Member;
  latestProgress: MemberNote;
  status: ProgressStatus;
};

const coordinatesFilterLabels: Record<CoordinatesFilter, string> = {
  all: "Todos mapas",
  mapped: "Com coordenadas",
  unmapped: "Sem coordenadas",
};

function calculateAge(birthDate: string) {
  const normalizedDate = normalizeDateInput(birthDate);
  if (!normalizedDate) return null;

  const today = new Date();
  const birth = new Date(`${normalizedDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) age -= 1;

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

function getRecentSundayDates(referenceDate: string, count: number) {
  const reference = new Date(`${referenceDate}T12:00:00`);
  reference.setDate(reference.getDate() - reference.getDay());

  return Array.from({ length: count }, (_, index) => {
    const sunday = new Date(reference);
    sunday.setDate(reference.getDate() - (count - index - 1) * 7);
    return `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
  });
}

export default function ProgressPage() {
  const { hasPermission, memberAttendanceRecordsByWard, memberNotesByWard, membersByWard } = useAppContext();
  const { formatDate, formatDateTime } = useDateFormatter();
  const canManageProgress = hasPermission("progress.manage");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProgressStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ProgressCategoryFilter>("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState<ActivityStatusFilter>("all");
  const [coordinatesFilter, setCoordinatesFilter] = useState<CoordinatesFilter>("all");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [talkDurationFilter, setTalkDurationFilter] = useState<TalkDurationFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");
  const recentSundayDates = useMemo(() => getRecentSundayDates(localTodayDate(), RECENT_SUNDAY_COUNT), []);
  const attendanceRecordsByMemberId = useMemo(() => {
    const recordsByMemberId = new Map<string, MemberAttendanceRecord[]>();

    memberAttendanceRecordsByWard.forEach((record) => {
      recordsByMemberId.set(record.memberId, [...(recordsByMemberId.get(record.memberId) ?? []), record]);
    });

    return recordsByMemberId;
  }, [memberAttendanceRecordsByWard]);

  const progressRows = useMemo(() => {
    const latestProgressByMemberId = new Map<string, MemberNote>();

    memberNotesByWard.forEach((note) => {
      const current = latestProgressByMemberId.get(note.memberId);
      if (!current || new Date(note.occurredAt).getTime() > new Date(current.occurredAt).getTime()) {
        latestProgressByMemberId.set(note.memberId, note);
      }
    });

    return membersByWard
      .flatMap<MemberProgressRow>((member) => {
        if (member.progressCategory === "disconnected") return [];

        const latestProgress = latestProgressByMemberId.get(member.id);
        if (!latestProgress) return [];

        const elapsed = PROGRESS_REFERENCE_TIME - new Date(latestProgress.occurredAt).getTime();

        return [
          {
            attendanceByDate: new Map((attendanceRecordsByMemberId.get(member.id) ?? []).map((record) => [record.date, record])),
            member,
            latestProgress,
            status: elapsed >= STALE_PROGRESS_MS ? "stale" : "current",
          },
        ];
      })
      .sort((a, b) => new Date(b.latestProgress.occurredAt).getTime() - new Date(a.latestProgress.occurredAt).getTime());
  }, [attendanceRecordsByMemberId, memberNotesByWard, membersByWard]);

  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const advancedFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (categoryFilter !== "all") chips.push(`Categoria: ${memberProgressCategoryLabels[categoryFilter]}`);
    if (statusFilter !== "all") chips.push(`Situação: ${statusFilter === "current" ? "Em dia" : "7+ dias sem registro"}`);
    if (activityStatusFilter !== "all") chips.push(`Frequência: ${churchActivityStatusLabels[activityStatusFilter]}`);
    if (sexFilter !== "all") chips.push(`Sexo: ${sexLabels[sexFilter]}`);
    if (coordinatesFilter !== "all") chips.push(coordinatesFilterLabels[coordinatesFilter]);
    if (talkDurationFilter !== "all") chips.push(`Discurso: ${talkDurationShortLabels[talkDurationFilter]}`);
    if (minimumAge !== null) chips.push(`Idade >= ${minimumAge}`);
    if (maximumAge !== null) chips.push(`Idade <= ${maximumAge}`);

    return chips;
  }, [activityStatusFilter, categoryFilter, coordinatesFilter, maximumAge, minimumAge, sexFilter, statusFilter, talkDurationFilter]);
  const hasAdvancedFilters = advancedFilterChips.length > 0;

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return progressRows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || row.member.progressCategory === categoryFilter;
      const frequencyStatus = resolvePersistedMemberFrequencyStatus(
        row.member,
        attendanceRecordsByMemberId.get(row.member.id) ?? [],
      ).status;
      const matchesActivityStatus = activityStatusFilter === "all" || frequencyStatus === activityStatusFilter;
      const matchesSex = sexFilter === "all" || row.member.sex === sexFilter;
      const memberHasCoordinates = hasValidCoordinates(row.member);
      const matchesCoordinates =
        coordinatesFilter === "all" ||
        (coordinatesFilter === "mapped" && memberHasCoordinates) ||
        (coordinatesFilter === "unmapped" && !memberHasCoordinates);
      const matchesTalkDuration = talkDurationFilter === "all" || row.member.sacramentTalkDuration === talkDurationFilter;
      const matchesAge = matchesAgeRange(calculateAge(row.member.birthDate), minimumAge, maximumAge);
      const searchableText =
        `${row.member.name} ${row.latestProgress.text} ${row.latestProgress.createdByName} ${memberProgressCategoryLabels[row.member.progressCategory]}`.toLocaleLowerCase(
          "pt-BR",
        );
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);

      return (
        matchesStatus &&
        matchesCategory &&
        matchesActivityStatus &&
        matchesSex &&
        matchesCoordinates &&
        matchesTalkDuration &&
        matchesAge &&
        matchesSearch
      );
    });
  }, [
    activityStatusFilter,
    attendanceRecordsByMemberId,
    categoryFilter,
    coordinatesFilter,
    maximumAge,
    minimumAge,
    progressRows,
    search,
    sexFilter,
    statusFilter,
    talkDurationFilter,
  ]);

  const staleCount = progressRows.filter((row) => row.status === "stale").length;

  function clearAdvancedFilters() {
    setCategoryFilter("all");
    setStatusFilter("all");
    setActivityStatusFilter("all");
    setCoordinatesFilter("all");
    setSexFilter("all");
    setTalkDurationFilter("all");
    setMinimumAgeFilter("");
    setMaximumAgeFilter("");
  }

  const columns = useMemo<ColumnDef<MemberProgressRow>[]>(
    () => [
      {
        id: "member",
        header: "Membro",
        cell: ({ row }) => (
          <TablePrimaryAction asChild>
            <Link href={`/members?member=${encodeURIComponent(row.original.member.id)}&tab=progress`}>{row.original.member.name}</Link>
          </TablePrimaryAction>
        ),
      },
      {
        id: "category",
        header: "Categoria",
        cell: ({ row }) => (
          <Badge className={memberProgressCategoryBadgeClasses[row.original.member.progressCategory]} variant="outline">
            {memberProgressCategoryLabels[row.original.member.progressCategory]}
          </Badge>
        ),
      },
      {
        id: "attendance",
        header: "Frequência",
        cell: ({ row }) => (
          <div
            aria-label={recentSundayDates
              .map((date) => {
                const record = row.original.attendanceByDate.get(date);
                return `${formatDate(date)}: ${record ? (record.present ? "presente" : "ausente") : "sem registro"}`;
              })
              .join("; ")}
            className="flex items-center gap-1.5"
          >
            {recentSundayDates.map((date) => {
              const record = row.original.attendanceByDate.get(date);
              const status = record ? (record.present ? "Presente" : "Ausente") : "Sem registro";

              return (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-3 rounded-full border",
                    record?.present
                      ? "border-emerald-600 bg-emerald-500"
                      : record
                        ? "border-red-600 bg-red-500"
                        : "border-muted-foreground/30 bg-muted",
                  )}
                  key={date}
                  title={`${formatDate(date)}: ${status}`}
                />
              );
            })}
          </div>
        ),
      },
      {
        id: "occurredAt",
        header: "Último registro",
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.latestProgress.occurredAt)}</span>,
      },
      {
        id: "text",
        header: "Último progresso",
        cell: ({ row }) => (
          <p className="max-w-[32rem] line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground" title={row.original.latestProgress.text}>
            {row.original.latestProgress.text}
          </p>
        ),
      },
      {
        id: "author",
        header: "Autor",
        cell: ({ row }) => row.original.latestProgress.createdByName,
      },
      {
        id: "status",
        header: "Situação",
        cell: ({ row }) =>
          row.original.status === "stale" ? (
            <Badge variant="destructive">7+ dias</Badge>
          ) : (
            <Badge variant="secondary">Em dia</Badge>
          ),
      },
      ...(canManageProgress
        ? [
            {
              id: "actions",
              header: () => <span className="sr-only">Ações</span>,
              enableHiding: false,
              cell: ({ row }) => (
                <div className="text-right">
                  <TableActionButton asChild label="Registrar progresso">
                    <Link href={`/members?member=${encodeURIComponent(row.original.member.id)}&tab=progress`}>
                      <Plus />
                    </Link>
                  </TableActionButton>
                </div>
              ),
            } satisfies ColumnDef<MemberProgressRow>,
          ]
        : []),
    ],
    [canManageProgress, formatDate, formatDateTime, recentSundayDates],
  );

  return (
    <PermissionGuard permission="progress.view">
      <div>
        <PageHeader
          eyebrow="Membros"
          title="Progressos"
          description="Visão geral dos membros acompanhados e de quem está há mais tempo sem um novo registro."
        />

        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <DashboardStatCard
            description="Membros ativos, categorizados e com ao menos um registro."
            icon={<NotebookTabs className="size-5" />}
            title="Membros em progresso"
            value={progressRows.length}
          />
          <DashboardStatCard
            description="Membros acompanhados sem atualização nos últimos 7 dias."
            icon={<ClockAlert className="size-5" />}
            title="7+ dias sem registro"
            value={staleCount}
          />
        </div>

        <DataTable
          columns={columns}
          data={filteredRows}
          emptyMessage={
            progressRows.length
              ? "Nenhum membro em progresso encontrado com os filtros atuais."
              : "Nenhum membro ativo possui categoria de acompanhamento e progresso registrado."
          }
          enableColumnVisibility
          getRowId={(row) => row.member.id}
          pageSize={10}
          toolbar={
            <div className="space-y-2">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <SearchInput
                    className="min-w-0 flex-1 lg:max-w-sm"
                    placeholder="Buscar por membro, progresso, autor ou categoria"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
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
                          <Label>Categoria</Label>
                          <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as ProgressCategoryFilter)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas as categorias</SelectItem>
                              {MEMBER_PROGRESS_CATEGORY_OPTIONS.filter((option) => option.value !== "disconnected").map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Situação</Label>
                          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProgressStatusFilter)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas as situações</SelectItem>
                              <SelectItem value="current">Em dia</SelectItem>
                              <SelectItem value="stale">7+ dias sem registro</SelectItem>
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

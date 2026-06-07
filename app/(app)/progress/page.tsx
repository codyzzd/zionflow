"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ClockAlert, NotebookTabs, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { DashboardStatCard } from "@/components/shared/dashboard-stat-card";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import {
  MEMBER_PROGRESS_CATEGORY_OPTIONS,
  memberProgressCategoryLabels,
} from "@/lib/member-progress-category";
import type { Member, MemberNote, MemberProgressCategory } from "@/types/domain";

const STALE_PROGRESS_MS = 7 * 24 * 60 * 60 * 1000;
const PROGRESS_REFERENCE_TIME = new Date().getTime();

type ProgressStatus = "current" | "stale";
type ProgressStatusFilter = "all" | ProgressStatus;
type ProgressCategoryFilter = "all" | Exclude<MemberProgressCategory, "disconnected">;

type MemberProgressRow = {
  member: Member;
  latestProgress: MemberNote;
  status: ProgressStatus;
};

export default function ProgressPage() {
  const { memberNotesByWard, membersByWard } = useAppContext();
  const { formatDateTime } = useDateFormatter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProgressStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ProgressCategoryFilter>("all");

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
            member,
            latestProgress,
            status: elapsed >= STALE_PROGRESS_MS ? "stale" : "current",
          },
        ];
      })
      .sort((a, b) => new Date(b.latestProgress.occurredAt).getTime() - new Date(a.latestProgress.occurredAt).getTime());
  }, [memberNotesByWard, membersByWard]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return progressRows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || row.member.progressCategory === categoryFilter;
      const searchableText =
        `${row.member.name} ${row.latestProgress.text} ${row.latestProgress.createdByName} ${memberProgressCategoryLabels[row.member.progressCategory]}`.toLocaleLowerCase(
          "pt-BR",
        );
      const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesStatus && matchesCategory && matchesSearch;
    });
  }, [categoryFilter, progressRows, search, statusFilter]);

  const staleCount = progressRows.filter((row) => row.status === "stale").length;

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
        cell: ({ row }) => <Badge variant="outline">{memberProgressCategoryLabels[row.original.member.progressCategory]}</Badge>,
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
      },
    ],
    [formatDateTime],
  );

  return (
    <PermissionGuard permission="members.manage">
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <SearchInput
                className="sm:max-w-md"
                placeholder="Buscar por membro, progresso, autor ou categoria"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={categoryFilter} onValueChange={(value) => value && setCategoryFilter(value as ProgressCategoryFilter)}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="Categoria" />
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
              <Select value={statusFilter} onValueChange={(value) => value && setStatusFilter(value as ProgressStatusFilter)}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="current">Em dia</SelectItem>
                  <SelectItem value="stale">7+ dias sem registro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>
    </PermissionGuard>
  );
}

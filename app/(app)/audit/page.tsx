"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import type { AuditLog } from "@/types/domain";

const auditScreenOptions = [
  { value: "mapa", label: "Mapa" },
  { value: "membros", label: "Membros" },
  { value: "atas", label: "Atas" },
  { value: "progresso", label: "Progresso" },
  { value: "missionarios", label: "Missionários" },
  { value: "ronda", label: "Ronda" },
  { value: "caravanas", label: "Caravanas" },
  { value: "usuarios", label: "Usuários" },
  { value: "ala", label: "Ala" },
  { value: "estaca", label: "Estaca" },
  { value: "frequencia", label: "Frequência" },
  { value: "almocos", label: "Almoços" },
  { value: "autenticacao", label: "Autenticação" },
  { value: "sistema", label: "Sistema" },
  { value: "outros", label: "Outros" },
] as const;

type AuditScreen = (typeof auditScreenOptions)[number]["value"];
type AuditScreenFilter = "all" | AuditScreen;
type WardFilter = "all" | "system" | string;

type AuditRow = AuditLog & {
  actorEmail?: string;
  actorName: string;
  screen: AuditScreen;
  screenLabel: string;
  wardName: string;
};

const auditScreenLabels = Object.fromEntries(auditScreenOptions.map((option) => [option.value, option.label])) as Record<AuditScreen, string>;

function resolveAuditScreen(log: AuditLog): AuditScreen {
  const action = log.action.toUpperCase();
  const auditModule = log.module.toLowerCase();

  if (action.includes("PROGRESS")) return "progresso";
  if (action.includes("STAKE")) return "estaca";
  if (action.includes("WARD")) return "ala";
  if (action.includes("USER") || action.includes("ROLE") || auditModule.includes("usuario") || auditModule.includes("template")) return "usuarios";
  if (action.includes("MINUTE") || auditModule.includes("ata")) return "atas";
  if (action.includes("ATTENDANCE") || auditModule.includes("frequ")) return "frequencia";
  if (action.includes("MEMBER") || auditModule.includes("membro")) return "membros";
  if (auditModule.includes("map")) return "mapa";
  if (auditModule.includes("missionar")) return action.includes("LUNCH") || action.includes("HOST_HOUSE") ? "almocos" : "missionarios";
  if (auditModule.includes("ronda") || auditModule.includes("patrol")) return "ronda";
  if (auditModule.includes("caravana")) return "caravanas";
  if (auditModule.includes("auth")) return "autenticacao";
  if (auditModule.includes("ala")) return "ala";
  if (auditModule.includes("estaca") || auditModule.includes("lideranca_estaca")) return "estaca";
  if (auditModule.includes("sistema") || auditModule.includes("onboarding")) return "sistema";

  return "outros";
}

export default function AuditPage() {
  const { currentWard, db } = useAppContext();
  const { formatDateTime } = useDateFormatter();
  const [search, setSearch] = useState("");
  const [screenFilter, setScreenFilter] = useState<AuditScreenFilter>("all");
  const [wardFilter, setWardFilter] = useState<WardFilter>(() => currentWard?.id || "all");

  const wardOptions = useMemo(
    () => [...db.wards].sort((left, right) => left.name.localeCompare(right.name, "pt-BR")),
    [db.wards],
  );

  const rows = useMemo<AuditRow[]>(() => {
    const usersById = new Map(db.users.map((user) => [user.id, user]));
    const wardsById = new Map(db.wards.map((ward) => [ward.id, ward.name]));

    return db.auditLogs
      .map((log) => {
        const actor = usersById.get(log.actorUserId);
        const screen = resolveAuditScreen(log);

        return {
          ...log,
          actorEmail: actor?.email,
          actorName: actor?.name || `Usuário removido (${log.actorUserId})`,
          screen,
          screenLabel: auditScreenLabels[screen],
          wardName: wardsById.get(log.wardId) || (log.wardId ? "Ala removida" : "Sistema"),
        };
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [db.auditLogs, db.users, db.wards]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (screenFilter !== "all" && row.screen !== screenFilter) return false;
      if (wardFilter === "system" && row.wardId) return false;
      if (wardFilter !== "all" && wardFilter !== "system" && row.wardId !== wardFilter) return false;
      if (!normalizedSearch) return true;

      const text = [
        row.action,
        row.module,
        row.itemLabel,
        row.summary,
        row.actorName,
        row.actorEmail,
        row.screenLabel,
        row.wardName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(normalizedSearch);
    });
  }, [rows, screenFilter, search, wardFilter]);

  const columns = useMemo<ColumnDef<AuditRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "Quando",
        cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.createdAt)}</span>,
      },
      {
        accessorKey: "actorName",
        header: "Quem tomou a ação",
        cell: ({ row }) => (
          <div className="min-w-44">
            <p className="font-medium">{row.original.actorName}</p>
            {row.original.actorEmail ? <p className="text-xs text-muted-foreground">{row.original.actorEmail}</p> : null}
          </div>
        ),
      },
      {
        accessorKey: "screenLabel",
        header: "Tela",
        cell: ({ row }) => <Badge variant="secondary">{row.original.screenLabel}</Badge>,
      },
      {
        accessorKey: "action",
        header: "Ação",
        cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
      },
      {
        accessorKey: "wardName",
        header: "Ala",
      },
      {
        accessorKey: "itemLabel",
        header: "Item",
      },
      {
        accessorKey: "summary",
        header: "Resumo",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.summary}</span>,
      },
    ],
    [formatDateTime],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Auditoria"
          description="Histórico global das ações realizadas no SuperAla."
        />

        <Card>
          <CardHeader>
            <CardTitle>Eventos recentes</CardTitle>
            <CardDescription>Consulte quem realizou cada ação e filtre os eventos por ala e tela de origem.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={filteredRows}
              emptyMessage="Nenhum evento encontrado com os filtros atuais."
              getRowId={(row) => row.id}
              pageSize={10}
              pageSizeOptions={[10, 25, 50, 100]}
              toolbar={
                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <SearchInput
                    className="min-w-0 flex-1 md:max-w-md"
                    placeholder="Buscar por ação, usuário, item ou ala"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <Select value={wardFilter} onValueChange={setWardFilter}>
                    <SelectTrigger className="w-full md:w-[220px]">
                      <SelectValue placeholder="Selecionar ala" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as alas</SelectItem>
                      <SelectItem value="system">Eventos do sistema</SelectItem>
                      {wardOptions.map((ward) => (
                        <SelectItem key={ward.id} value={ward.id}>
                          {ward.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={screenFilter} onValueChange={(value) => setScreenFilter(value as AuditScreenFilter)}>
                    <SelectTrigger className="w-full md:w-[220px]">
                      <SelectValue placeholder="Todas as telas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as telas</SelectItem>
                      {auditScreenOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    </SystemAdminGuard>
  );
}

"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import type { Caravan, CaravanRegistration } from "@/types/domain";

function dateTimeKey(date: string, time: string) {
  return `${date || "0000-00-00"}T${time || "00:00"}`;
}

function getRegistrationStats(registrations: CaravanRegistration[], caravanId: string) {
  const byCaravan = registrations.filter((registration) => registration.caravanId === caravanId);
  const approved = byCaravan.filter((registration) => registration.isApproved).length;
  const paid = byCaravan.filter((registration) => registration.isPaid).length;

  return {
    total: byCaravan.length,
    approved,
    paid,
  };
}

export default function CaravanApprovalsPage() {
  const { caravanRegistrationsByWard, caravansByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const [search, setSearch] = useState("");

  const filteredCaravans = useMemo(
    () =>
      caravansByWard
        .filter((caravan) => {
          const normalizedSearch = search.trim().toLowerCase();
          if (caravan.archivedAt) return false;
          if (!normalizedSearch) return true;

          return caravan.destination.toLowerCase().includes(normalizedSearch);
        })
        .sort((a, b) => dateTimeKey(a.departureDate, a.departureTime).localeCompare(dateTimeKey(b.departureDate, b.departureTime))),
    [caravansByWard, search],
  );

  const columns = useMemo<ColumnDef<Caravan>[]>(
    () => [
      {
        accessorKey: "destination",
        meta: { label: "Destino" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Destino {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const caravan = row.original;
          const stats = getRegistrationStats(caravanRegistrationsByWard, row.original.id);

          return (
            <div className="space-y-1">
              <TablePrimaryAction asChild>
                <Link href={`/caravans/approve/${caravan.id}`}>{caravan.destination}</Link>
              </TablePrimaryAction>
              <p className="text-xs text-muted-foreground tabular-nums">{stats.total} passageiro(s) inscrito(s)</p>
            </div>
          );
        },
      },
      {
        accessorKey: "departureDate",
        meta: { label: "Partida" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Partida {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const caravan = row.original;

          return (
            <div className="space-y-1">
              <p>{formatDate(caravan.departureDate)}</p>
              <p className="text-xs text-muted-foreground">{caravan.departureTime}</p>
            </div>
          );
        },
      },
      {
        id: "approval",
        header: "Aprovação",
        cell: ({ row }) => {
          const stats = getRegistrationStats(caravanRegistrationsByWard, row.original.id);

          return (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="tabular-nums">
                {stats.approved}/{stats.total} ok
              </Badge>
              <Badge variant="outline" className="tabular-nums">
                {stats.paid}/{stats.total} pago
              </Badge>
            </div>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <TableActionButton asChild label="Abrir">
              <Link href={`/caravans/approve/${row.original.id}`}>
                <ExternalLink />
              </Link>
            </TableActionButton>
          </div>
        ),
      },
    ],
    [caravanRegistrationsByWard, formatDate],
  );

  return (
    <PermissionGuard permission="caravan.approve.view">
      <div>
        <PageHeader
          eyebrow="Caravana"
          title="Aprovar passageiros"
          description="Abra uma caravana para conferir inscritos, marcar aprovação, marcar pagamento ou remover passageiros."
        />

        <DataTable
          columns={columns}
          data={filteredCaravans}
          emptyMessage="Nenhuma caravana encontrada com os filtros atuais."
          enableColumnVisibility
          getRowId={(caravan) => caravan.id}
          toolbar={<Input className="md:max-w-lg" placeholder="Buscar por destino" value={search} onChange={(event) => setSearch(event.target.value)} />}
        />
      </div>
    </PermissionGuard>
  );
}

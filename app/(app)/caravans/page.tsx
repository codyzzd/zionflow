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
import { SearchInput } from "@/components/ui/search-input";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import type { Caravan, CaravanRegistration } from "@/types/domain";

function dateTimeKey(date: string, time: string) {
  return `${date || "0000-00-00"}T${time || "00:00"}`;
}

function getOccupiedSeats(registrations: CaravanRegistration[], caravanId: string) {
  return registrations.filter((registration) => registration.caravanId === caravanId && registration.consumesSeat !== false).length;
}

export default function CaravansPage() {
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

          return (
            <div className="space-y-1">
              <TablePrimaryAction asChild>
                <Link href={`/caravans/${caravan.id}`}>{caravan.destination}</Link>
              </TablePrimaryAction>
              <p className="text-xs text-muted-foreground">Caravana disponível para inscrição</p>
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
        accessorKey: "returnDate",
        meta: { label: "Retorno" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Retorno {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const caravan = row.original;

          return (
            <div className="space-y-1">
              <p>{formatDate(caravan.returnDate)}</p>
              <p className="text-xs text-muted-foreground">{caravan.returnTime}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "availableSeats",
        meta: { label: "Bancos" },
        header: "Bancos",
        cell: ({ row }) => <Badge variant="secondary">{`${getOccupiedSeats(caravanRegistrationsByWard, row.original.id)}/${row.original.availableSeats}`}</Badge>,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <TableActionButton asChild label="Abrir">
              <Link href={`/caravans/${row.original.id}`}>
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
    <PermissionGuard permission="caravan.register.view">
      <div>
        <PageHeader
          eyebrow="Caravana"
          title="Caravanas disponíveis"
          description="Abra uma caravana para visualizar os detalhes e preparar a inscrição de pessoas."
        />

        <DataTable
          columns={columns}
          data={filteredCaravans}
          emptyMessage="Nenhuma caravana disponível com os filtros atuais."
          enableColumnVisibility
          getRowId={(caravan) => caravan.id}
          toolbar={<SearchInput className="md:max-w-lg" placeholder="Buscar por destino" value={search} onChange={(event) => setSearch(event.target.value)} />}
        />
      </div>
    </PermissionGuard>
  );
}

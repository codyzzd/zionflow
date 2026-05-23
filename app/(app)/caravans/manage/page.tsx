"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye, List } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import type { Caravan, CaravanRegistration, CaravanSeatMode } from "@/types/domain";

type CaravanForm = Omit<Caravan, "id" | "wardId" | "seatMode" | "availableSeats" | "archivedAt"> & {
  seatMode: CaravanSeatMode;
  availableSeats: string;
};
type DrawerMode = "create" | "view" | "edit";
type CaravanStatusFilter = "active" | "archived";

const emptyCaravanForm: CaravanForm = {
  destination: "",
  departureDate: "",
  departureTime: "",
  returnDate: "",
  returnTime: "",
  seatMode: "quantity",
  availableSeats: "",
};

function caravanToForm(caravan: Caravan): CaravanForm {
  return {
    destination: caravan.destination,
    departureDate: caravan.departureDate,
    departureTime: caravan.departureTime,
    returnDate: caravan.returnDate,
    returnTime: caravan.returnTime,
    seatMode: caravan.seatMode,
    availableSeats: String(caravan.availableSeats),
  };
}

function dateTimeKey(date: string, time: string) {
  return `${date || "0000-00-00"}T${time || "00:00"}`;
}

function toSeatCount(value: string) {
  return Number(value);
}

function getOccupiedSeats(registrations: CaravanRegistration[], caravanId: string) {
  return registrations.filter((registration) => registration.caravanId === caravanId && registration.consumesSeat !== false).length;
}

export default function CaravansPage() {
  const { archiveCaravan, caravanRegistrationsByWard, caravansByWard, currentWard, hasPermission, saveCaravan, unarchiveCaravan } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageCaravans = hasPermission("caravan.manage.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaravanStatusFilter>("active");
  const [form, setForm] = useState<CaravanForm>(emptyCaravanForm);
  const [selectedCaravan, setSelectedCaravan] = useState<Caravan | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isReadOnly = drawerMode === "view";
  const selectedCaravanIsArchived = Boolean(selectedCaravan?.archivedAt);
  const activeCaravansCount = useMemo(() => caravansByWard.filter((caravan) => !caravan.archivedAt).length, [caravansByWard]);
  const archivedCaravansCount = useMemo(() => caravansByWard.filter((caravan) => caravan.archivedAt).length, [caravansByWard]);

  const filteredCaravans = useMemo(
    () =>
      caravansByWard
        .filter((caravan) => {
          const normalizedSearch = search.trim().toLowerCase();
          const matchesStatus = statusFilter === "archived" ? Boolean(caravan.archivedAt) : !caravan.archivedAt;
          if (!matchesStatus) return false;
          if (!normalizedSearch) return true;

          return caravan.destination.toLowerCase().includes(normalizedSearch);
        })
        .sort((a, b) => dateTimeKey(a.departureDate, a.departureTime).localeCompare(dateTimeKey(b.departureDate, b.departureTime))),
    [caravansByWard, search, statusFilter],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setForm(emptyCaravanForm);
      setSelectedCaravan(null);
      setDrawerMode("create");
    }
  }

  function openCreateDrawer() {
    setForm(emptyCaravanForm);
    setSelectedCaravan(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openViewDrawer(caravan: Caravan) {
    setSelectedCaravan(caravan);
    setForm(caravanToForm(caravan));
    setDrawerMode("view");
    setDrawerOpen(true);
  }

  function openEditDrawer(caravan: Caravan) {
    setSelectedCaravan(caravan);
    setForm(caravanToForm(caravan));
    setDrawerMode("edit");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  const hasRequiredFields =
    Boolean(currentWard) &&
    Boolean(form.destination.trim()) &&
    Boolean(form.departureDate) &&
    Boolean(form.departureTime) &&
    Boolean(form.returnDate) &&
    Boolean(form.returnTime);
  const returnBeforeDeparture =
    Boolean(form.departureDate && form.departureTime && form.returnDate && form.returnTime) &&
    dateTimeKey(form.returnDate, form.returnTime) < dateTimeKey(form.departureDate, form.departureTime);
  const availableSeats = toSeatCount(form.availableSeats);
  const hasSeatFields = Boolean(form.availableSeats.trim());
  const reservedSeatCount = selectedCaravan ? getOccupiedSeats(caravanRegistrationsByWard, selectedCaravan.id) : 0;
  const minimumAvailableSeats = drawerMode === "edit" ? Math.max(1, reservedSeatCount) : 1;
  const hasValidSeatCounts = hasSeatFields && Number.isInteger(availableSeats) && availableSeats >= minimumAvailableSeats;
  const canSave = hasRequiredFields && hasValidSeatCounts && !returnBeforeDeparture;

  function saveCurrentCaravan() {
    if (!currentWard || !canSave) return;

    saveCaravan({
      id: selectedCaravan?.id,
      wardId: currentWard.id,
      destination: form.destination.trim(),
      departureDate: form.departureDate,
      departureTime: form.departureTime,
      returnDate: form.returnDate,
      returnTime: form.returnTime,
      seatMode: "quantity",
      availableSeats,
    });

    closeDrawer();
  }

  function archiveSelectedCaravan() {
    if (!selectedCaravan) return;

    archiveCaravan(selectedCaravan.id);
    closeDrawer();
  }

  function unarchiveSelectedCaravan() {
    if (!selectedCaravan) return;

    unarchiveCaravan(selectedCaravan.id);
    closeDrawer();
  }

  const drawerTitle = drawerMode === "create" ? "Nova caravana" : drawerMode === "edit" ? "Editar caravana" : selectedCaravan?.destination ?? "Caravana";
  const drawerDescription =
    drawerMode === "view"
      ? selectedCaravanIsArchived
        ? "Esta caravana está arquivada e fica oculta nas demais áreas do sistema."
        : "Visualização dos dados cadastrados da caravana."
      : "Informe destino, partida e retorno da caravana.";

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
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium">{row.original.destination}</p>
            {row.original.archivedAt ? <Badge variant="destructive">Arquivada</Badge> : null}
          </div>
        ),
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
        cell: ({ row }) => {
          const caravan = row.original;

          return <Badge variant="secondary">{`${getOccupiedSeats(caravanRegistrationsByWard, caravan.id)}/${caravan.availableSeats}`}</Badge>;
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const caravan = row.original;

          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button asChild className="min-w-24" size="sm" variant="outline">
                <Link href={`/caravans/manage/${caravan.id}/list`}>
                  <List />
                  Lista
                </Link>
              </Button>
              <Button className="min-w-24" onClick={() => openViewDrawer(caravan)} size="sm" variant="outline">
                <Eye />
                Visualizar
              </Button>
            </div>
          );
        },
      },
    ],
    [caravanRegistrationsByWard, formatDate],
  );

  return (
    <PermissionGuard permission="caravan.manage.view">
      <div>
        <PageHeader
          eyebrow="Caravana"
          title="Gerenciar caravanas"
          description="Cadastro administrativo das caravanas, datas, horários e bancos disponíveis."
          actions={
            canManageCaravans ? (
              <Button onClick={openCreateDrawer} size="lg">
                Nova caravana
              </Button>
            ) : null
          }
        />

        <DataTable
          columns={columns}
          data={filteredCaravans}
          emptyMessage="Nenhuma caravana encontrada com os filtros atuais."
          enableColumnVisibility
          getRowId={(caravan) => caravan.id}
          toolbar={
            <div className="flex flex-col gap-3 md:flex-row">
              <Input className="md:max-w-lg" placeholder="Buscar por destino" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as CaravanStatusFilter) ?? "active")}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filtrar caravanas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Normais ({activeCaravansCount})</SelectItem>
                  <SelectItem value="archived">Arquivadas ({archivedCaravansCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{drawerTitle}</DrawerTitle>
              <DrawerDescription>{drawerDescription}</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div>
                  <Label>Destino</Label>
                  <Input
                    disabled={isReadOnly}
                    value={form.destination}
                    onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))}
                  />
                </div>

                <div className="section-grid">
                  <div>
                    <Label>Data de partida</Label>
                    <DatePicker
                      disabled={isReadOnly}
                      value={form.departureDate}
                      onChange={(value) => setForm((current) => ({ ...current, departureDate: value }))}
                    />
                  </div>
                  <div>
                    <Label>Hora de partida</Label>
                    <Input
                      disabled={isReadOnly}
                      type="time"
                      value={form.departureTime}
                      onChange={(event) => setForm((current) => ({ ...current, departureTime: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Data de retorno</Label>
                    <DatePicker
                      disabled={isReadOnly}
                      value={form.returnDate}
                      onChange={(value) => setForm((current) => ({ ...current, returnDate: value }))}
                    />
                  </div>
                  <div>
                    <Label>Hora de retorno</Label>
                    <Input
                      disabled={isReadOnly}
                      type="time"
                      value={form.returnTime}
                      onChange={(event) => setForm((current) => ({ ...current, returnTime: event.target.value }))}
                    />
                  </div>
                </div>

                {returnBeforeDeparture ? <p className="text-sm text-destructive">O retorno precisa ser depois da partida.</p> : null}

                <div className="space-y-4 rounded-lg border bg-secondary/25 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Label>Modo de bancos</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isReadOnly}
                        onClick={() => setForm((current) => ({ ...current, seatMode: "quantity" }))}
                        size="sm"
                        type="button"
                        variant={form.seatMode === "quantity" ? "default" : "outline"}
                      >
                        Quantidade de bancos
                      </Button>
                      <Button disabled size="sm" type="button" variant="outline">
                        Com veículo
                        <Badge variant="secondary">Em breve</Badge>
                      </Button>
                    </div>
                  </div>

                  <div className="section-grid">
                    <div>
                      <Label>Bancos disponíveis</Label>
                      <Input
                        disabled={isReadOnly}
                        min={minimumAvailableSeats}
                        step={1}
                        type="number"
                        value={form.availableSeats}
                        onChange={(event) => setForm((current) => ({ ...current, availableSeats: event.target.value }))}
                      />
                      {drawerMode === "edit" && reservedSeatCount > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reservedSeatCount} banco(s) já reservado(s) nesta caravana.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {!hasValidSeatCounts && form.availableSeats ? (
                    <p className="text-sm text-destructive">
                      {drawerMode === "edit" && reservedSeatCount > 0
                        ? `Informe pelo menos ${reservedSeatCount} banco(s), pois essa quantidade já está reservada.`
                        : "Informe a quantidade de bancos disponíveis com um número inteiro maior que zero."}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  {isReadOnly ? "Fechar" : "Cancelar"}
                </Button>
                {isReadOnly && canManageCaravans && selectedCaravan ? (
                  selectedCaravanIsArchived ? (
                    <Button onClick={unarchiveSelectedCaravan} variant="secondary">
                      Desarquivar
                    </Button>
                  ) : (
                    <Button onClick={archiveSelectedCaravan} variant="destructive">
                      <Archive />
                      Arquivar
                    </Button>
                  )
                ) : null}
                {isReadOnly && canManageCaravans && selectedCaravan ? <Button onClick={() => openEditDrawer(selectedCaravan)}>Editar caravana</Button> : null}
                {!isReadOnly ? (
                  <Button disabled={!canSave} onClick={saveCurrentCaravan}>
                    {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar caravana"}
                  </Button>
                ) : null}
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </PermissionGuard>
  );
}

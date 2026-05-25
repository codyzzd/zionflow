"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, ChevronsUpDown, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Stake, Ward } from "@/types/domain";

type WardForm = Omit<Ward, "id">;
type DrawerMode = "create" | "view" | "edit";
type StatusFilter = "active" | "archived";

function createEmptyForm(): WardForm {
  return {
    stakeId: "",
    name: "",
    city: "",
    state: "",
    country: "Brasil",
    lunchPDayWeekday: "monday",
  };
}

function wardToForm(ward: Ward): WardForm {
  return {
    stakeId: ward.stakeId,
    name: ward.name,
    city: ward.city,
    state: ward.state,
    country: ward.country,
    lunchPDayWeekday: ward.lunchPDayWeekday,
    createdAt: ward.createdAt,
    createdByUserId: ward.createdByUserId,
    updatedAt: ward.updatedAt,
    updatedByUserId: ward.updatedByUserId,
    archivedAt: ward.archivedAt,
    archivedByUserId: ward.archivedByUserId,
  };
}

function StakeCombobox({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  options: Stake[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedStake = useMemo(() => options.find((stake) => stake.id === value), [options, value]);
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 8);

    return options
      .filter((stake) =>
        [stake.name, stake.city, stake.state, stake.country].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedQuery)),
      )
      .slice(0, 8);
  }, [normalizedQuery, options]);

  const displayValue = selectedStake?.name ?? "";

  function selectStake(stakeId: string) {
    onChange(stakeId);
    setIsOpen(false);
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setQuery(displayValue);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button className="w-full justify-between" disabled={disabled} variant="outline">
          <span className={cn("truncate", !displayValue && "text-muted-foreground")}>{displayValue || "Sem estaca vinculada"}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar estaca" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandGroup heading="Vínculo">
              <CommandItem data-checked={!value} value="sem-estaca" onSelect={() => selectStake("")}>
                <span className="flex-1">Sem estaca vinculada</span>
              </CommandItem>
            </CommandGroup>
            {filteredOptions.length ? (
              <CommandGroup heading="Estacas">
                {filteredOptions.map((stake) => (
                  <CommandItem key={stake.id} data-checked={value === stake.id} value={`${stake.name} ${stake.city} ${stake.state}`} onSelect={() => selectStake(stake.id)}>
                    <span className="flex-1 truncate">{stake.name}</span>
                    {[stake.city, stake.state].filter(Boolean).length ? (
                      <span className="shrink-0 text-xs text-muted-foreground">{[stake.city, stake.state].filter(Boolean).join(" / ")}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : normalizedQuery ? (
              <CommandEmpty>Nenhuma estaca encontrada.</CommandEmpty>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SystemWardsPage() {
  const { archiveWard, db, deleteWard, saveSystemWard, unarchiveWard } = useAppContext();
  const stakeOptions = useMemo(() => db.stakes.filter((stake) => !stake.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.stakes]);
  const stakesById = useMemo(() => new Map(db.stakes.map((stake) => [stake.id, stake])), [db.stakes]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedWard, setSelectedWard] = useState<Ward | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<WardForm>(() => createEmptyForm());

  const isReadOnly = drawerMode === "view";
  const selectedWardIsArchived = Boolean(selectedWard?.archivedAt);

  const filteredWards = useMemo(
    () =>
      db.wards
        .filter((ward) => {
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          const stakeName = stakesById.get(ward.stakeId)?.name ?? "";
          const matchesStatus = statusFilter === "archived" ? Boolean(ward.archivedAt) : !ward.archivedAt;
          const matchesSearch =
            !normalizedSearch ||
            ward.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            stakeName.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            ward.city.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            ward.state.toLocaleLowerCase("pt-BR").includes(normalizedSearch);

          return matchesStatus && matchesSearch;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.wards, search, stakesById, statusFilter],
  );

  function resetDrawer() {
    setSelectedWard(null);
    setDrawerMode("create");
    setForm(createEmptyForm());
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) resetDrawer();
  }

  function openCreateDrawer() {
    setSelectedWard(null);
    setDrawerMode("create");
    setForm(createEmptyForm());
    setDrawerOpen(true);
  }

  function openViewDrawer(ward: Ward) {
    setSelectedWard(ward);
    setDrawerMode("view");
    setForm(wardToForm(ward));
    setDrawerOpen(true);
  }

  function openEditDrawer(ward: Ward) {
    setSelectedWard(ward);
    setDrawerMode("edit");
    setForm(wardToForm(ward));
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentWard() {
    if (!form.name.trim()) return;

    saveSystemWard({
      id: selectedWard?.id,
      ...form,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim() || "Brasil",
    });
    closeDrawer();
  }

  const columns = useMemo<ColumnDef<Ward>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: "Ala" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Ala {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <p className="font-medium">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {[row.original.city, row.original.state, row.original.country].filter(Boolean).join(" / ") || "Local não informado"}
            </p>
          </div>
        ),
      },
      {
        id: "stake",
        meta: { label: "Estaca" },
        header: "Estaca",
        cell: ({ row }) => stakesById.get(row.original.stakeId)?.name ?? "Sem estaca",
        sortingFn: (rowA, rowB) =>
          (stakesById.get(rowA.original.stakeId)?.name ?? "").localeCompare(stakesById.get(rowB.original.stakeId)?.name ?? "", "pt-BR"),
      },
      {
        id: "status",
        meta: { label: "Status" },
        header: "Status",
        cell: ({ row }) => <Badge variant={row.original.archivedAt ? "secondary" : "default"}>{row.original.archivedAt ? "Arquivada" : "Ativa"}</Badge>,
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button onClick={() => openViewDrawer(row.original)} size="sm" variant="ghost">
              Visualizar
            </Button>
          </div>
        ),
      },
    ],
    [stakesById],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Alas"
          description="Cadastro administrativo de alas do sistema."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Nova ala
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredWards}
          emptyMessage="Nenhuma ala encontrada com os filtros atuais."
          enableColumnVisibility
          toolbar={
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                className="lg:max-w-lg"
                placeholder="Buscar por ala, estaca, cidade ou estado"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as StatusFilter) ?? "active")}>
                <SelectTrigger className="lg:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="archived">Arquivadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{drawerMode === "create" ? "Nova ala" : drawerMode === "edit" ? "Editar ala" : selectedWard?.name ?? "Ala"}</DrawerTitle>
              <DrawerDescription>Dados usados na organização das alas dentro do sistema.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="section-grid">
                <div>
                  <Label>Nome da ala</Label>
                  <Input disabled={isReadOnly} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <Label>Estaca</Label>
                  <StakeCombobox
                    disabled={isReadOnly}
                    options={stakeOptions}
                    value={form.stakeId}
                    onChange={(value) => setForm((current) => ({ ...current, stakeId: value }))}
                  />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input disabled={isReadOnly} value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input disabled={isReadOnly} value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} />
                </div>
                <div>
                  <Label>País</Label>
                  <Input disabled={isReadOnly} value={form.country} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  {isReadOnly && selectedWard ? (
                    selectedWardIsArchived ? (
                      <>
                        <Button onClick={() => unarchiveWard(selectedWard.id)} variant="outline">
                          <RotateCcw />
                          Desarquivar
                        </Button>
                        <Button onClick={() => deleteWard(selectedWard.id)} variant="destructive">
                          <Trash2 />
                          Deletar
                        </Button>
                      </>
                    ) : (
                      <Button onClick={() => archiveWard(selectedWard.id)} variant="destructive">
                        <Archive />
                        Arquivar
                      </Button>
                    )
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && selectedWard ? <Button onClick={() => openEditDrawer(selectedWard)}>Editar ala</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.name.trim()} onClick={saveCurrentWard}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar ala"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </SystemAdminGuard>
  );
}

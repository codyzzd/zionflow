"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import type { Stake } from "@/types/domain";

type StakeForm = Omit<Stake, "id">;
type DrawerMode = "create" | "view" | "edit";
type StatusFilter = "active" | "archived";

const emptyStakeForm: StakeForm = {
  name: "",
  city: "",
  state: "",
  country: "Brasil",
};

function stakeToForm(stake: Stake): StakeForm {
  return {
    name: stake.name,
    city: stake.city,
    state: stake.state,
    country: stake.country,
    createdAt: stake.createdAt,
    createdByUserId: stake.createdByUserId,
    updatedAt: stake.updatedAt,
    updatedByUserId: stake.updatedByUserId,
    archivedAt: stake.archivedAt,
    archivedByUserId: stake.archivedByUserId,
  };
}

export default function SystemStakesPage() {
  const { archiveStake, db, deleteStake, saveStake, unarchiveStake } = useAppContext();
  const stakesById = useMemo(() => new Map(db.stakes.map((stake) => [stake.id, stake])), [db.stakes]);
  const wardOptions = useMemo(() => db.wards.filter((ward) => !ward.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.wards]);
  const wardCountByStake = useMemo(() => {
    const counts = new Map<string, number>();
    db.wards.forEach((ward) => counts.set(ward.stakeId, (counts.get(ward.stakeId) ?? 0) + 1));
    return counts;
  }, [db.wards]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedStake, setSelectedStake] = useState<Stake | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form, setForm] = useState<StakeForm>(emptyStakeForm);
  const [selectedWardIds, setSelectedWardIds] = useState<string[]>([]);
  const [wardSearch, setWardSearch] = useState("");

  const isReadOnly = drawerMode === "view";
  const selectedStakeIsArchived = Boolean(selectedStake?.archivedAt);
  const selectedStakeWardCount = selectedStake ? wardCountByStake.get(selectedStake.id) ?? 0 : 0;
  const selectedWardIdSet = useMemo(() => new Set(selectedWardIds), [selectedWardIds]);
  const selectedWards = useMemo(() => wardOptions.filter((ward) => selectedWardIdSet.has(ward.id)), [selectedWardIdSet, wardOptions]);
  const filteredWardOptions = useMemo(() => {
    const normalizedSearch = wardSearch.trim().toLocaleLowerCase("pt-BR");
    if (!normalizedSearch) return wardOptions.slice(0, 8);

    return wardOptions
      .filter((ward) => {
        const currentStakeName = stakesById.get(ward.stakeId)?.name ?? "";
        return [ward.name, ward.city, ward.state, ward.country, currentStakeName].some((field) =>
          field.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
        );
      })
      .slice(0, 8);
  }, [stakesById, wardOptions, wardSearch]);

  const filteredStakes = useMemo(
    () =>
      db.stakes
        .filter((stake) => {
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          const matchesStatus = statusFilter === "archived" ? Boolean(stake.archivedAt) : !stake.archivedAt;
          const matchesSearch =
            !normalizedSearch ||
            stake.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            stake.city.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            stake.state.toLocaleLowerCase("pt-BR").includes(normalizedSearch);

          return matchesStatus && matchesSearch;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.stakes, search, statusFilter],
  );

  function resetDrawer() {
    setSelectedStake(null);
    setDrawerMode("create");
    setForm(emptyStakeForm);
    setSelectedWardIds([]);
    setWardSearch("");
    setConfirmOpen(false);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) resetDrawer();
  }

  function openCreateDrawer() {
    setSelectedStake(null);
    setDrawerMode("create");
    setForm(emptyStakeForm);
    setSelectedWardIds([]);
    setWardSearch("");
    setDrawerOpen(true);
  }

  function openViewDrawer(stake: Stake) {
    setSelectedStake(stake);
    setDrawerMode("view");
    setForm(stakeToForm(stake));
    setDrawerOpen(true);
  }

  function openEditDrawer(stake: Stake) {
    setSelectedStake(stake);
    setDrawerMode("edit");
    setForm(stakeToForm(stake));
    setSelectedWardIds(db.wards.filter((ward) => ward.stakeId === stake.id && !ward.archivedAt).map((ward) => ward.id));
    setWardSearch("");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function openSaveConfirmation() {
    if (!form.name.trim()) return;
    setConfirmOpen(true);
  }

  function getPreviousStakeLabel(stakeId: string) {
    const previousStake = stakesById.get(stakeId);
    if (!previousStake) return "Sem atrelamento";

    const location = [previousStake.city, previousStake.state].filter(Boolean).join(" / ");
    return location ? `${previousStake.name} (${location})` : previousStake.name;
  }

  function toggleWardSelection(wardId: string) {
    setSelectedWardIds((current) => (current.includes(wardId) ? current.filter((id) => id !== wardId) : [...current, wardId]));
  }

  function saveCurrentStake() {
    if (!form.name.trim()) return;

    saveStake({
      id: selectedStake?.id,
      ...form,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim() || "Brasil",
      wardIds: selectedWardIds,
    });
    setConfirmOpen(false);
    closeDrawer();
  }

  const columns = useMemo<ColumnDef<Stake>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: "Estaca" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Estaca {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1">
            <TablePrimaryAction onClick={() => openViewDrawer(row.original)}>{row.original.name}</TablePrimaryAction>
            <p className="text-xs text-muted-foreground">
              {[row.original.city, row.original.state, row.original.country].filter(Boolean).join(" / ") || "Local não informado"}
            </p>
          </div>
        ),
      },
      {
        id: "wards",
        meta: { label: "Alas" },
        header: "Alas",
        cell: ({ row }) => <Badge variant="secondary">{wardCountByStake.get(row.original.id) ?? 0} alas</Badge>,
        sortingFn: (rowA, rowB) => (wardCountByStake.get(rowA.original.id) ?? 0) - (wardCountByStake.get(rowB.original.id) ?? 0),
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
            <TableActionButton label="Visualizar" onClick={() => openViewDrawer(row.original)}>
              <Eye />
            </TableActionButton>
          </div>
        ),
      },
    ],
    [wardCountByStake],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Estacas"
          description="Cadastro administrativo de estacas do sistema."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Nova estaca
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredStakes}
          emptyMessage="Nenhuma estaca encontrada com os filtros atuais."
          enableColumnVisibility
          toolbar={
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <SearchInput
                className="lg:max-w-lg"
                placeholder="Buscar por estaca, cidade ou estado"
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
              <DrawerTitle>{drawerMode === "create" ? "Nova estaca" : drawerMode === "edit" ? "Editar estaca" : selectedStake?.name ?? "Estaca"}</DrawerTitle>
              <DrawerDescription>Dados usados para organizar alas e cadastros do sistema.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="section-grid">
                <div>
                  <Label>Nome da estaca</Label>
                  <Input disabled={isReadOnly} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
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
                {selectedStake ? (
                  <div>
                    <Label>Alas vinculadas</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{selectedStakeWardCount}</div>
                  </div>
                ) : null}
                {!isReadOnly ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Alas a atrelar</Label>
                    <Command className="rounded-lg border" shouldFilter={false}>
                      <CommandInput placeholder="Buscar ala por nome, cidade, estado ou estaca atual" value={wardSearch} onValueChange={setWardSearch} />
                      <CommandList className="max-h-52">
                        {filteredWardOptions.length ? (
                          <CommandGroup heading="Alas">
                            {filteredWardOptions.map((ward) => {
                              const isSelected = selectedWardIdSet.has(ward.id);
                              const previousStakeLabel = getPreviousStakeLabel(ward.stakeId);

                              return (
                                <CommandItem key={ward.id} data-checked={isSelected} value={`${ward.name} ${previousStakeLabel}`} onSelect={() => toggleWardSelection(ward.id)}>
                                  <Checkbox checked={isSelected} className="pointer-events-none" />
                                  <span className="flex-1 truncate">{ward.name}</span>
                                  <span className="shrink-0 text-xs text-muted-foreground">{previousStakeLabel}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        ) : (
                          <CommandEmpty>Nenhuma ala encontrada.</CommandEmpty>
                        )}
                      </CommandList>
                    </Command>
                    <div className="flex min-h-7 flex-wrap gap-2">
                      {selectedWards.length ? (
                        selectedWards.map((ward) => (
                          <Badge key={ward.id} variant="secondary">
                            {ward.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Nenhuma ala selecionada para atrelar.</span>
                      )}
                    </div>
                  </div>
                ) : selectedStakeWardCount ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Alas vinculadas</Label>
                    <div className="flex flex-wrap gap-2">
                      {wardOptions
                        .filter((ward) => ward.stakeId === selectedStake?.id)
                        .map((ward) => (
                          <Badge key={ward.id} variant="secondary">
                            {ward.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  {isReadOnly && selectedStake ? (
                    selectedStakeIsArchived ? (
                      <>
                        <Button onClick={() => unarchiveStake(selectedStake.id)} variant="outline">
                          <RotateCcw />
                          Desarquivar
                        </Button>
                        <DeleteConfirmationDialog
                          confirmLabel="Deletar"
                          description={`Deletar a estaca ${selectedStake.name}? Essa ação remove a estaca permanentemente.`}
                          onConfirm={() => deleteStake(selectedStake.id)}
                        >
                          <Button disabled={selectedStakeWardCount > 0} variant="destructive">
                            <Trash2 />
                            Deletar
                          </Button>
                        </DeleteConfirmationDialog>
                      </>
                    ) : (
                      <Button onClick={() => archiveStake(selectedStake.id)} variant="destructive">
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
                  {isReadOnly && selectedStake ? <Button onClick={() => openEditDrawer(selectedStake)}>Editar estaca</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.name.trim()} onClick={openSaveConfirmation}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar estaca"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{drawerMode === "edit" ? "Confirmar alteração da estaca" : "Confirmar criação da estaca"}</DialogTitle>
              <DialogDescription>
                Revise as alas que serão atreladas à estaca {form.name.trim() || "sem nome"} antes de confirmar.
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[50vh] overflow-y-auto rounded-lg border">
              {selectedWards.length ? (
                <div className="divide-y">
                  {selectedWards.map((ward) => (
                    <div className="grid gap-1 p-3 sm:grid-cols-[1fr_1fr] sm:items-center" key={ward.id}>
                      <div>
                        <p className="font-medium">{ward.name}</p>
                        <p className="text-xs text-muted-foreground">{[ward.city, ward.state, ward.country].filter(Boolean).join(" / ")}</p>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Atrelamento anterior: </span>
                        <span className="font-medium">{getPreviousStakeLabel(ward.stakeId)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-sm text-muted-foreground">Nenhuma ala será atrelada nesta ação.</div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => setConfirmOpen(false)} variant="ghost">
                Voltar
              </Button>
              <Button disabled={!form.name.trim()} onClick={saveCurrentStake}>
                Confirmar e {drawerMode === "edit" ? "salvar" : "criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </SystemAdminGuard>
  );
}

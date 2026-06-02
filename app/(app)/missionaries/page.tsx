"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye, Mars, RotateCcw, Trash2, Venus } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import type { MissionaryCompanionship, MissionaryType } from "@/types/domain";

type CompanionshipForm = Omit<MissionaryCompanionship, "id" | "wardId" | "members"> & {
  missionaryOne: string;
  missionaryTwo: string;
};

type DrawerMode = "create" | "view" | "edit";
type CompanionshipStatusFilter = "active" | "archived";

const emptyCompanionshipForm: CompanionshipForm = {
  name: "",
  type: "elders",
  area: "",
  missionaryOne: "",
  missionaryTwo: "",
  status: "active",
};

const typeLabels: Record<MissionaryType, string> = {
  elders: "Élderes",
  sisters: "Sisters",
};

const statusLabels: Record<MissionaryCompanionship["status"], string> = {
  active: "Ativa",
  inactive: "Inativa",
};

function companionshipToForm(companionship: MissionaryCompanionship): CompanionshipForm {
  return {
    name: companionship.name,
    type: companionship.type,
    area: companionship.area,
    missionaryOne: companionship.members[0] ?? "",
    missionaryTwo: companionship.members[1] ?? "",
    status: companionship.status,
  };
}

function MissionaryTypeBadge({ type }: { type: MissionaryType }) {
  const Icon = type === "elders" ? Mars : Venus;
  const className =
    type === "elders"
      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
      : "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/60 dark:bg-pink-950/40 dark:text-pink-300";

  return (
    <Badge className={className} variant="outline">
      <Icon className="size-3.5" />
      {typeLabels[type]}
    </Badge>
  );
}

export default function MissionariesPage() {
  const {
    allCompanionshipsByWard,
    archiveCompanionship,
    currentWard,
    deleteCompanionship,
    hasPermission,
    saveCompanionship,
    unarchiveCompanionship,
  } = useAppContext();
  const canManageMissionaries = hasPermission("missionary.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanionshipStatusFilter>("active");
  const [form, setForm] = useState<CompanionshipForm>(emptyCompanionshipForm);
  const [selectedCompanionship, setSelectedCompanionship] = useState<MissionaryCompanionship | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isReadOnly = drawerMode === "view";
  const selectedCompanionshipIsArchived = Boolean(selectedCompanionship?.archivedAt);
  const activeCompanionshipCount = useMemo(
    () => allCompanionshipsByWard.filter((companionship) => !companionship.archivedAt).length,
    [allCompanionshipsByWard],
  );
  const archivedCompanionshipCount = useMemo(
    () => allCompanionshipsByWard.filter((companionship) => companionship.archivedAt).length,
    [allCompanionshipsByWard],
  );

  const filteredCompanionships = useMemo(
    () =>
      allCompanionshipsByWard.filter((companionship) => {
        const matchesStatus = statusFilter === "archived" ? Boolean(companionship.archivedAt) : !companionship.archivedAt;
        const normalizedSearch = search.trim().toLowerCase();
        if (!matchesStatus) return false;
        if (!normalizedSearch) return true;

        return (
          companionship.name.toLowerCase().includes(normalizedSearch) ||
          companionship.area.toLowerCase().includes(normalizedSearch) ||
          companionship.members.some((member) => member.toLowerCase().includes(normalizedSearch))
        );
      }),
    [allCompanionshipsByWard, search, statusFilter],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setForm(emptyCompanionshipForm);
      setSelectedCompanionship(null);
      setDrawerMode("create");
    }
  }

  function openCreateDrawer() {
    setForm(emptyCompanionshipForm);
    setSelectedCompanionship(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openViewDrawer(companionship: MissionaryCompanionship) {
    setSelectedCompanionship(companionship);
    setForm(companionshipToForm(companionship));
    setDrawerMode("view");
    setDrawerOpen(true);
  }

  function openEditDrawer(companionship: MissionaryCompanionship) {
    setSelectedCompanionship(companionship);
    setForm(companionshipToForm(companionship));
    setDrawerMode("edit");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentCompanionship() {
    const members = [form.missionaryOne.trim(), form.missionaryTwo.trim()].filter(Boolean);
    if (!currentWard || !form.name.trim()) return;

    saveCompanionship({
      id: selectedCompanionship?.id,
      wardId: currentWard.id,
      name: form.name.trim(),
      type: form.type,
      area: form.area.trim(),
      members,
      status: form.status,
    });

    closeDrawer();
  }

  function archiveSelectedCompanionship() {
    if (!selectedCompanionship) return;

    archiveCompanionship(selectedCompanionship.id);
    closeDrawer();
  }

  function unarchiveSelectedCompanionship() {
    if (!selectedCompanionship) return;

    unarchiveCompanionship(selectedCompanionship.id);
    closeDrawer();
  }

  function deleteSelectedCompanionship() {
    if (!selectedCompanionship?.archivedAt) return;

    deleteCompanionship(selectedCompanionship.id);
    closeDrawer();
  }

  const drawerTitle =
    drawerMode === "create" ? "Nova dupla missionária" : drawerMode === "edit" ? "Editar dupla missionária" : selectedCompanionship?.name ?? "Dupla missionária";
  const drawerDescription =
    drawerMode === "view"
      ? selectedCompanionshipIsArchived
        ? "Esta dupla está arquivada e fica oculta nas novas seleções de almoço."
        : "Visualização dos dados cadastrados da dupla."
      : "Cadastre os missionários que servem juntos nesta área.";
  const canSave = Boolean(currentWard && form.name.trim());

  const columns = useMemo<ColumnDef<MissionaryCompanionship>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Dupla {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const companionship = row.original;

          return (
            <div className="space-y-1">
              <TablePrimaryAction onClick={() => openViewDrawer(companionship)}>{companionship.name}</TablePrimaryAction>
              {companionship.archivedAt ? <Badge variant="destructive">Arquivada</Badge> : null}
              <p className="text-xs text-muted-foreground">{companionship.area || "Sem área definida"}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        header: "Tipo",
        cell: ({ row }) => <MissionaryTypeBadge type={row.original.type} />,
      },
      {
        id: "missionaries",
        header: "Missionários",
        cell: ({ row }) => {
          const members = row.original.members;

          return members.length ? (
            <div className="flex flex-wrap gap-2">
              {members.map((member) => (
                <Badge key={member} variant="outline">
                  {member}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Sem nomes cadastrados</span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge variant={row.original.status === "active" ? "default" : "outline"}>{statusLabels[row.original.status]}</Badge>,
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const companionship = row.original;

          return (
            <div className="flex justify-end">
              <TableActionButton label="Visualizar" onClick={() => openViewDrawer(companionship)}>
                <Eye />
              </TableActionButton>
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <PermissionGuard permission="missionary.view">
      <div>
        <PageHeader
          eyebrow="Missionários"
          title="Duplas missionárias"
          description="Cadastro das duplas que servem na ala e aparecem no calendário de almoços."
          actions={
            canManageMissionaries ? (
              <Button onClick={openCreateDrawer} size="lg">
                Nova dupla
              </Button>
            ) : null
          }
        />

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SearchInput
              className="md:max-w-lg"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por dupla, área ou missionário"
              value={search}
            />
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as CompanionshipStatusFilter) ?? "active")}>
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue placeholder="Filtrar duplas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativas ({activeCompanionshipCount})</SelectItem>
                <SelectItem value="archived">Arquivadas ({archivedCompanionshipCount})</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={columns}
            data={filteredCompanionships}
            emptyMessage="Nenhuma dupla missionária encontrada com os filtros atuais."
            getRowId={(companionship) => companionship.id}
          />
        </div>

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{drawerTitle}</DrawerTitle>
              <DrawerDescription>{drawerDescription}</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div>
                  <Label>Nome da dupla</Label>
                  <Input
                    disabled={isReadOnly}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="ex: Elders Centro"
                    value={form.name}
                  />
                </div>

                <div className="section-grid">
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) => value && setForm((current) => ({ ...current, type: value as MissionaryType }))}
                      value={form.type}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="elders">Élderes</SelectItem>
                        <SelectItem value="sisters">Sisters</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select
                      disabled={isReadOnly}
                      onValueChange={(value) =>
                        value && setForm((current) => ({ ...current, status: value as MissionaryCompanionship["status"] }))
                      }
                      value={form.status}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Ativa</SelectItem>
                        <SelectItem value="inactive">Inativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Área</Label>
                  <Input
                    disabled={isReadOnly}
                    onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                    placeholder="ex: Centro"
                    value={form.area}
                  />
                </div>

                <div className="section-grid">
                  <div>
                    <Label>Missionário 1</Label>
                    <Input
                      disabled={isReadOnly}
                      onChange={(event) => setForm((current) => ({ ...current, missionaryOne: event.target.value }))}
                      placeholder="ex: Elder Silva"
                      value={form.missionaryOne}
                    />
                  </div>
                  <div>
                    <Label>Missionário 2</Label>
                    <Input
                      disabled={isReadOnly}
                      onChange={(event) => setForm((current) => ({ ...current, missionaryTwo: event.target.value }))}
                      placeholder="ex: Elder Santos"
                      value={form.missionaryTwo}
                    />
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  {isReadOnly ? "Fechar" : "Cancelar"}
                </Button>
                {isReadOnly && canManageMissionaries && selectedCompanionship ? (
                  selectedCompanionshipIsArchived ? (
                    <>
                      <Button onClick={unarchiveSelectedCompanionship} variant="secondary">
                        <RotateCcw />
                        Desarquivar
                      </Button>
                      <Button onClick={deleteSelectedCompanionship} variant="destructive">
                        <Trash2 />
                        Excluir
                      </Button>
                    </>
                  ) : (
                    <Button onClick={archiveSelectedCompanionship} variant="destructive">
                      <Archive />
                      Arquivar
                    </Button>
                  )
                ) : null}
                {isReadOnly && canManageMissionaries && selectedCompanionship ? (
                  <Button onClick={() => openEditDrawer(selectedCompanionship)}>Editar dupla</Button>
                ) : null}
                {!isReadOnly ? (
                  <Button disabled={!canSave} onClick={saveCurrentCompanionship}>
                    {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar dupla"}
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

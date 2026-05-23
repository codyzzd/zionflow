"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Hymn } from "@/types/domain";

type HymnForm = Omit<Hymn, "id">;
type DrawerMode = "create" | "view" | "edit";

const emptyHymnForm: HymnForm = {
  number: "",
  title: "",
  active: true,
};

function hymnToForm(hymn: Hymn): HymnForm {
  return {
    number: hymn.number,
    title: hymn.title,
    active: hymn.active,
    createdAt: hymn.createdAt,
    createdByUserId: hymn.createdByUserId,
    updatedAt: hymn.updatedAt,
    updatedByUserId: hymn.updatedByUserId,
    archivedAt: hymn.archivedAt,
    archivedByUserId: hymn.archivedByUserId,
  };
}

function hymnSortValue(number: string) {
  const parsed = Number(number);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

export default function SystemHymnsPage() {
  const { db, deleteHymn, saveHymn } = useAppContext();

  const [search, setSearch] = useState("");
  const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<HymnForm>(emptyHymnForm);

  const isReadOnly = drawerMode === "view";

  const filteredHymns = useMemo(
    () =>
      db.hymns
        .filter((hymn) => {
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          if (!normalizedSearch) return true;

          return hymn.number.toLocaleLowerCase("pt-BR").includes(normalizedSearch) || hymn.title.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
        })
        .sort((a, b) => hymnSortValue(a.number) - hymnSortValue(b.number) || a.title.localeCompare(b.title, "pt-BR")),
    [db.hymns, search],
  );

  function resetDrawer() {
    setSelectedHymn(null);
    setDrawerMode("create");
    setForm(emptyHymnForm);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) resetDrawer();
  }

  function openCreateDrawer() {
    setSelectedHymn(null);
    setDrawerMode("create");
    setForm(emptyHymnForm);
    setDrawerOpen(true);
  }

  function openViewDrawer(hymn: Hymn) {
    setSelectedHymn(hymn);
    setDrawerMode("view");
    setForm(hymnToForm(hymn));
    setDrawerOpen(true);
  }

  function openEditDrawer(hymn: Hymn) {
    setSelectedHymn(hymn);
    setDrawerMode("edit");
    setForm(hymnToForm(hymn));
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentHymn() {
    if (!form.number.trim() || !form.title.trim()) return;

    saveHymn({
      id: selectedHymn?.id,
      ...form,
      number: form.number.trim(),
      title: form.title.trim(),
      active: true,
    });
    closeDrawer();
  }

  function deleteSelectedHymn() {
    if (!selectedHymn) return;

    deleteHymn(selectedHymn.id);
    closeDrawer();
  }

  const columns = useMemo<ColumnDef<Hymn>[]>(
    () => [
      {
        accessorKey: "number",
        meta: { label: "Número" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Número {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.number}</span>,
        sortingFn: (rowA, rowB) => hymnSortValue(rowA.original.number) - hymnSortValue(rowB.original.number),
      },
      {
        accessorKey: "title",
        meta: { label: "Título" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Título {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
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
    [],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Hinos"
          description="Catálogo de hinos usados nos campos das atas sacramentais."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Novo hino
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredHymns}
          emptyMessage="Nenhum hino encontrado com os filtros atuais."
          enableColumnVisibility
          toolbar={<Input className="md:max-w-lg" placeholder="Buscar por número ou título" value={search} onChange={(event) => setSearch(event.target.value)} />}
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{drawerMode === "create" ? "Novo hino" : drawerMode === "edit" ? "Editar hino" : selectedHymn ? `Hino ${selectedHymn.number}` : "Hino"}</DrawerTitle>
              <DrawerDescription>Esses hinos ficam disponíveis para vincular nas atas sacramentais.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="section-grid">
                <div>
                  <Label>Número</Label>
                  <Input disabled={isReadOnly} value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} />
                </div>
                <div>
                  <Label>Título</Label>
                  <Input disabled={isReadOnly} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div>{isReadOnly && selectedHymn ? <Button onClick={deleteSelectedHymn} variant="destructive"><Trash2 />Apagar hino</Button> : null}</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && selectedHymn ? <Button onClick={() => openEditDrawer(selectedHymn)}>Editar hino</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.number.trim() || !form.title.trim()} onClick={saveCurrentHymn}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar hino"}
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

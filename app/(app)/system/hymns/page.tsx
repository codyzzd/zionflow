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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Hymn } from "@/types/domain";

type HymnForm = Omit<Hymn, "id">;
type DrawerMode = "create" | "view" | "edit";

const emptyHymnForm: HymnForm = {
  hymnBookId: "",
  number: "",
  title: "",
  active: true,
};

function hymnToForm(hymn: Hymn): HymnForm {
  return {
    hymnBookId: hymn.hymnBookId,
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
  const hymnBooksById = useMemo(() => new Map(db.hymnBooks.map((hymnBook) => [hymnBook.id, hymnBook])), [db.hymnBooks]);
  const hymnBookOptions = useMemo(() => db.hymnBooks.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.hymnBooks]);

  const [search, setSearch] = useState("");
  const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<HymnForm>(emptyHymnForm);

  const isReadOnly = drawerMode === "view";
  const defaultHymnBookId = hymnBookOptions[0]?.id ?? "";
  const currentDuplicate = Boolean(
    form.hymnBookId &&
      form.number.trim() &&
      db.hymns.some((hymn) => hymn.id !== selectedHymn?.id && hymn.hymnBookId === form.hymnBookId && hymn.number.trim() === form.number.trim()),
  );

  const filteredHymns = useMemo(
    () =>
      db.hymns
        .filter((hymn) => {
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          if (!normalizedSearch) return true;

          const hymnBook = hymnBooksById.get(hymn.hymnBookId);

          return [hymn.number, hymn.title, hymnBook?.name ?? "", hymnBook?.emoji ?? ""].some((field) =>
            field.toLocaleLowerCase("pt-BR").includes(normalizedSearch),
          );
        })
        .sort((a, b) => {
          const bookSort = (hymnBooksById.get(a.hymnBookId)?.name ?? "").localeCompare(hymnBooksById.get(b.hymnBookId)?.name ?? "", "pt-BR");
          return bookSort || hymnSortValue(a.number) - hymnSortValue(b.number) || a.title.localeCompare(b.title, "pt-BR");
        }),
    [db.hymns, hymnBooksById, search],
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
    setForm({ ...emptyHymnForm, hymnBookId: defaultHymnBookId });
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
    if (!form.hymnBookId || !form.number.trim() || !form.title.trim() || currentDuplicate) return;

    saveHymn({
      id: selectedHymn?.id,
      ...form,
      hymnBookId: form.hymnBookId,
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
        id: "hymnBookId",
        meta: { label: "Hinário" },
        header: "Hinário",
        cell: ({ row }) => {
          const hymnBook = hymnBooksById.get(row.original.hymnBookId);
          return hymnBook ? `${hymnBook.emoji} ${hymnBook.name}` : "Sem hinário";
        },
        sortingFn: (rowA, rowB) =>
          (hymnBooksById.get(rowA.original.hymnBookId)?.name ?? "").localeCompare(hymnBooksById.get(rowB.original.hymnBookId)?.name ?? "", "pt-BR"),
      },
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
    [hymnBooksById],
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
          toolbar={<Input className="md:max-w-lg" placeholder="Buscar por número, título ou hinário" value={search} onChange={(event) => setSearch(event.target.value)} />}
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
                  <Label>Hinário</Label>
                  <Select disabled={isReadOnly} value={form.hymnBookId} onValueChange={(value) => setForm((current) => ({ ...current, hymnBookId: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Escolha o hinário" />
                    </SelectTrigger>
                    <SelectContent>
                      {hymnBookOptions.map((hymnBook) => (
                        <SelectItem key={hymnBook.id} value={hymnBook.id}>
                          {hymnBook.emoji} {hymnBook.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Número</Label>
                  <Input disabled={isReadOnly} value={form.number} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} />
                </div>
                <div>
                  <Label>Título</Label>
                  <Input disabled={isReadOnly} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
                {currentDuplicate ? <p className="text-sm text-destructive">Já existe um hino com esse número nesse hinário.</p> : null}
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
                    <Button disabled={!form.hymnBookId || !form.number.trim() || !form.title.trim() || currentDuplicate} onClick={saveCurrentHymn}>
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

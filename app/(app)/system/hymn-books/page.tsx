"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import type { HymnBook } from "@/types/domain";

type HymnBookForm = Omit<HymnBook, "id">;
type DrawerMode = "create" | "view" | "edit";

const emptyHymnBookForm: HymnBookForm = {
  name: "",
  emoji: "",
};

function hymnBookToForm(hymnBook: HymnBook): HymnBookForm {
  return {
    name: hymnBook.name,
    emoji: hymnBook.emoji,
    createdAt: hymnBook.createdAt,
    createdByUserId: hymnBook.createdByUserId,
    updatedAt: hymnBook.updatedAt,
    updatedByUserId: hymnBook.updatedByUserId,
    archivedAt: hymnBook.archivedAt,
    archivedByUserId: hymnBook.archivedByUserId,
  };
}

export default function SystemHymnBooksPage() {
  const { db, deleteHymnBook, saveHymnBook } = useAppContext();
  const hymnCountByBook = useMemo(() => {
    const counts = new Map<string, number>();
    db.hymns.forEach((hymn) => counts.set(hymn.hymnBookId, (counts.get(hymn.hymnBookId) ?? 0) + 1));
    return counts;
  }, [db.hymns]);

  const [search, setSearch] = useState("");
  const [selectedHymnBook, setSelectedHymnBook] = useState<HymnBook | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<HymnBookForm>(emptyHymnBookForm);

  const isReadOnly = drawerMode === "view";
  const selectedHymnCount = selectedHymnBook ? hymnCountByBook.get(selectedHymnBook.id) ?? 0 : 0;

  const filteredHymnBooks = useMemo(
    () =>
      db.hymnBooks
        .filter((hymnBook) => {
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          if (!normalizedSearch) return true;

          return [hymnBook.name, hymnBook.emoji].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.hymnBooks, search],
  );

  function resetDrawer() {
    setSelectedHymnBook(null);
    setDrawerMode("create");
    setForm(emptyHymnBookForm);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) resetDrawer();
  }

  function openCreateDrawer() {
    setSelectedHymnBook(null);
    setDrawerMode("create");
    setForm(emptyHymnBookForm);
    setDrawerOpen(true);
  }

  function openViewDrawer(hymnBook: HymnBook) {
    setSelectedHymnBook(hymnBook);
    setDrawerMode("view");
    setForm(hymnBookToForm(hymnBook));
    setDrawerOpen(true);
  }

  function openEditDrawer(hymnBook: HymnBook) {
    setSelectedHymnBook(hymnBook);
    setDrawerMode("edit");
    setForm(hymnBookToForm(hymnBook));
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentHymnBook() {
    if (!form.name.trim() || !form.emoji.trim()) return;

    saveHymnBook({
      id: selectedHymnBook?.id,
      ...form,
      name: form.name.trim(),
      emoji: form.emoji.trim(),
    });
    closeDrawer();
  }

  function deleteSelectedHymnBook() {
    if (!selectedHymnBook || selectedHymnCount > 0) return;

    deleteHymnBook(selectedHymnBook.id);
    closeDrawer();
  }

  const columns = useMemo<ColumnDef<HymnBook>[]>(
    () => [
      {
        accessorKey: "emoji",
        meta: { label: "Emoji" },
        header: "Emoji",
        cell: ({ row }) => <span className="text-lg leading-none">{row.original.emoji}</span>,
      },
      {
        accessorKey: "name",
        meta: { label: "Nome" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nome {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <TablePrimaryAction onClick={() => openViewDrawer(row.original)}>{row.original.name}</TablePrimaryAction>,
      },
      {
        id: "hymns",
        meta: { label: "Hinos" },
        header: "Hinos",
        cell: ({ row }) => <Badge variant="secondary">{hymnCountByBook.get(row.original.id) ?? 0} hinos</Badge>,
        sortingFn: (rowA, rowB) => (hymnCountByBook.get(rowA.original.id) ?? 0) - (hymnCountByBook.get(rowB.original.id) ?? 0),
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
    [hymnCountByBook],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Livros de hinos"
          description="Catálogo dos hinários usados para organizar números repetidos entre livros."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Novo livro
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredHymnBooks}
          emptyMessage="Nenhum livro encontrado com os filtros atuais."
          enableColumnVisibility
          toolbar={<SearchInput className="md:max-w-lg" placeholder="Buscar por nome ou emoji" value={search} onChange={(event) => setSearch(event.target.value)} />}
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>
                {drawerMode === "create" ? "Novo livro" : drawerMode === "edit" ? "Editar livro" : selectedHymnBook ? selectedHymnBook.name : "Livro"}
              </DrawerTitle>
              <DrawerDescription>Esses livros ficam disponíveis no cadastro de hinos e nos seletores das atas.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="section-grid">
                <div>
                  <Label>Emoji</Label>
                  <Input
                    className="max-w-24 text-lg"
                    disabled={isReadOnly}
                    maxLength={8}
                    value={form.emoji}
                    onChange={(event) => setForm((current) => ({ ...current, emoji: event.target.value }))}
                  />
                </div>
                <div>
                  <Label>Nome</Label>
                  <Input disabled={isReadOnly} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                {isReadOnly && selectedHymnBook ? <Badge variant="secondary">{selectedHymnCount} hinos vinculados</Badge> : null}
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div>
                  {isReadOnly && selectedHymnBook ? (
                    <DeleteConfirmationDialog
                      confirmLabel="Apagar livro"
                      description={`Apagar o livro ${selectedHymnBook.name}? Essa ação remove o livro de hinos.`}
                      onConfirm={deleteSelectedHymnBook}
                    >
                      <Button disabled={selectedHymnCount > 0} variant="destructive">
                        <Trash2 />
                        Apagar livro
                      </Button>
                    </DeleteConfirmationDialog>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && selectedHymnBook ? <Button onClick={() => openEditDrawer(selectedHymnBook)}>Editar livro</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.name.trim() || !form.emoji.trim()} onClick={saveCurrentHymnBook}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar livro"}
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

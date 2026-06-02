"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronsUpDown, Eye, Trash2, X } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { useMemo, useState } from "react";

import { HymnImportDialog } from "@/components/features/hymns/hymn-import-dialog";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { DeleteConfirmationDialog, DeleteTableActionButton } from "@/components/ui/delete-confirmation-dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { isSystemAdmin } from "@/lib/system-access";
import { cn } from "@/lib/utils";
import type { Hymn } from "@/types/domain";

type HymnForm = Omit<Hymn, "id">;
type DrawerMode = "create" | "view" | "edit";

const ALL_HYMN_BOOKS_FILTER = "__all_hymn_books__";
const ALL_CATEGORIES_FILTER = "__all_categories__";

const emptyHymnForm: HymnForm = {
  hymnBookId: "",
  number: "",
  title: "",
  category: "",
  tags: [],
  active: true,
};

function normalizeHymnNumberInput(value: string) {
  return value.replace(/[^0-9a-z]/gi, "").toLocaleLowerCase("pt-BR");
}

function normalizeHymnTagsInput(value: string | string[]) {
  const values = Array.isArray(value) ? value : value.split(/[\n,;]+/);
  const tags: string[] = [];
  const seen = new Set<string>();

  values
    .map((tag) => tag.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return;

      seen.add(key);
      tags.push(tag);
    });

  return tags;
}

function hymnToForm(hymn: Hymn): HymnForm {
  return {
    hymnBookId: hymn.hymnBookId,
    number: hymn.number,
    title: hymn.title,
    category: hymn.category,
    tags: hymn.tags,
    active: hymn.active,
    createdAt: hymn.createdAt,
    createdByUserId: hymn.createdByUserId,
    updatedAt: hymn.updatedAt,
    updatedByUserId: hymn.updatedByUserId,
    archivedAt: hymn.archivedAt,
    archivedByUserId: hymn.archivedByUserId,
  };
}

function HymnTagInput({ disabled, onChange, tags }: { disabled: boolean; onChange: (tags: string[]) => void; tags: string[] }) {
  const [draft, setDraft] = useState("");

  function addTags(value: string) {
    if (!value.trim()) {
      setDraft("");
      return;
    }

    const nextTags = normalizeHymnTagsInput([...tags, ...normalizeHymnTagsInput(value)]);
    onChange(nextTags);
    setDraft("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((current) => current !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === ";") {
      event.preventDefault();
      addTags(draft);
      return;
    }

    if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[\n,;]/.test(text)) return;

    event.preventDefault();
    addTags(text);
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border bg-white px-3 py-2 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {tags.map((tag) => (
        <Badge key={tag} className="border border-border bg-muted/70 px-2 py-1 text-foreground" variant="outline">
          {tag}
          {!disabled ? (
            <button aria-label={`Remover ${tag}`} className="ml-1 rounded-full hover:text-destructive" onClick={() => removeTag(tag)} type="button">
              <X className="size-3" />
            </button>
          ) : null}
        </Badge>
      ))}
      {!disabled ? (
        <Input
          className="h-6 min-w-28 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          value={draft}
          onBlur={() => addTags(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={tags.length ? "" : "Adicionar tag"}
        />
      ) : tags.length ? null : (
        <span className="text-sm text-muted-foreground">Sem tags</span>
      )}
    </div>
  );
}

function HymnCategoryInput({ disabled, onChange, options, value }: { disabled: boolean; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; value: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const trimmedDraft = draft.trim();
  const normalizedDraft = trimmedDraft.toLocaleLowerCase("pt-BR");
  const filteredOptions = useMemo(
    () => options.filter((option) => option.label.toLocaleLowerCase("pt-BR").includes(normalizedDraft)).slice(0, 8),
    [normalizedDraft, options],
  );

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setDraft(value);
    }
  }

  function handleDraftChange(nextValue: string) {
    setDraft(nextValue);
    onChange(nextValue);
  }

  function selectCategory(category: string) {
    setDraft(category);
    onChange(category);
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <Label>Categoria</Label>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button className="w-full justify-between" disabled={disabled} variant="outline">
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Digite a categoria"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Digite a categoria" value={draft} onValueChange={handleDraftChange} />
            <CommandList>
              {filteredOptions.length ? (
                <CommandGroup heading="Categorias">
                  {filteredOptions.map((option) => (
                    <CommandItem key={option.value} data-checked={option.value === value} value={option.label} onSelect={() => selectCategory(option.label)}>
                      <span className="flex-1">{option.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : (
                <CommandEmpty>{trimmedDraft ? "Nova categoria será criada ao salvar." : "Nenhuma categoria cadastrada."}</CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function hymnSortValue(number: string) {
  const match = number.match(/^(\d+)([a-z]*)$/i);

  return {
    numeric: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match?.[2] ?? "",
    raw: number,
  };
}

export default function SystemHymnsPage() {
  const { currentUser, db, deleteHymn, saveHymn } = useAppContext();
  const hymnBooksById = useMemo(() => new Map(db.hymnBooks.map((hymnBook) => [hymnBook.id, hymnBook])), [db.hymnBooks]);
  const hymnBookOptions = useMemo(() => db.hymnBooks.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.hymnBooks]);
  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(db.hymns.map((hymn) => hymn.category.trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((category) => ({ value: category, label: category })),
    [db.hymns],
  );

  const [search, setSearch] = useState("");
  const [hymnBookFilter, setHymnBookFilter] = useState(ALL_HYMN_BOOKS_FILTER);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_FILTER);
  const [tagFilter, setTagFilter] = useState("");
  const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<HymnForm>(emptyHymnForm);

  const isReadOnly = drawerMode === "view";
  const canManageHymns = isSystemAdmin(currentUser);
  const defaultHymnBookId = hymnBookOptions[0]?.id ?? "";
  const hasActiveFilters = Boolean(search.trim() || tagFilter.trim() || hymnBookFilter !== ALL_HYMN_BOOKS_FILTER || categoryFilter !== ALL_CATEGORIES_FILTER);
  const currentDuplicate = Boolean(
    form.hymnBookId &&
      form.number !== "" &&
      db.hymns.some((hymn) => hymn.id !== selectedHymn?.id && hymn.hymnBookId === form.hymnBookId && hymn.number === form.number),
  );

  const filteredHymns = useMemo(
    () =>
      db.hymns
        .filter((hymn) => {
          if (hymnBookFilter !== ALL_HYMN_BOOKS_FILTER && hymn.hymnBookId !== hymnBookFilter) return false;
          if (categoryFilter !== ALL_CATEGORIES_FILTER && hymn.category !== categoryFilter) return false;

          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          if (normalizedSearch && ![hymn.number, hymn.title].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedSearch))) return false;

          const normalizedTagFilter = tagFilter.trim().toLocaleLowerCase("pt-BR");
          if (normalizedTagFilter && !hymn.tags.some((tag) => tag.toLocaleLowerCase("pt-BR").includes(normalizedTagFilter))) return false;

          return true;
        })
        .sort((a, b) => {
          const bookSort = (hymnBooksById.get(a.hymnBookId)?.name ?? "").localeCompare(hymnBooksById.get(b.hymnBookId)?.name ?? "", "pt-BR");
          const numberA = hymnSortValue(a.number);
          const numberB = hymnSortValue(b.number);
          const numberSort = numberA.numeric - numberB.numeric || numberA.suffix.localeCompare(numberB.suffix, "pt-BR") || numberA.raw.localeCompare(numberB.raw, "pt-BR");

          return bookSort || numberSort || a.title.localeCompare(b.title, "pt-BR");
        }),
    [categoryFilter, db.hymns, hymnBookFilter, hymnBooksById, search, tagFilter],
  );

  function clearFilters() {
    setSearch("");
    setHymnBookFilter(ALL_HYMN_BOOKS_FILTER);
    setCategoryFilter(ALL_CATEGORIES_FILTER);
    setTagFilter("");
  }

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
    const number = normalizeHymnNumberInput(form.number);
    if (!form.hymnBookId || !number || !form.title.trim() || currentDuplicate) return;

    saveHymn({
      id: selectedHymn?.id,
      hymnBookId: form.hymnBookId,
      number,
      title: form.title.trim(),
      category: form.category.trim(),
      tags: normalizeHymnTagsInput(form.tags),
      active: true,
    });
    closeDrawer();
  }

  function deleteSelectedHymn() {
    if (!canManageHymns || !selectedHymn) return;

    deleteHymn(selectedHymn.id);
    closeDrawer();
  }

  function deleteSelectedHymns(hymns: Hymn[]) {
    if (!canManageHymns || !hymns.length) return;

    hymns.forEach((hymn) => deleteHymn(hymn.id));
  }

  const columns = useMemo<ColumnDef<Hymn>[]>(
    () => [
      ...(canManageHymns
        ? [
            {
              id: "select",
              header: ({ table }) => (
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label="Selecionar todos os hinos da página"
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                  />
                </div>
              ),
              cell: ({ row }) => (
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label={`Selecionar hino ${row.original.number}`}
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                  />
                </div>
              ),
              enableSorting: false,
              enableHiding: false,
            } satisfies ColumnDef<Hymn>,
          ]
        : []),
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
        sortingFn: (rowA, rowB) => {
          const numberA = hymnSortValue(rowA.original.number);
          const numberB = hymnSortValue(rowB.original.number);

          return numberA.numeric - numberB.numeric || numberA.suffix.localeCompare(numberB.suffix, "pt-BR") || numberA.raw.localeCompare(numberB.raw, "pt-BR");
        },
      },
      {
        accessorKey: "title",
        meta: { label: "Título" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Título {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <TablePrimaryAction onClick={() => openViewDrawer(row.original)}>{row.original.title}</TablePrimaryAction>,
      },
      {
        accessorKey: "category",
        meta: { label: "Categoria" },
        header: "Categoria",
        cell: ({ row }) => (row.original.category ? <Badge variant="outline">{row.original.category}</Badge> : <span className="text-muted-foreground">-</span>),
        sortingFn: (rowA, rowB) => rowA.original.category.localeCompare(rowB.original.category, "pt-BR"),
      },
      {
        accessorKey: "tags",
        meta: { label: "Tags" },
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex max-w-md flex-wrap gap-1">
            {row.original.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {row.original.tags.length > 4 ? <Badge variant="outline">+{row.original.tags.length - 4}</Badge> : null}
          </div>
        ),
        sortingFn: (rowA, rowB) => rowA.original.tags.join(" ").localeCompare(rowB.original.tags.join(" "), "pt-BR"),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <TableActionButton label="Visualizar" onClick={() => openViewDrawer(row.original)}>
              <Eye />
            </TableActionButton>
            {canManageHymns ? (
              <DeleteTableActionButton
                confirmLabel="Apagar hino"
                description={`Apagar o hino ${row.original.number} - ${row.original.title}? Essa ação remove o hino do catálogo.`}
                label="Apagar hino"
                onConfirm={() => deleteHymn(row.original.id)}
              />
            ) : null}
          </div>
        ),
      },
    ],
    [canManageHymns, deleteHymn, hymnBooksById],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Hinos"
          description="Catálogo de hinos usados nos campos das atas sacramentais."
          actions={
            <div className="flex flex-col gap-2 sm:flex-row">
              <HymnImportDialog />
              <Button onClick={openCreateDrawer} size="lg">
                Novo hino
              </Button>
            </div>
          }
        />

        <DataTable
          columns={columns}
          data={filteredHymns}
          emptyMessage="Nenhum hino encontrado com os filtros atuais."
          enableColumnVisibility
          enableRowSelection={canManageHymns}
          getRowId={(hymn) => hymn.id}
          toolbar={
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <SearchInput className="md:max-w-sm" placeholder="Buscar por número ou título" value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="md:w-64">
                <Label className="sr-only">Filtrar por hinário</Label>
                <Select value={hymnBookFilter} onValueChange={setHymnBookFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos os hinários" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_HYMN_BOOKS_FILTER}>Todos os hinários</SelectItem>
                    {hymnBookOptions.map((hymnBook) => (
                      <SelectItem key={hymnBook.id} value={hymnBook.id}>
                        {hymnBook.emoji} {hymnBook.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:w-56">
                <Label className="sr-only">Filtrar por categoria</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todas as categorias" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CATEGORIES_FILTER}>Todas as categorias</SelectItem>
                    {categoryOptions.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <SearchInput className="md:max-w-48" placeholder="Filtrar por tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} />
              {hasActiveFilters ? (
                <Button className="self-start xl:self-auto" onClick={clearFilters} type="button" variant="outline">
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          }
          renderSelectedActions={
            canManageHymns
              ? (selectedHymns) => (
                  <DeleteConfirmationDialog
                    confirmLabel="Apagar selecionados"
                    description={`Apagar ${selectedHymns.length} hino(s) selecionado(s)? Essa ação remove os hinos do catálogo.`}
                    onConfirm={() => deleteSelectedHymns(selectedHymns)}
                  >
                    <Button disabled={!selectedHymns.length} size="sm" variant="destructive">
                      <Trash2 />
                      Apagar selecionados
                    </Button>
                  </DeleteConfirmationDialog>
                )
              : undefined
          }
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
                  <Input
                    disabled={isReadOnly}
                    inputMode="text"
                    pattern="[0-9A-Za-z]*"
                    value={form.number}
                    onChange={(event) => setForm((current) => ({ ...current, number: normalizeHymnNumberInput(event.target.value) }))}
                  />
                </div>
                <div>
                  <Label>Título</Label>
                  <Input disabled={isReadOnly} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div>
                  <HymnCategoryInput
                    disabled={isReadOnly}
                    options={categoryOptions}
                    value={form.category}
                    onChange={(category) => setForm((current) => ({ ...current, category }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Tags</Label>
                  <HymnTagInput
                    disabled={isReadOnly}
                    key={`${drawerMode}-${selectedHymn?.id ?? "new"}`}
                    tags={form.tags}
                    onChange={(tags) => setForm((current) => ({ ...current, tags }))}
                  />
                </div>
                {currentDuplicate ? <p className="text-sm text-destructive">Já existe um hino com esse número nesse hinário.</p> : null}
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div>
                  {isReadOnly && canManageHymns && selectedHymn ? (
                    <DeleteConfirmationDialog
                      confirmLabel="Apagar hino"
                      description={`Apagar o hino ${selectedHymn.number} - ${selectedHymn.title}? Essa ação remove o hino do catálogo.`}
                      onConfirm={deleteSelectedHymn}
                    >
                      <Button variant="destructive">
                        <Trash2 />
                        Apagar hino
                      </Button>
                    </DeleteConfirmationDialog>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && selectedHymn ? <Button onClick={() => openEditDrawer(selectedHymn)}>Editar hino</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.hymnBookId || form.number === "" || !form.title.trim() || currentDuplicate} onClick={saveCurrentHymn}>
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

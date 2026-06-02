"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Hymn } from "@/types/domain";

const ALL_HYMN_BOOKS_FILTER = "__all_hymn_books__";
const ALL_CATEGORIES_FILTER = "__all_categories__";

function hymnSortValue(number: string) {
  const match = number.match(/^(\d+)([a-z]*)$/i);

  return {
    numeric: match ? Number(match[1]) : Number.MAX_SAFE_INTEGER,
    suffix: match?.[2] ?? "",
    raw: number,
  };
}

export default function MeetingHymnsPage() {
  const { db } = useAppContext();
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

  const hasActiveFilters = Boolean(search.trim() || tagFilter.trim() || hymnBookFilter !== ALL_HYMN_BOOKS_FILTER || categoryFilter !== ALL_CATEGORIES_FILTER);

  const filteredHymns = useMemo(
    () =>
      db.hymns
        .filter((hymn) => {
          if (!hymn.active) return false;
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
            {row.original.tags.length ? (
              row.original.tags.slice(0, 4).map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
            {row.original.tags.length > 4 ? <Badge variant="outline">+{row.original.tags.length - 4}</Badge> : null}
          </div>
        ),
        sortingFn: (rowA, rowB) => rowA.original.tags.join(" ").localeCompare(rowB.original.tags.join(" "), "pt-BR"),
      },
    ],
    [hymnBooksById],
  );

  return (
    <PermissionGuard permission="hymns.view">
      <div>
        <PageHeader
          eyebrow="Atas Sacramentais"
          title="Hinos"
          description="Catálogo somente leitura dos hinos disponíveis para uso nas atas sacramentais."
        />

        <DataTable
          columns={columns}
          data={filteredHymns}
          emptyMessage="Nenhum hino encontrado com os filtros atuais."
          enableColumnVisibility
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
        />
      </div>
    </PermissionGuard>
  );
}

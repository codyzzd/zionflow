"use client";

import * as React from "react";

import {
  type ColumnDef,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    label?: string;
  }
}
import { CheckSquare, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
  enableColumnVisibility?: boolean;
  enableRowSelection?: boolean;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  onSelectionActiveChange?: (active: boolean) => void;
  pageSize?: number;
  pageSizeOptions?: number[];
  renderSelectedActions?: (selectedRows: TData[]) => React.ReactNode;
  selectionActive?: boolean;
  selectionColumnId?: string;
  selectionMode?: "always" | "optional";
  showSelectionToggle?: boolean;
  toolbar?: React.ReactNode;
};

function getColumnLabel(column: {
  id: string;
  columnDef: { header?: unknown; meta?: { label?: string } };
}): string {
  if (column.columnDef.meta?.label) return column.columnDef.meta.label;
  if (typeof column.columnDef.header === "string") return column.columnDef.header;
  return column.id;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = "Nenhum resultado encontrado.",
  enableColumnVisibility,
  enableRowSelection,
  getRowId,
  onSelectionActiveChange,
  pageSize = 10,
  pageSizeOptions = [10, 50, 100, 500, 1000],
  renderSelectedActions,
  selectionActive: controlledSelectionActive,
  selectionColumnId = "select",
  selectionMode = "always",
  showSelectionToggle = true,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const rowSelectionEnabled = enableRowSelection ?? Boolean(renderSelectedActions);
  const selectionIsOptional = rowSelectionEnabled && selectionMode === "optional";
  const [uncontrolledSelectionActive, setUncontrolledSelectionActive] = React.useState(!selectionIsOptional);
  const selectionActive = controlledSelectionActive ?? uncontrolledSelectionActive;
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    selectionIsOptional ? { [selectionColumnId]: false } : {},
  );

  React.useEffect(() => {
    if (!selectionIsOptional) {
      setUncontrolledSelectionActive(rowSelectionEnabled);
      return;
    }

    setUncontrolledSelectionActive(false);
    onSelectionActiveChange?.(false);
    setRowSelection({});
    setColumnVisibility((current) => ({ ...current, [selectionColumnId]: false }));
  }, [onSelectionActiveChange, rowSelectionEnabled, selectionColumnId, selectionIsOptional]);

  React.useEffect(() => {
    if (!selectionIsOptional) return;

    setColumnVisibility((current) => ({ ...current, [selectionColumnId]: selectionActive }));
    if (!selectionActive) {
      setRowSelection({});
    }
  }, [selectionActive, selectionColumnId, selectionIsOptional]);

  function setSelectionModeActive(active: boolean) {
    setUncontrolledSelectionActive(active);
    onSelectionActiveChange?.(active);
  }

  function toggleSelectionMode() {
    setSelectionModeActive(!selectionActive);
  }

  // TanStack Table is intentionally used here to match the shadcn data table pattern.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    enableRowSelection: rowSelectionEnabled,
    getRowId,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      columnVisibility,
      rowSelection,
      sorting,
    },
    initialState: {
      pagination: {
        pageSize,
      },
    },
  });

  const hideableColumns = table.getAllLeafColumns().filter((column) => column.getCanHide());
  const resolvedPageSizeOptions = React.useMemo(() => {
    return Array.from(new Set([...pageSizeOptions, pageSize])).sort((a, b) => a - b);
  }, [pageSize, pageSizeOptions]);

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const visibleColumnCount = table.getVisibleLeafColumns().length;

  const showToolbar = Boolean(toolbar) || (selectionIsOptional && showSelectionToggle) || (enableColumnVisibility && hideableColumns.length > 0);
  const showSelectionSummary = rowSelectionEnabled && (!selectionIsOptional || selectionActive);

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">{toolbar}</div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {selectionIsOptional && showSelectionToggle ? (
              <Button aria-label={selectionActive ? "Cancelar seleção" : "Selecionar linhas"} onClick={toggleSelectionMode} size="icon" variant={selectionActive ? "secondary" : "outline"}>
                {selectionActive ? <X /> : <CheckSquare />}
              </Button>
            ) : null}
            {enableColumnVisibility && hideableColumns.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button aria-label="Exibir colunas" size="icon" variant="outline">
                      <SlidersHorizontal />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hideableColumns.map((column) => (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                        closeOnClick={false}
                      >
                        {getColumnLabel(column)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={visibleColumnCount}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm md:flex-row md:items-start md:justify-between">
        <div className="flex min-h-8 flex-wrap items-center gap-3 text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Linhas</span>
            <Select value={String(table.getState().pagination.pageSize)} onValueChange={(value) => table.setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[88px] bg-background text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {resolvedPageSizeOptions.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="tabular-nums">{showSelectionSummary ? `${selectedRows.length} de ${data.length} linha(s) selecionada(s).` : `${data.length} linha(s).`}</p>
          {renderSelectedActions && selectedRows.length ? <div className="flex items-center gap-2">{renderSelectedActions(selectedRows)}</div> : null}
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} size="sm" variant="outline">
            Anterior
          </Button>
          <Button disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} size="sm" variant="outline">
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}

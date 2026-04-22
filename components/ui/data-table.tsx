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
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: string;
  enableColumnVisibility?: boolean;
  enableRowSelection?: boolean;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  pageSize?: number;
  renderSelectedActions?: (selectedRows: TData[]) => React.ReactNode;
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
  pageSize = 10,
  renderSelectedActions,
  toolbar,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const rowSelectionEnabled = enableRowSelection ?? Boolean(renderSelectedActions);

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

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);

  const showToolbar = Boolean(toolbar) || (enableColumnVisibility && hideableColumns.length > 0);

  return (
    <div className="space-y-4">
      {showToolbar ? (
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">{toolbar}</div>
          {enableColumnVisibility && hideableColumns.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="outline">
                    <SlidersHorizontal />
                    Colunas
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
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
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
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
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={columns.length}>
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
        <div className="flex min-h-8 flex-wrap items-center gap-3 text-muted-foreground">
          <p className="tabular-nums">{rowSelectionEnabled ? `${selectedRows.length} de ${data.length} linha(s) selecionada(s).` : `${data.length} linha(s).`}</p>
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

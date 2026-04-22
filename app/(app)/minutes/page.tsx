"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEmptyMinuteForm } from "@/lib/demo-data";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn } from "@/lib/utils";
import type { HybridField, SacramentMinute } from "@/types/domain";

type MinuteCreateForm = {
  date: string;
  notes: string;
};

export default function MinutesPage() {
  const { currentUser, currentWard, hasPermission, membersByWard, minutesByWard, saveMinute, usersByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageMinutes = hasPermission("minutes.manage");

  function buildMinuteTitle(date: string) {
    return `Ata sacramental - ${formatDate(date)}`;
  }
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  function createEmptyForm(): MinuteCreateForm {
    return {
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    };
  }

  const [form, setForm] = useState<MinuteCreateForm>(() => createEmptyForm());

  const formatSpeakerField = useCallback(
    (field: HybridField) => {
      if (field.mode === "manual") {
        return field.manualValue?.trim() || "-";
      }

      return membersByWard.find((member) => member.id === field.linkedId)?.name ?? "-";
    },
    [membersByWard],
  );

  const items = useMemo(
    () =>
      [...minutesByWard]
        .filter((minute) => {
          const speakers = [
            formatSpeakerField(minute.form.speaker1),
            formatSpeakerField(minute.form.speaker2),
            formatSpeakerField(minute.form.speaker3),
          ].join(" ");
          const matchesSearch = `${formatDate(minute.date)} ${speakers}`.toLowerCase().includes(search.toLowerCase());
          return matchesSearch;
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [formatSpeakerField, minutesByWard, search],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setForm(createEmptyForm());
    }
  }

  function openCreateDrawer() {
    setForm(createEmptyForm());
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentMinute() {
    if (!currentWard || !form.date) return;

    const minuteForm = createEmptyMinuteForm();
    minuteForm.notes = form.notes.trim();

    saveMinute({
      wardId: currentWard.id,
      title: buildMinuteTitle(form.date),
      date: form.date,
      status: "draft",
      presidency: "Bispado",
      responsibleUserId: currentUser?.id ?? usersByWard[0]?.id ?? "",
      form: minuteForm,
    });

    closeDrawer();
  }

  const columns = useMemo<ColumnDef<SacramentMinute>[]>(
    () => [
      ...(canManageMinutes
        ? [
            {
              id: "select",
              header: ({ table }) => (
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label="Selecionar todas as atas da página"
                    checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                  />
                </div>
              ),
              cell: ({ row }) => (
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label={`Selecionar ata de ${formatDate(row.original.date)}`}
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                  />
                </div>
              ),
              enableSorting: false,
              enableHiding: false,
            } satisfies ColumnDef<SacramentMinute>,
          ]
        : []),
      {
        accessorKey: "date",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Data {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: "speaker1",
        header: "1º orador",
        cell: ({ row }) => formatSpeakerField(row.original.form.speaker1),
      },
      {
        id: "speaker2",
        header: "2º orador",
        cell: ({ row }) => formatSpeakerField(row.original.form.speaker2),
      },
      {
        id: "speaker3",
        header: "3º orador",
        cell: ({ row }) => formatSpeakerField(row.original.form.speaker3),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const minute = row.original;

          return (
            <div className="flex justify-end gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link href={`/minutes/${minute.id}`}>Abrir</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!currentWard) return;
                  const nextDate = new Date(`${minute.date}T12:00:00`);
                  nextDate.setDate(nextDate.getDate() + 7);
                  saveMinute({
                    wardId: currentWard.id,
                    title: buildMinuteTitle(nextDate.toISOString().slice(0, 10)),
                    date: nextDate.toISOString().slice(0, 10),
                    status: "draft",
                    presidency: minute.presidency,
                    responsibleUserId: minute.responsibleUserId,
                    form: minute.form,
                  });
                }}
              >
                Duplicar
              </Button>
            </div>
          );
        },
      },
    ],
    [canManageMinutes, currentWard, formatSpeakerField, saveMinute],
  );

  return (
    <PermissionGuard permission="minutes.view">
      <div>
        <PageHeader
          eyebrow="Atas Sacramentais"
          title="Lista de atas"
          description="Consulta por data e oradores, com histórico de versões e edição posterior."
          actions={
            canManageMinutes ? (
              <Button onClick={openCreateDrawer} size="lg">
                Nova ata
              </Button>
            ) : null
          }
        />

        <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Input
              className="md:max-w-lg"
              placeholder="Buscar por data ou oradores"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <DataTable
            columns={columns}
            data={items}
            emptyMessage="Nenhuma ata encontrada com os filtros atuais."
            enableRowSelection={canManageMinutes}
            getRowId={(minute) => minute.id}
          />
        </div>

        {canManageMinutes ? (
          <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
            <DrawerContent className="sm:max-w-3xl" direction="right">
              <DrawerHeader className="border-b">
                <DrawerTitle>Nova ata</DrawerTitle>
                <DrawerDescription>Cadastro inicial da ata em um drawer lateral à direita, no mesmo padrão da criação de membros.</DrawerDescription>
              </DrawerHeader>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-4">
                  <div className="section-grid">
                    <div>
                      <Label>Data</Label>
                      <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
                    </div>
                  </div>

                  <div>
                    <Label>Anotações iniciais</Label>
                    <Textarea
                      className="min-h-32"
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <DrawerFooter className="border-t bg-background">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    Cancelar
                  </Button>
                  <Button disabled={!currentWard || !form.date} onClick={saveCurrentMinute}>
                    Salvar ata
                  </Button>
                </div>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        ) : null}
      </div>
    </PermissionGuard>
  );
}

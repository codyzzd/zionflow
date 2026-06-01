"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AccessMatrixEditor } from "@/components/features/access/access-matrix-editor";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { ACCESS_MATRIX_AREAS, accessLevelFromPermissions } from "@/lib/access-control";
import { isSystemRoleId } from "@/lib/system-ids";
import type { PermissionKey, Role } from "@/types/domain";

type AccessTemplateForm = Omit<Role, "id">;
type DrawerMode = "create" | "view" | "edit";

const emptyAccessTemplateForm: AccessTemplateForm = {
  name: "",
  description: "",
  permissions: [],
};

function accessTemplateToForm(template: Role): AccessTemplateForm {
  return {
    name: template.name,
    description: template.description,
    permissions: template.permissions,
  };
}

function getAccessSummary(permissions: PermissionKey[]) {
  const editable = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "edit").length;
  const visibleOnly = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "view").length;
  const hidden = ACCESS_MATRIX_AREAS.length - editable - visibleOnly;

  return { editable, visibleOnly, hidden };
}

export default function SystemAccessTemplatesPage() {
  const { db, deleteAccessTemplate, saveAccessTemplate } = useAppContext();
  const accessTemplates = useMemo(() => db.roles.filter((role) => !isSystemRoleId(role.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.roles]);

  const [search, setSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Role | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AccessTemplateForm>(emptyAccessTemplateForm);

  const isReadOnly = drawerMode === "view";
  const filteredTemplates = useMemo(
    () =>
      accessTemplates.filter((template) => {
        const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
        if (!normalizedSearch) return true;

        return [template.name, template.description].some((field) => field.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
      }),
    [accessTemplates, search],
  );

  function resetDrawer() {
    setSelectedTemplate(null);
    setDrawerMode("create");
    setForm(emptyAccessTemplateForm);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);
    if (!open) resetDrawer();
  }

  function openCreateDrawer() {
    setSelectedTemplate(null);
    setDrawerMode("create");
    setForm(emptyAccessTemplateForm);
    setDrawerOpen(true);
  }

  function openViewDrawer(template: Role) {
    setSelectedTemplate(template);
    setDrawerMode("view");
    setForm(accessTemplateToForm(template));
    setDrawerOpen(true);
  }

  function openEditDrawer(template: Role) {
    setSelectedTemplate(template);
    setDrawerMode("edit");
    setForm(accessTemplateToForm(template));
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentTemplate() {
    if (!form.name.trim()) return;

    saveAccessTemplate({
      id: selectedTemplate?.id,
      name: form.name.trim(),
      description: form.description.trim(),
      permissions: form.permissions,
    });

    closeDrawer();
  }

  function deleteSelectedTemplate() {
    if (!selectedTemplate) return;

    deleteAccessTemplate(selectedTemplate.id);
    closeDrawer();
  }

  const columns = useMemo<ColumnDef<Role>[]>(
    () => [
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
        accessorKey: "description",
        meta: { label: "Descrição" },
        header: "Descrição",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.description || "-"}</span>,
      },
      {
        id: "summary",
        meta: { label: "Acessos" },
        header: "Acessos",
        cell: ({ row }) => {
          const summary = getAccessSummary(row.original.permissions);

          return (
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary">{summary.editable} editar</Badge>
              <Badge variant="outline">{summary.visibleOnly} visualizar</Badge>
              <Badge variant="outline">{summary.hidden} ocultas</Badge>
            </div>
          );
        },
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
    [],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Templates de acesso"
          description="Modelos globais para preencher rapidamente a matriz de acesso dos usuários."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Novo template
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredTemplates}
          emptyMessage="Nenhum template de acesso cadastrado."
          enableColumnVisibility
          toolbar={<Input className="md:max-w-lg" placeholder="Buscar por nome ou descrição" value={search} onChange={(event) => setSearch(event.target.value)} />}
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-3xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>
                {drawerMode === "create" ? "Novo template" : drawerMode === "edit" ? "Editar template" : selectedTemplate ? selectedTemplate.name : "Template"}
              </DrawerTitle>
              <DrawerDescription>Configure as permissões que serão copiadas para a matriz do usuário ao aplicar este template.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-5">
                <div className="section-grid">
                  <div>
                    <Label>Nome</Label>
                    <Input disabled={isReadOnly} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Descrição</Label>
                    <Textarea
                      className="min-h-24"
                      disabled={isReadOnly}
                      value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label>Matriz de acessos</Label>
                  <AccessMatrixEditor
                    disabled={isReadOnly}
                    permissions={form.permissions}
                    onChange={(permissions) => setForm((current) => ({ ...current, permissions }))}
                  />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                <div>
                  {isReadOnly && selectedTemplate ? (
                    <Button onClick={deleteSelectedTemplate} variant="destructive">
                      <Trash2 />
                      Apagar template
                    </Button>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && selectedTemplate ? <Button onClick={() => openEditDrawer(selectedTemplate)}>Editar template</Button> : null}
                  {!isReadOnly ? (
                    <Button disabled={!form.name.trim()} onClick={saveCurrentTemplate}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar template"}
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

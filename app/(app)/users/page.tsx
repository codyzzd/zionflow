"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Pencil, UserCheck, UserX } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AccessMatrixEditor } from "@/components/features/access/access-matrix-editor";
import { UserAccessLevelSelect } from "@/components/features/access/user-access-level-select";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import {
  ACCESS_MATRIX_AREAS,
  USER_ACCESS_LEVEL_LABELS,
  USER_ACCESS_LEVELS,
  accessLevelFromPermissions,
  canAssignAccessLevel,
  canManageUser,
} from "@/lib/access-control";
import { isSystemAdmin } from "@/lib/system-access";
import { isSystemRoleId } from "@/lib/system-ids";
import type { PermissionKey, User, UserAccessLevel, UserStatus } from "@/types/domain";

type UserForm = {
  name: string;
  email: string;
  phone: string;
  accessLevel: UserAccessLevel;
  roleId: string;
  memberId: string;
  status: UserStatus;
  permissionOverrides: PermissionKey[];
};

const emptyUserForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  accessLevel: "member",
  roleId: "",
  memberId: "",
  status: "active",
  permissionOverrides: [],
};

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

function getAccessSummary(permissions: PermissionKey[]) {
  const editable = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "edit").length;
  const visibleOnly = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "view").length;
  const hidden = ACCESS_MATRIX_AREAS.length - editable - visibleOnly;

  return { editable, visibleOnly, hidden };
}

export default function UsersPage() {
  const { currentUser, currentWard, hasPermission, membersByWard, roles, toggleUserStatus, usersByWard, saveUser, wards } = useAppContext();
  const { formatDateTime } = useDateFormatter();
  const canManageUsers = hasPermission("users.manage");
  const canCreateUser = Boolean(canManageUsers && currentWard && canAssignAccessLevel(currentUser, "member", currentWard, wards));
  const accessTemplates = useMemo(() => roles.filter((role) => !isSystemRoleId(role.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [roles]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccessTemplateId, setSelectedAccessTemplateId] = useState<string>();
  const assignableAccessLevels = useMemo(
    () => (currentWard ? USER_ACCESS_LEVELS.filter((level) => canAssignAccessLevel(currentUser, level, currentWard, wards)) : []),
    [currentUser, currentWard, wards],
  );

  const filteredUsers = useMemo(
    () =>
      usersByWard.filter((user) => {
        const linkedMember = membersByWard.find((member) => member.id === user.memberId);
        const normalizedSearch = search.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          user.name.toLowerCase().includes(normalizedSearch) ||
          user.email.toLowerCase().includes(normalizedSearch) ||
          user.phone.toLowerCase().includes(normalizedSearch) ||
          linkedMember?.name.toLowerCase().includes(normalizedSearch);
        const matchesStatus = statusFilter === "all" || user.status === statusFilter;

        return matchesSearch && matchesStatus;
      }),
    [membersByWard, search, statusFilter, usersByWard],
  );

  function resetForm() {
    setEditingId(undefined);
    setForm(emptyUserForm);
    setSelectedAccessTemplateId(undefined);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      resetForm();
    }
  }

  function openCreateDrawer() {
    if (!canCreateUser) return;
    resetForm();
    setDrawerOpen(true);
  }

  const openEditDrawer = useCallback((user: User) => {
    if (!canManageUsers) return;
    if (isSystemAdmin(user) && user.id !== currentUser?.id) return;
    if (!canManageUser(currentUser, user, wards)) return;

    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      accessLevel: user.accessLevel,
      roleId: user.roleId,
      memberId: user.memberId ?? "",
      status: user.status,
      permissionOverrides: user.permissionOverrides,
    });
    setSelectedAccessTemplateId(undefined);
    setDrawerOpen(true);
  }, [canManageUsers, currentUser, wards]);

  function applyAccessTemplate(templateId: string) {
    const template = accessTemplates.find((role) => role.id === templateId);
    if (!template) return;

    setSelectedAccessTemplateId(templateId);
    setForm((current) => ({
      ...current,
      permissionOverrides: template.permissions,
    }));
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentUser() {
    if (!currentWard || !form.name.trim() || !form.email.trim() || !canManageUsers) return;

    saveUser({
      id: editingId,
      wardId: currentWard.id,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      accessLevel: form.accessLevel,
      roleId: form.roleId,
      memberId: form.memberId || undefined,
      status: form.status,
      permissionOverrides: form.permissionOverrides,
      permissionsConfigured: true,
    });

    closeDrawer();
  }

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              aria-label="Selecionar todos os usuários da página"
              checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              aria-label={`Selecionar ${row.original.name}`}
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "name",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Usuário {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const user = row.original;
          const linkedMember = membersByWard.find((member) => member.id === user.memberId);
          const isProtectedSystemUser = isSystemAdmin(user) && user.id !== currentUser?.id;
          const canEditTarget = canManageUsers && !isProtectedSystemUser && canManageUser(currentUser, user, wards);

          return (
            <div className="space-y-1">
              {canEditTarget ? <TablePrimaryAction onClick={() => openEditDrawer(user)}>{user.name}</TablePrimaryAction> : <p className="font-medium">{user.name}</p>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{user.email}</span>
                <span>{user.phone || "Telefone não informado"}</span>
                <span>{linkedMember ? `Membro: ${linkedMember.name}` : "Sem membro vinculado"}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: "accessLevel",
        header: "Nível",
        cell: ({ row }) => USER_ACCESS_LEVEL_LABELS[row.original.accessLevel],
        sortingFn: (rowA, rowB) =>
          USER_ACCESS_LEVEL_LABELS[rowA.original.accessLevel].localeCompare(USER_ACCESS_LEVEL_LABELS[rowB.original.accessLevel], "pt-BR"),
      },
      {
        id: "access",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Acessos {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const summary = getAccessSummary(row.original.permissionOverrides);

          return (
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{summary.editable} editar</Badge>
              <Badge variant="secondary">{summary.visibleOnly} visível</Badge>
              {summary.hidden ? <Badge variant="outline">{summary.hidden} invisível</Badge> : null}
            </div>
          );
        },
        sortingFn: (rowA, rowB) => getAccessSummary(rowA.original.permissionOverrides).editable - getAccessSummary(rowB.original.permissionOverrides).editable,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Status {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const user = row.original;

          return <Badge variant={user.status === "active" ? "default" : "secondary"}>{statusLabels[user.status]}</Badge>;
        },
      },
      {
        accessorKey: "lastAccessAt",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Último acesso {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (row.original.lastAccessAt ? formatDateTime(row.original.lastAccessAt) : "Nunca"),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const user = row.original;
          const isProtectedSystemUser = isSystemAdmin(user) && user.id !== currentUser?.id;
          const canEditTarget = canManageUsers && !isProtectedSystemUser && canManageUser(currentUser, user, wards);

          return (
            <div className="flex justify-end gap-1">
              {canEditTarget ? (
                <>
                  <TableActionButton label="Editar usuário" onClick={() => openEditDrawer(user)} variant="outline">
                    <Pencil />
                  </TableActionButton>
                  <TableActionButton label={user.status === "active" ? "Desativar usuário" : "Ativar usuário"} onClick={() => toggleUserStatus(user.id)}>
                    {user.status === "active" ? <UserX /> : <UserCheck />}
                  </TableActionButton>
                </>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManageUsers, currentUser, formatDateTime, membersByWard, openEditDrawer, toggleUserStatus, wards],
  );

  return (
    <PermissionGuard permission="users.view">
      <div>
        <PageHeader
          eyebrow="Usuários e acessos"
          title="Acessos por área"
          description="Gestão de contas e matriz de acesso por área do sistema."
          actions={
            canCreateUser ? (
            <Button onClick={openCreateDrawer} size="lg">
              Novo usuário
            </Button>
            ) : null
          }
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Input
                className="lg:max-w-lg"
                placeholder="Buscar por nome, e-mail, telefone ou membro"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="lg:w-[220px]">
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DataTable columns={columns} data={filteredUsers} emptyMessage="Nenhum usuário encontrado com os filtros atuais." enableRowSelection />
          </div>
        </div>

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{editingId ? "Editar usuário" : "Novo usuário"}</DrawerTitle>
              <DrawerDescription>Configure o acesso por área usando ocultar, visualizar ou editar.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Nome completo</Label>
                  <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
                </div>
                <div>
                  <Label>Membro vinculado</Label>
                  <Select
                    value={form.memberId || "__none__"}
                    onValueChange={(value) => setForm((current) => ({ ...current, memberId: !value || value === "__none__" ? "" : value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o membro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem vínculo</SelectItem>
                      {membersByWard.map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nível de liderança</Label>
                  <UserAccessLevelSelect
                    levels={assignableAccessLevels}
                    value={form.accessLevel}
                    onValueChange={(value) => setForm((current) => ({ ...current, accessLevel: value }))}
                  />
                </div>
                <div className="rounded-lg border bg-card px-3 py-2.5">
                  <div className="flex min-h-8 items-center justify-between gap-3">
                    <div className="space-y-1">
                      <Label className="mb-0">Status</Label>
                      <p className="text-sm text-muted-foreground">{statusLabels[form.status]}</p>
                    </div>
                    <Switch
                      aria-label="Status do usuário"
                      checked={form.status === "active"}
                      onCheckedChange={(checked) => setForm((current) => ({ ...current, status: checked ? "active" : "inactive" }))}
                    />
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <Label>Matriz de acessos</Label>
                  {accessTemplates.length ? (
                    <Select value={selectedAccessTemplateId} onValueChange={applyAccessTemplate}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Aplicar template de acesso" />
                      </SelectTrigger>
                      <SelectContent>
                        {accessTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Nenhum template cadastrado.</div>
                  )}
                  <AccessMatrixEditor
                    permissions={form.permissionOverrides}
                    onChange={(permissionOverrides) => setForm((current) => ({ ...current, permissionOverrides }))}
                  />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={!currentWard || !form.name.trim() || !form.email.trim() || !canManageUsers || !assignableAccessLevels.includes(form.accessLevel)} onClick={saveCurrentUser}>
                  {editingId ? "Salvar alterações" : "Criar usuário"}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </PermissionGuard>
  );
}

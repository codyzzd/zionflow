"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Eye, EyeOff, Pencil } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_MATRIX_AREAS,
  accessLevelFromPermissions,
  permissionsForAccessLevel,
  type AccessArea,
  type AccessLevel,
} from "@/lib/access-control";
import { cn } from "@/lib/utils";
import type { PermissionKey, User, UserStatus } from "@/types/domain";

type UserForm = {
  name: string;
  email: string;
  phone: string;
  roleId: string;
  memberId: string;
  status: UserStatus;
  permissionOverrides: PermissionKey[];
};

const DEFAULT_LEGACY_ROLE_ID = "role_viewer";
const readOnlyAccessLevels: AccessLevel[] = ["hidden", "view"];
const editableAccessLevels: AccessLevel[] = ["hidden", "view", "edit"];

const emptyUserForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  roleId: DEFAULT_LEGACY_ROLE_ID,
  memberId: "",
  status: "active",
  permissionOverrides: [],
};

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

const accessLevelIcons = {
  hidden: EyeOff,
  view: Eye,
  edit: Pencil,
};

function updateAreaAccess(permissions: PermissionKey[], area: AccessArea, level: AccessLevel) {
  const areaPermissions = [area.viewPermission, area.managePermission].filter(Boolean) as PermissionKey[];
  const nextPermissions = permissions.filter((permission) => !areaPermissions.includes(permission));

  return Array.from(new Set([...nextPermissions, ...permissionsForAccessLevel(area, level)]));
}

function getAccessSummary(permissions: PermissionKey[]) {
  const editable = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "edit").length;
  const visibleOnly = ACCESS_MATRIX_AREAS.filter((area) => accessLevelFromPermissions(area, permissions) === "view").length;
  const hidden = ACCESS_MATRIX_AREAS.length - editable - visibleOnly;

  return { editable, visibleOnly, hidden };
}

function AccessLevelButtonGroup({
  level,
  levels,
  onChange,
}: {
  level: AccessLevel;
  levels: AccessLevel[];
  onChange: (level: AccessLevel) => void;
}) {
  return (
    <div aria-label="Nível de acesso" className="inline-flex w-fit rounded-md border bg-card p-0.5" role="group">
      {levels.map((accessLevel) => {
        const Icon = accessLevelIcons[accessLevel];
        const isActive = level === accessLevel;

        return (
          <Tooltip key={accessLevel}>
            <TooltipTrigger asChild>
              <Button
                aria-label={ACCESS_LEVEL_LABELS[accessLevel]}
                aria-pressed={isActive}
                className={cn(
                  "size-8 rounded-sm",
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => onChange(accessLevel)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{ACCESS_LEVEL_LABELS[accessLevel]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const { currentWard, hasPermission, membersByWard, toggleUserStatus, usersByWard, saveUser } = useAppContext();
  const { formatDateTime } = useDateFormatter();
  const canManageUsers = hasPermission("users.manage");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      resetForm();
    }
  }

  function openCreateDrawer() {
    if (!canManageUsers) return;
    resetForm();
    setDrawerOpen(true);
  }

  const openEditDrawer = useCallback((user: User) => {
    if (!canManageUsers) return;
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      memberId: user.memberId ?? "",
      status: user.status,
      permissionOverrides: user.permissionOverrides,
    });
    setDrawerOpen(true);
  }, [canManageUsers]);

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
      roleId: form.roleId || DEFAULT_LEGACY_ROLE_ID,
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

          return (
            <div className="space-y-1">
              <p className="font-medium">{user.name}</p>
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

          return (
            <div className="flex justify-end gap-2">
              {canManageUsers ? (
                <>
                  <Button onClick={() => openEditDrawer(user)} size="sm" variant="outline">
                    Editar
                  </Button>
                  <Button onClick={() => toggleUserStatus(user.id)} size="sm" variant="ghost">
                    {user.status === "active" ? "Desativar" : "Ativar"}
                  </Button>
                </>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManageUsers, formatDateTime, membersByWard, openEditDrawer, toggleUserStatus],
  );

  return (
    <PermissionGuard permission="users.view">
      <div>
        <PageHeader
          eyebrow="Usuários e acessos"
          title="Acessos por área"
          description="Gestão de contas e matriz de acesso por área do sistema."
          actions={
            canManageUsers ? (
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
              <div className="space-y-4">
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
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(value) => value && setForm((current) => ({ ...current, status: value as UserStatus }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Matriz de acessos</Label>
                  <div className="divide-y rounded-lg border">
                    {ACCESS_MATRIX_AREAS.map((area) => {
                      const level = accessLevelFromPermissions(area, form.permissionOverrides);
                      const availableAccessLevels = area.managePermission ? editableAccessLevels : readOnlyAccessLevels;

                      return (
	                        <div className="grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center" key={area.id}>
	                          <div>
	                            <p className="font-medium">{area.label}</p>
	                            <p className="text-xs text-muted-foreground">
	                              {area.managePermission ? "Visualizar permite consultar; editar libera ações." : "Sem edição separada por enquanto."}
	                            </p>
	                          </div>
	                          <AccessLevelButtonGroup
	                            level={level}
	                            levels={availableAccessLevels}
	                            onChange={(accessLevel) =>
	                              setForm((current) => ({
	                                ...current,
	                                permissionOverrides: updateAreaAccess(current.permissionOverrides, area, accessLevel),
	                              }))
	                            }
	                          />
	                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={!currentWard || !form.name.trim() || !form.email.trim() || !canManageUsers} onClick={saveCurrentUser}>
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

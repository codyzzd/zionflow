"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
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

const overridePermissions: PermissionKey[] = ["missionary.manage", "patrol.manage", "exports.run"];

const emptyUserForm: UserForm = {
  name: "",
  email: "",
  phone: "",
  roleId: "",
  memberId: "",
  status: "active",
  permissionOverrides: [],
};

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
};

export default function UsersPage() {
  const { currentWard, membersByWard, roles, toggleUserStatus, usersByWard, saveUser } = useAppContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<UserForm>(() => ({
    ...emptyUserForm,
    roleId: roles[0]?.id ?? "",
  }));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredUsers = useMemo(
    () =>
      usersByWard.filter((user) => {
        const role = roles.find((item) => item.id === user.roleId);
        const linkedMember = membersByWard.find((member) => member.id === user.memberId);
        const normalizedSearch = search.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          user.name.toLowerCase().includes(normalizedSearch) ||
          user.email.toLowerCase().includes(normalizedSearch) ||
          user.phone.toLowerCase().includes(normalizedSearch) ||
          role?.name.toLowerCase().includes(normalizedSearch) ||
          linkedMember?.name.toLowerCase().includes(normalizedSearch);
        const matchesStatus = statusFilter === "all" || user.status === statusFilter;
        const matchesRole = roleFilter === "all" || user.roleId === roleFilter;

        return matchesSearch && matchesStatus && matchesRole;
      }),
    [membersByWard, roleFilter, roles, search, statusFilter, usersByWard],
  );

  function resetForm() {
    setEditingId(undefined);
    setForm({
      ...emptyUserForm,
      roleId: roles[0]?.id ?? "",
    });
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      resetForm();
    }
  }

  function openCreateDrawer() {
    resetForm();
    setDrawerOpen(true);
  }

  function openEditDrawer(user: User) {
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
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentUser() {
    if (!currentWard || !form.name.trim() || !form.email.trim() || !form.roleId) return;

    saveUser({
      id: editingId,
      wardId: currentWard.id,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      roleId: form.roleId,
      memberId: form.memberId || undefined,
      status: form.status,
      permissionOverrides: form.permissionOverrides,
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
        accessorKey: "roleId",
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Perfil {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const role = roles.find((item) => item.id === row.original.roleId);

          return (
            <div className="space-y-1">
              <p>{role?.name ?? "Perfil não encontrado"}</p>
              <p className="text-xs text-muted-foreground">{role?.description ?? "Sem descrição"}</p>
            </div>
          );
        },
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
        id: "permissions",
        header: "Permissões adicionais",
        cell: ({ row }) => {
          const visiblePermissions = row.original.permissionOverrides.filter((permission) => overridePermissions.includes(permission));

          return (
            <div className="flex flex-wrap gap-2">
              {visiblePermissions.length ? (
                visiblePermissions.map((permission) => (
                  <Badge key={permission} variant="outline">
                    {permission}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Sem permissões extras</span>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const user = row.original;

          return (
            <div className="flex justify-end gap-2">
              <Button onClick={() => openEditDrawer(user)} size="sm" variant="outline">
                Editar
              </Button>
              <Button onClick={() => toggleUserStatus(user.id)} size="sm" variant="ghost">
                {user.status === "active" ? "Desativar" : "Ativar"}
              </Button>
            </div>
          );
        },
      },
    ],
    [membersByWard, roles, toggleUserStatus],
  );

  return (
    <PermissionGuard permission="users.manage">
      <div>
        <PageHeader
          eyebrow="Usuários e acessos"
          title="RBAC e perfis"
          description="Gestão de contas, perfis e permissões adicionais."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Novo usuário
            </Button>
          }
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Input
                className="lg:max-w-lg"
                placeholder="Buscar por nome, e-mail, telefone, membro ou perfil"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:w-[452px]">
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
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value ?? "all")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filtrar perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os perfis</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DataTable columns={columns} data={filteredUsers} emptyMessage="Nenhum usuário encontrado com os filtros atuais." enableRowSelection />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Perfis e permissões</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roles.map((role) => (
                <div key={role.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{role.name}</p>
                    <Badge variant="outline">{role.permissions.length} permissões</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{role.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{editingId ? "Editar usuário" : "Novo usuário"}</DrawerTitle>
              <DrawerDescription>Cadastro e edição de acesso pelo drawer lateral à direita, no mesmo padrão da tela de membros.</DrawerDescription>
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
                  <Label>Perfil</Label>
                  <Select value={form.roleId} onValueChange={(value) => value && setForm((current) => ({ ...current, roleId: value }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                <div>
                  <Label>Permissões adicionais</Label>
                  <div className="grid gap-2 rounded-lg border bg-secondary/35 p-4 text-sm">
                    {overridePermissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2">
                        <Checkbox
                          checked={form.permissionOverrides.includes(permission)}
                          onCheckedChange={(checked) =>
                            setForm((current) => ({
                              ...current,
                              permissionOverrides:
                                checked === true
                                  ? [...current.permissionOverrides, permission]
                                  : current.permissionOverrides.filter((item) => item !== permission),
                            }))
                          }
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  Cancelar
                </Button>
                <Button disabled={!currentWard || !form.name.trim() || !form.email.trim() || !form.roleId} onClick={saveCurrentUser}>
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

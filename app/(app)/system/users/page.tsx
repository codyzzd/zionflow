"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronsUpDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AccessMatrixEditor } from "@/components/features/access/access-matrix-editor";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { SystemAdminGuard } from "@/components/shared/system-admin-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { ACCESS_MATRIX_AREAS, accessLevelFromPermissions } from "@/lib/access-control";
import { isSystemAdmin } from "@/lib/system-access";
import { isSystemRoleId, SYSTEM_ROLE_IDS } from "@/lib/system-ids";
import { cn } from "@/lib/utils";
import type { PermissionKey, Stake, User, UserStatus, Ward } from "@/types/domain";

type UserForm = {
  wardId: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  memberId: string;
  status: UserStatus;
  permissionOverrides: PermissionKey[];
};

const emptyUserForm: UserForm = {
  wardId: "",
  name: "",
  email: "",
  phone: "",
  roleId: SYSTEM_ROLE_IDS.viewer,
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

function WardCombobox({
  disabled,
  onChange,
  options,
  stakesById,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Ward[];
  stakesById: Map<string, Stake>;
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedWard = useMemo(() => options.find((ward) => ward.id === value), [options, value]);
  const selectedStake = selectedWard ? stakesById.get(selectedWard.stakeId) : undefined;
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 8);

    return options
      .filter((ward) => {
        const stake = stakesById.get(ward.stakeId);

        return [ward.name, ward.city, ward.state, ward.country, stake?.name ?? ""].some((field) =>
          field.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
        );
      })
      .slice(0, 8);
  }, [normalizedQuery, options, stakesById]);

  const displayValue = selectedWard?.name ?? "";
  const selectedLocation = [selectedWard?.city, selectedWard?.state].filter(Boolean).join(" / ");
  const selectedDescription = [selectedStake?.name, selectedLocation].filter(Boolean).join(" - ");

  function selectWard(wardId: string) {
    onChange(wardId);
    setIsOpen(false);
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setQuery(displayValue);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button className="h-auto min-h-9 w-full justify-between" disabled={disabled} variant="outline">
          <span className="min-w-0 text-left">
            <span className={cn("block truncate", !displayValue && "text-muted-foreground")}>
              {displayValue ? `${displayValue}${selectedWard?.archivedAt ? " (arquivada)" : ""}` : "Selecione a ala"}
            </span>
            {selectedDescription ? <span className="block truncate text-xs font-normal text-muted-foreground">{selectedDescription}</span> : null}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar ala" value={query} onValueChange={setQuery} />
          <CommandList>
            {filteredOptions.length ? (
              <CommandGroup heading="Alas">
                {filteredOptions.map((ward) => {
                  const stake = stakesById.get(ward.stakeId);
                  const location = [ward.city, ward.state].filter(Boolean).join(" / ");

                  return (
                    <CommandItem
                      key={ward.id}
                      data-checked={value === ward.id}
                      value={`${ward.name} ${stake?.name ?? ""} ${ward.city} ${ward.state}`}
                      onSelect={() => selectWard(ward.id)}
                    >
                      <span className="flex-1 truncate">{ward.archivedAt ? `${ward.name} (arquivada)` : ward.name}</span>
                      {[stake?.name, location].filter(Boolean).length ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{[stake?.name, location].filter(Boolean).join(" - ")}</span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : normalizedQuery ? (
              <CommandEmpty>Nenhuma ala encontrada.</CommandEmpty>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function SystemUsersPage() {
  const { currentUser, db, saveUser, toggleUserStatus } = useAppContext();
  const { formatDateTime } = useDateFormatter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("all");
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<UserForm>(emptyUserForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccessTemplateId, setSelectedAccessTemplateId] = useState<string>();

  const wardsById = useMemo(() => new Map(db.wards.map((ward) => [ward.id, ward])), [db.wards]);
  const stakesById = useMemo(() => new Map(db.stakes.map((stake) => [stake.id, stake])), [db.stakes]);
  const wardOptions = useMemo(() => db.wards.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.wards]);
  const accessTemplates = useMemo(() => db.roles.filter((role) => !isSystemRoleId(role.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.roles]);
  const memberOptions = useMemo(
    () => db.members.filter((member) => member.wardId === form.wardId && !member.archivedAt).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.members, form.wardId],
  );
  const membersById = useMemo(() => new Map(db.members.map((member) => [member.id, member])), [db.members]);

  const filteredUsers = useMemo(
    () =>
      db.users
        .filter((user) => {
          const linkedMember = user.memberId ? membersById.get(user.memberId) : undefined;
          const ward = wardsById.get(user.wardId);
          const stake = ward ? stakesById.get(ward.stakeId) : undefined;
          const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
          const matchesSearch =
            !normalizedSearch ||
            user.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            user.email.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            user.phone.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            linkedMember?.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            ward?.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
            stake?.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
          const matchesStatus = statusFilter === "all" || user.status === statusFilter;
          const matchesWard = wardFilter === "all" || user.wardId === wardFilter;

          return !user.archivedAt && matchesSearch && matchesStatus && matchesWard;
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [db.users, membersById, search, stakesById, statusFilter, wardFilter, wardsById],
  );

  function resetForm() {
    setEditingId(undefined);
    setForm({ ...emptyUserForm, wardId: wardOptions[0]?.id ?? "" });
    setSelectedAccessTemplateId(undefined);
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      resetForm();
    }
  }

  function openCreateDrawer() {
    setEditingId(undefined);
    setForm({ ...emptyUserForm, wardId: wardOptions[0]?.id ?? "" });
    setSelectedAccessTemplateId(undefined);
    setDrawerOpen(true);
  }

  const openEditDrawer = useCallback((user: User) => {
    setEditingId(user.id);
    setForm({
      wardId: user.wardId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId || SYSTEM_ROLE_IDS.viewer,
      memberId: user.memberId ?? "",
      status: user.status,
      permissionOverrides: user.permissionOverrides,
    });
    setSelectedAccessTemplateId(undefined);
    setDrawerOpen(true);
  }, []);

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function updateWard(wardId: string) {
    setForm((current) => ({
      ...current,
      wardId,
      memberId: db.members.some((member) => member.id === current.memberId && member.wardId === wardId) ? current.memberId : "",
    }));
  }

  function applyAccessTemplate(templateId: string) {
    const template = accessTemplates.find((role) => role.id === templateId);
    if (!template) return;

    setSelectedAccessTemplateId(templateId);
    setForm((current) => ({
      ...current,
      permissionOverrides: template.permissions,
    }));
  }

  function saveCurrentUser() {
    if (!form.wardId || !form.name.trim() || !form.email.trim()) return;

    saveUser({
      id: editingId,
      wardId: form.wardId,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      roleId: form.roleId || SYSTEM_ROLE_IDS.viewer,
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
        meta: { label: "Usuário" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Usuário {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const user = row.original;
          const linkedMember = user.memberId ? membersById.get(user.memberId) : undefined;

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
        id: "ward",
        meta: { label: "Ala" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Ala {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const ward = wardsById.get(row.original.wardId);
          const stake = ward ? stakesById.get(ward.stakeId) : undefined;

          return (
            <div className="space-y-1">
              <p className="font-medium">{ward?.name ?? "Ala não encontrada"}</p>
              <p className="text-xs text-muted-foreground">{stake?.name ?? "Sem estaca"}</p>
            </div>
          );
        },
        sortingFn: (rowA, rowB) =>
          (wardsById.get(rowA.original.wardId)?.name ?? "").localeCompare(wardsById.get(rowB.original.wardId)?.name ?? "", "pt-BR"),
      },
      {
        id: "access",
        meta: { label: "Acessos" },
        header: "Acessos",
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
        meta: { label: "Status" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Status {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <Badge variant={row.original.status === "active" ? "default" : "secondary"}>{statusLabels[row.original.status]}</Badge>,
      },
      {
        accessorKey: "lastAccessAt",
        meta: { label: "Último acesso" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Último acesso {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => (row.original.lastAccessAt ? formatDateTime(row.original.lastAccessAt) : "Nunca"),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const user = row.original;
          const isProtectedSystemUser = isSystemAdmin(user) && user.id !== currentUser?.id;

          if (isProtectedSystemUser) {
            return null;
          }

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
    [currentUser?.id, formatDateTime, membersById, openEditDrawer, stakesById, toggleUserStatus, wardsById],
  );

  return (
    <SystemAdminGuard>
      <div>
        <PageHeader
          eyebrow="Sistema"
          title="Usuários"
          description="Gestão global das contas do sistema, incluindo a ala vinculada a cada usuário."
          actions={
            <Button disabled={!wardOptions.length} onClick={openCreateDrawer} size="lg">
              Novo usuário
            </Button>
          }
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px] lg:items-center">
              <Input
                placeholder="Buscar por nome, e-mail, telefone, membro, ala ou estaca"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={wardFilter} onValueChange={(value) => setWardFilter(value ?? "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filtrar ala" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as alas</SelectItem>
                  {wardOptions.map((ward) => (
                    <SelectItem key={ward.id} value={ward.id}>
                      {ward.archivedAt ? `${ward.name} (arquivada)` : ward.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <DataTable columns={columns} data={filteredUsers} emptyMessage="Nenhum usuário encontrado com os filtros atuais." enableRowSelection />
          </div>
        </div>

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-2xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{editingId ? "Editar usuário" : "Novo usuário"}</DrawerTitle>
              <DrawerDescription>Configure a ala do usuário e a matriz global de acessos.</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div>
                  <Label>Ala</Label>
                  <WardCombobox disabled={!wardOptions.length} onChange={updateWard} options={wardOptions} stakesById={stakesById} value={form.wardId} />
                </div>
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
                    disabled={!form.wardId}
                    value={form.memberId || "__none__"}
                    onValueChange={(value) => setForm((current) => ({ ...current, memberId: !value || value === "__none__" ? "" : value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o membro" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem vínculo</SelectItem>
                      {memberOptions.map((member) => (
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
                <Button disabled={!form.wardId || !form.name.trim() || !form.email.trim()} onClick={saveCurrentUser}>
                  {editingId ? "Salvar alterações" : "Criar usuário"}
                </Button>
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </SystemAdminGuard>
  );
}

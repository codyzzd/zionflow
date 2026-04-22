"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { MemberImportDialog } from "@/components/features/members/member-import-dialog";
import { MemberOrganizationLabel } from "@/components/features/members/member-organization";
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
import { formatDate } from "@/lib/utils";
import { MEMBER_ORGANIZATION_OPTIONS, type Member } from "@/types/domain";

type MemberForm = Omit<Member, "id" | "wardId">;
type DrawerMode = "create" | "view" | "edit";

const emptyMemberForm: MemberForm = {
  name: "",
  birthDate: "",
  organization: "",
  sex: "M",
  sacramentTalkDuration: "5",
  canSpeak: true,
  canPreside: false,
  canConduct: false,
};

const sexLabels: Record<Member["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

const talkDurationLabels: Record<Member["sacramentTalkDuration"], string> = {
  "5": "5 min",
  "10": "10 min",
  "15": "15 min",
};

function memberToForm(member: Member): MemberForm {
  return {
    name: member.name,
    birthDate: member.birthDate,
    organization: member.organization,
    sex: member.sex,
    sacramentTalkDuration: member.sacramentTalkDuration,
    canSpeak: member.canSpeak,
    canPreside: member.canPreside,
    canConduct: member.canConduct,
  };
}

export default function MembersPage() {
  const { currentWard, deleteMembers, hasPermission, membersByWard, saveMember } = useAppContext();
  const canManageMembers = hasPermission("members.manage");

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<MemberForm>(emptyMemberForm);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isReadOnly = drawerMode === "view";

  const filteredMembers = useMemo(
    () =>
      membersByWard.filter((member) => {
        const normalizedSearch = search.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          member.name.toLowerCase().includes(normalizedSearch) ||
          member.organization.toLowerCase().includes(normalizedSearch);

        return matchesSearch;
      }),
    [membersByWard, search],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setForm(emptyMemberForm);
      setSelectedMember(null);
      setDrawerMode("create");
    }
  }

  function openCreateDrawer() {
    setForm(emptyMemberForm);
    setSelectedMember(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openViewDrawer(member: Member) {
    setSelectedMember(member);
    setForm(memberToForm(member));
    setDrawerMode("view");
    setDrawerOpen(true);
  }

  function openEditDrawer(member: Member) {
    setSelectedMember(member);
    setForm(memberToForm(member));
    setDrawerMode("edit");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  function saveCurrentMember() {
    if (!currentWard || !form.name.trim()) return;

    saveMember({
      id: selectedMember?.id,
      wardId: currentWard.id,
      ...form,
      birthDate: form.birthDate.trim(),
      name: form.name.trim(),
      organization: form.organization.trim(),
    });

    closeDrawer();
  }

  const drawerTitle = drawerMode === "create" ? "Novo membro" : drawerMode === "edit" ? "Editar membro" : selectedMember?.name ?? "Membro";
  const drawerDescription =
    drawerMode === "view" ? "Visualização dos dados cadastrados do membro." : "Informe os dados usados no sistema e na ata sacramental.";

  const columns = useMemo<ColumnDef<Member>[]>(
    () => [
      ...(canManageMembers
        ? [
            {
              id: "select",
              header: ({ table }) => (
                <div className="flex items-center justify-center">
                  <Checkbox
                    aria-label="Selecionar todos os membros da página"
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
            } satisfies ColumnDef<Member>,
          ]
        : []),
      {
        accessorKey: "name",
        meta: { label: "Nome" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nome {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const member = row.original;

          return (
            <div className="space-y-1">
              <p className="font-medium">{member.name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{sexLabels[member.sex]}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "organization",
        meta: { label: "Organização" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Organização {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const member = row.original;

          return <MemberOrganizationLabel organization={member.organization} />;
        },
      },
      {
        accessorKey: "birthDate",
        meta: { label: "Nascimento" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nascimento {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const birthDate = row.original.birthDate;

          return <span className="text-sm">{birthDate ? formatDate(birthDate) : "Não informada"}</span>;
        },
      },
      {
        accessorKey: "sacramentTalkDuration",
        meta: { label: "Discurso" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Discurso {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const member = row.original;

          return <Badge variant="secondary">{talkDurationLabels[member.sacramentTalkDuration]}</Badge>;
        },
      },
      {
        id: "sacramentPermissions",
        meta: { label: "Ata sacramental" },
        header: "Ata sacramental",
        cell: ({ row }) => {
          const member = row.original;

          return (
            <div className="flex flex-wrap gap-2">
              {member.canSpeak ? <Badge>Orador</Badge> : null}
              {member.canPreside ? <Badge variant="outline">Preside</Badge> : null}
              {member.canConduct ? <Badge variant="outline">Dirige</Badge> : null}
              {!member.canSpeak && !member.canPreside && !member.canConduct ? (
                <span className="text-xs text-muted-foreground">Sem permissões na ata</span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const member = row.original;

          return (
            <div className="flex justify-end">
              <Button onClick={() => openViewDrawer(member)} size="sm" variant="ghost">
                Visualizar
              </Button>
            </div>
          );
        },
      },
    ],
    [canManageMembers],
  );

  return (
    <PermissionGuard permission="members.view">
      <div>
        <PageHeader
          eyebrow="Membros"
          title="Lista de membros"
          description="Cadastro enxuto com os dados usados pela ata sacramental."
          actions={
            canManageMembers ? (
              <>
                <MemberImportDialog />
                <Button onClick={openCreateDrawer} size="lg">
                  Novo membro
                </Button>
              </>
            ) : null
          }
        />

        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={filteredMembers}
            emptyMessage="Nenhum membro encontrado com os filtros atuais."
            enableColumnVisibility
            enableRowSelection={canManageMembers}
            getRowId={(member) => member.id}
            toolbar={
              <Input
                className="md:max-w-lg"
                placeholder="Buscar por nome ou organização"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            }
            renderSelectedActions={
              canManageMembers
                ? (selectedMembers) => (
                    <Button
                      disabled={!selectedMembers.length}
                      onClick={() => deleteMembers(selectedMembers.map((member) => member.id))}
                      size="sm"
                      variant="destructive"
                    >
                      <Trash2 />
                      Apagar selecionados
                    </Button>
                  )
                : undefined
            }
          />
        </div>

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
            <DrawerContent className="sm:max-w-3xl" direction="right">
              <DrawerHeader className="border-b">
                <DrawerTitle>{drawerTitle}</DrawerTitle>
                <DrawerDescription>{drawerDescription}</DrawerDescription>
              </DrawerHeader>

              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="space-y-4">
                  <div className="section-grid">
                    <div>
                      <Label>Nome completo</Label>
                      <Input
                        disabled={isReadOnly}
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Data de nascimento</Label>
                      <Input
                        disabled={isReadOnly}
                        type="date"
                        value={form.birthDate}
                        onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Sexo</Label>
                      <Select disabled={isReadOnly} value={form.sex} onValueChange={(value) => value && setForm((current) => ({ ...current, sex: value as Member["sex"] }))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o sexo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M">Masculino</SelectItem>
                          <SelectItem value="F">Feminino</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Organização</Label>
                      <Select
                        disabled={isReadOnly}
                        value={form.organization}
                        onValueChange={(value) => value && setForm((current) => ({ ...current, organization: value }))}
                      >
                        <SelectTrigger className="w-full">
                          <MemberOrganizationLabel organization={form.organization} placeholder="Selecione a organização" />
                        </SelectTrigger>
                        <SelectContent>
                          {MEMBER_ORGANIZATION_OPTIONS.map((organization) => (
                            <SelectItem key={organization} value={organization}>
                              <MemberOrganizationLabel organization={organization} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Nível de discurso</Label>
                      <Select
                        disabled={isReadOnly}
                        value={form.sacramentTalkDuration}
                        onValueChange={(value) =>
                          value && setForm((current) => ({ ...current, sacramentTalkDuration: value as Member["sacramentTalkDuration"] }))
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o tempo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 minutos</SelectItem>
                          <SelectItem value="10">10 minutos</SelectItem>
                          <SelectItem value="15">15 minutos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded-lg border bg-secondary/35 p-4 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        disabled={isReadOnly}
                        checked={form.canSpeak}
                        onCheckedChange={(checked) => setForm((current) => ({ ...current, canSpeak: checked === true }))}
                      />
                      Pode ser orador
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        disabled={isReadOnly}
                        checked={form.canPreside}
                        onCheckedChange={(checked) => setForm((current) => ({ ...current, canPreside: checked === true }))}
                      />
                      Pode presidir reunião
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        disabled={isReadOnly}
                        checked={form.canConduct}
                        onCheckedChange={(checked) => setForm((current) => ({ ...current, canConduct: checked === true }))}
                      />
                      Pode dirigir reunião
                    </label>
                  </div>
                </div>
              </div>

              <DrawerFooter className="border-t bg-background">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {isReadOnly && canManageMembers && selectedMember ? (
                    <Button onClick={() => openEditDrawer(selectedMember)}>Editar membro</Button>
                  ) : null}
                  {!isReadOnly ? (
                    <Button disabled={!currentWard || !form.name.trim()} onClick={saveCurrentMember}>
                      {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar membro"}
                    </Button>
                  ) : null}
                </div>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
      </div>
    </PermissionGuard>
  );
}

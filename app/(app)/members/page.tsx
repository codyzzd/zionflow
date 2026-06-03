"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckSquare, Eye, MapPin, Mars, Pause, Play, Skull, SlidersHorizontal, Trash2, Venus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { MemberActivityStatusImportDialog } from "@/components/features/members/member-activity-status-import-dialog";
import { MemberImportDialog } from "@/components/features/members/member-import-dialog";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { DeleteConfirmationDialog, DeleteTableActionButton } from "@/components/ui/delete-confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { parseCoordinateInput } from "@/lib/coordinates";
import { TALK_DURATION_OPTIONS, talkDurationShortLabels } from "@/lib/member-talk-duration";
import { buildMemberTalkHistory, buildMemberTalkOccurrences } from "@/lib/member-talk-history";
import { buildBrazilWhatsAppUrl } from "@/lib/phone";
import { cn, normalizeDateInput } from "@/lib/utils";
import type { Member } from "@/types/domain";

type MemberForm = Omit<Member, "id" | "wardId">;
type DrawerMode = "create" | "view" | "edit";
type DrawerTab = "data" | "talks";
type CoordinatesFilter = "all" | "mapped" | "unmapped";

const emptyMemberForm: MemberForm = {
  name: "",
  phone: "",
  address: "",
  latitude: undefined,
  longitude: undefined,
  churchActivityStatus: "attending",
  birthDate: "",
  organization: "",
  sex: "M",
  sacramentTalkDuration: "not_designable",
  canSpeak: false,
  canPreside: false,
  canConduct: false,
};

const sexLabels: Record<Member["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

const churchActivityStatusLabels: Record<Member["churchActivityStatus"], string> = {
  away: "Afastado",
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

const sexIconMeta: Record<Member["sex"], { className: string; icon: typeof Mars }> = {
  M: { className: "text-blue-500", icon: Mars },
  F: { className: "text-pink-500", icon: Venus },
};

const churchActivityStatusIconMeta: Record<Member["churchActivityStatus"], { className: string; icon: typeof Play }> = {
  away: { className: "text-muted-foreground", icon: Skull },
  attending: { className: "text-emerald-600 dark:text-emerald-400", icon: Play },
  not_attending: { className: "text-red-600 dark:text-red-400", icon: Pause },
};

function MemberSexIcon({ sex }: { sex: Member["sex"] }) {
  const meta = sexIconMeta[sex];
  const Icon = meta.icon;

  return (
    <span aria-label={sexLabels[sex]} className={cn("inline-flex size-5 items-center justify-center", meta.className)} title={sexLabels[sex]}>
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

function MemberActivityStatusIcon({ status }: { status: Member["churchActivityStatus"] }) {
  const meta = churchActivityStatusIconMeta[status];
  const Icon = meta.icon;

  return (
    <span aria-label={churchActivityStatusLabels[status]} className={cn("inline-flex size-5 items-center justify-center", meta.className)} title={churchActivityStatusLabels[status]}>
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

function buildGoogleMapsAddressUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function calculateAge(birthDate: string) {
  const normalizedDate = normalizeDateInput(birthDate);
  if (!normalizedDate) return null;

  const today = new Date();
  const birth = new Date(`${normalizedDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function parseAgeFilterValue(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function matchesAgeRange(age: number | null, minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return true;
  if (age === null) return false;
  if (minimum !== null && age < minimum) return false;
  if (maximum !== null && age > maximum) return false;

  return true;
}

function hasValidCoordinates(member: Member) {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function memberToForm(member: Member): MemberForm {
  return {
    name: member.name,
    phone: member.phone,
    address: member.address,
    latitude: member.latitude,
    longitude: member.longitude,
    churchActivityStatus: member.churchActivityStatus,
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
  const { currentWard, deleteMembers, hasPermission, membersByWard, minutesByWard, saveMember } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageMembers = hasPermission("members.manage");

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<MemberForm>(emptyMemberForm);
  const [memberSelectionActive, setMemberSelectionActive] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("data");
  const [sexFilter, setSexFilter] = useState<"all" | Member["sex"]>("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState<"all" | Member["churchActivityStatus"]>("all");
  const [coordinatesFilter, setCoordinatesFilter] = useState<CoordinatesFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");
  const [talkDurationFilter, setTalkDurationFilter] = useState<"all" | Member["sacramentTalkDuration"]>("all");
  const isReadOnly = drawerMode === "view";
  const talkHistoryByMemberId = useMemo(() => buildMemberTalkHistory(minutesByWard), [minutesByWard]);
  const talkOccurrencesByMemberId = useMemo(() => buildMemberTalkOccurrences(minutesByWard), [minutesByWard]);
  const selectedMemberTalkHistory = selectedMember ? talkHistoryByMemberId.get(selectedMember.id) : undefined;
  const selectedMemberTalkOccurrences = selectedMember ? (talkOccurrencesByMemberId.get(selectedMember.id) ?? []) : [];
  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);

  const filteredMembers = useMemo(
    () =>
      membersByWard.filter((member) => {
        const normalizedSearch = search.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          member.name.toLowerCase().includes(normalizedSearch) ||
          member.address.toLowerCase().includes(normalizedSearch) ||
          member.phone.toLowerCase().includes(normalizedSearch);
        const age = calculateAge(member.birthDate);
        const matchesSex = sexFilter === "all" || member.sex === sexFilter;
        const matchesActivityStatus = activityStatusFilter === "all" || member.churchActivityStatus === activityStatusFilter;
        const memberHasCoordinates = hasValidCoordinates(member);
        const matchesCoordinates =
          coordinatesFilter === "all" || (coordinatesFilter === "mapped" && memberHasCoordinates) || (coordinatesFilter === "unmapped" && !memberHasCoordinates);
        const matchesAge = matchesAgeRange(age, minimumAge, maximumAge);
        const matchesTalkDuration = talkDurationFilter === "all" || member.sacramentTalkDuration === talkDurationFilter;

        return matchesSearch && matchesSex && matchesActivityStatus && matchesCoordinates && matchesAge && matchesTalkDuration;
      }),
    [activityStatusFilter, coordinatesFilter, maximumAge, membersByWard, minimumAge, search, sexFilter, talkDurationFilter],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      setForm(emptyMemberForm);
      setSelectedMember(null);
      setDrawerMode("create");
      setDrawerTab("data");
    }
  }

  function openCreateDrawer() {
    setForm(emptyMemberForm);
    setSelectedMember(null);
    setDrawerMode("create");
    setDrawerTab("data");
    setDrawerOpen(true);
  }

  const openViewDrawer = useCallback((member: Member) => {
    setSelectedMember(member);
    setForm(memberToForm(member));
    setDrawerMode("view");
    setDrawerTab("data");
    setDrawerOpen(true);
  }, []);

  function openEditDrawer(member: Member) {
    setSelectedMember(member);
    setForm(memberToForm(member));
    setDrawerMode("edit");
    setDrawerTab("data");
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
      address: form.address.trim(),
      birthDate: form.birthDate.trim(),
      name: form.name.trim(),
      organization: form.organization.trim(),
      phone: form.phone.trim(),
    });

    closeDrawer();
  }

  function updateSelectedMembers(selectedMembers: Member[], patch: Pick<Partial<MemberForm>, "churchActivityStatus" | "sacramentTalkDuration">) {
    if (!selectedMembers.length) return;

    selectedMembers.forEach((member) => {
      saveMember(
        {
          id: member.id,
          wardId: member.wardId,
          ...memberToForm(member),
          ...patch,
        },
        { silent: true },
      );
    });

    toast.success(selectedMembers.length === 1 ? "Membro atualizado." : `${selectedMembers.length} membros atualizados.`);
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
              <TablePrimaryAction onClick={() => openViewDrawer(member)}>{member.name}</TablePrimaryAction>
              <div className="flex items-center gap-1">
                <MemberSexIcon sex={member.sex} />
                <MemberActivityStatusIcon status={member.churchActivityStatus} />
              </div>
            </div>
          );
        },
      },
      {
        id: "phone",
        accessorFn: (member) => member.phone,
        meta: { label: "Telefone" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Telefone {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const phone = row.original.phone;
          const whatsappUrl = buildBrazilWhatsAppUrl(phone);

          if (whatsappUrl) {
            return (
              <a className="text-sm font-medium text-foreground underline-offset-4 hover:underline" href={whatsappUrl} rel="noreferrer" target="_blank">
                {phone}
              </a>
            );
          }

          return <span className="text-sm">{phone || "Telefone não informado"}</span>;
        },
      },
      {
        accessorKey: "address",
        meta: { label: "Endereço" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Endereço {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const address = row.original.address;

          if (!address) {
            return <span className="block max-w-sm truncate text-sm text-muted-foreground">Endereço não informado</span>;
          }

          return (
            <a
              aria-label={`Abrir ${address} no Google Maps`}
              className="block max-w-sm truncate text-sm text-foreground underline-offset-4 transition-[color,text-decoration-color] hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              href={buildGoogleMapsAddressUrl(address)}
              rel="noreferrer"
              target="_blank"
              title={address}
            >
              {address}
            </a>
          );
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
          const age = calculateAge(birthDate);

          return (
            <div className="space-y-0.5">
              <p className="font-medium tabular-nums">{age === null ? "Idade não informada" : `${age} anos`}</p>
              <p className="text-xs text-muted-foreground">{birthDate ? formatDate(birthDate) : "Nascimento não informado"}</p>
            </div>
          );
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

          return <Badge variant="secondary">{talkDurationShortLabels[member.sacramentTalkDuration]}</Badge>;
        },
      },
      {
        id: "lastTalk",
        accessorFn: (member) => talkHistoryByMemberId.get(member.id)?.lastTalkDate ?? "",
        meta: { label: "Último discurso" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Último discurso {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const talkHistory = talkHistoryByMemberId.get(row.original.id);

          if (!talkHistory) return <span className="text-sm text-muted-foreground">Sem discurso registrado</span>;

          return (
            <div className="space-y-1 text-sm">
              <p className="font-medium">{talkHistory.summary}</p>
              <p className="text-xs text-muted-foreground">{formatDate(talkHistory.lastTalkDate)}</p>
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
            <div className="flex justify-end gap-1">
              <TableActionButton label="Visualizar" onClick={() => openViewDrawer(member)}>
                <Eye />
              </TableActionButton>
              {canManageMembers ? (
                <DeleteTableActionButton
                  description={`Excluir ${member.name}? Essa ação remove o membro do cadastro da ala.`}
                  label="Excluir membro"
                  onConfirm={() => deleteMembers([member.id])}
                />
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManageMembers, deleteMembers, formatDate, openViewDrawer, talkHistoryByMemberId],
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
                <Button asChild size="lg" variant="outline">
                  <Link href="/members/geocoding">
                    <MapPin />
                    Mapear endereços
                  </Link>
                </Button>
                <MemberActivityStatusImportDialog />
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
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
                {canManageMembers ? (
                  <Button
                    aria-label={memberSelectionActive ? "Cancelar seleção de membros" : "Selecionar membros"}
                    onClick={() => setMemberSelectionActive((current) => !current)}
                    size="icon-sm"
                    variant={memberSelectionActive ? "secondary" : "outline"}
                  >
                    {memberSelectionActive ? <X /> : <CheckSquare />}
                  </Button>
                ) : null}
                <SearchInput
                  className="xl:w-80"
                  placeholder="Buscar por nome, telefone ou endereço"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6 xl:flex xl:items-center">
                  <Select value={sexFilter} onValueChange={(value) => setSexFilter(value as "all" | Member["sex"])}>
                    <SelectTrigger className="w-full xl:w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os sexos</SelectItem>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={activityStatusFilter}
                    onValueChange={(value) => setActivityStatusFilter(value as "all" | Member["churchActivityStatus"])}
                  >
                    <SelectTrigger className="w-full xl:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos status</SelectItem>
                      <SelectItem value="attending">{churchActivityStatusLabels.attending}</SelectItem>
                      <SelectItem value="not_attending">{churchActivityStatusLabels.not_attending}</SelectItem>
                      <SelectItem value="away">{churchActivityStatusLabels.away}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={coordinatesFilter} onValueChange={(value) => setCoordinatesFilter(value as CoordinatesFilter)}>
                    <SelectTrigger className="w-full xl:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos mapas</SelectItem>
                      <SelectItem value="mapped">Com coordenadas</SelectItem>
                      <SelectItem value="unmapped">Sem coordenadas</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="w-full xl:w-28"
                    inputMode="numeric"
                    min={0}
                    placeholder="Idade mín."
                    type="number"
                    value={minimumAgeFilter}
                    onChange={(event) => setMinimumAgeFilter(event.target.value)}
                  />
                  <Input
                    className="w-full xl:w-28"
                    inputMode="numeric"
                    min={0}
                    placeholder="Idade máx."
                    type="number"
                    value={maximumAgeFilter}
                    onChange={(event) => setMaximumAgeFilter(event.target.value)}
                  />
                  <Select
                    value={talkDurationFilter}
                    onValueChange={(value) => setTalkDurationFilter(value as "all" | Member["sacramentTalkDuration"])}
                  >
                    <SelectTrigger className="w-full xl:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos discursos</SelectItem>
                      {TALK_DURATION_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.shortLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            }
            renderSelectedActions={
              canManageMembers
                ? (selectedMembers) => (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button disabled={!selectedMembers.length} size="sm" variant="outline">
                              <SlidersHorizontal />
                              Alterar selecionados
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="start" className="w-56">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>{selectedMembers.length} selecionado(s)</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Discurso</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                {TALK_DURATION_OPTIONS.map((option) => (
                                  <DropdownMenuItem key={option.value} onClick={() => updateSelectedMembers(selectedMembers, { sacramentTalkDuration: option.value })}>
                                    {option.shortLabel}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Frequência</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-44">
                                <DropdownMenuItem onClick={() => updateSelectedMembers(selectedMembers, { churchActivityStatus: "attending" })}>
                                  {churchActivityStatusLabels.attending}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateSelectedMembers(selectedMembers, { churchActivityStatus: "not_attending" })}>
                                  {churchActivityStatusLabels.not_attending}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => updateSelectedMembers(selectedMembers, { churchActivityStatus: "away" })}>
                                  {churchActivityStatusLabels.away}
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DeleteConfirmationDialog
                        confirmLabel="Apagar selecionados"
                        description={`Excluir ${selectedMembers.length} membro(s) selecionado(s)? Essa ação remove os membros do cadastro da ala.`}
                        onConfirm={() => deleteMembers(selectedMembers.map((member) => member.id))}
                      >
                        <Button disabled={!selectedMembers.length} size="sm" variant="destructive">
                          <Trash2 />
                          Apagar selecionados
                        </Button>
                      </DeleteConfirmationDialog>
                    </>
                  )
                : undefined
            }
            onSelectionActiveChange={setMemberSelectionActive}
            selectionActive={memberSelectionActive}
            selectionMode="optional"
            showSelectionToggle={false}
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
                  {selectedMember ? (
                    <div className="flex border-b" role="tablist" aria-label="Seções do membro">
                      <Button
                        aria-selected={drawerTab === "data"}
                        className={`rounded-none border-b-2 px-0 sm:px-3 ${drawerTab === "data" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                        onClick={() => setDrawerTab("data")}
                        role="tab"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Dados
                      </Button>
                      <Button
                        aria-selected={drawerTab === "talks"}
                        className={`rounded-none border-b-2 px-0 sm:px-3 ${drawerTab === "talks" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                        onClick={() => setDrawerTab("talks")}
                        role="tab"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Discursos
                      </Button>
                    </div>
                  ) : null}

                  {drawerTab === "data" ? (
                    <>
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
                          <Label>Telefone</Label>
                          <Input
                            disabled={isReadOnly}
                            inputMode="tel"
                            placeholder="ex: (00) 00000-0000"
                            value={form.phone}
                            onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Condição na igreja</Label>
                          <Select
                            disabled={isReadOnly}
                            value={form.churchActivityStatus}
                            onValueChange={(value) => value && setForm((current) => ({ ...current, churchActivityStatus: value as Member["churchActivityStatus"] }))}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="attending">Frequentando</SelectItem>
                              <SelectItem value="not_attending">Não frequentando</SelectItem>
                              <SelectItem value="away">Afastado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Endereço</Label>
                          <Input
                            disabled={isReadOnly}
                            placeholder="ex: Rua, número, bairro, cidade"
                            value={form.address}
                            onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Latitude</Label>
                          <Input
                            disabled={isReadOnly}
                            inputMode="decimal"
                            placeholder="ex: -3.7319"
                            value={form.latitude ?? ""}
                            onChange={(event) => setForm((current) => ({ ...current, latitude: parseCoordinateInput(event.target.value) }))}
                          />
                        </div>
                        <div>
                          <Label>Longitude</Label>
                          <Input
                            disabled={isReadOnly}
                            inputMode="decimal"
                            placeholder="ex: -38.5267"
                            value={form.longitude ?? ""}
                            onChange={(event) => setForm((current) => ({ ...current, longitude: parseCoordinateInput(event.target.value) }))}
                          />
                        </div>
                        <div>
                          <Label>Data de nascimento</Label>
                          <DatePicker
                            disabled={isReadOnly}
                            value={form.birthDate}
                            onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))}
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
                              {TALK_DURATION_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selectedMember ? (
                          <div>
                            <Label>Último discurso</Label>
                            <div className="rounded-md border bg-background px-3 py-2 text-sm">
                              {selectedMemberTalkHistory ? (
                                <>
                                  <p className="font-medium">{selectedMemberTalkHistory.summary}</p>
                                  <p className="text-xs text-muted-foreground">{formatDate(selectedMemberTalkHistory.lastTalkDate)}</p>
                                </>
                              ) : (
                                <p className="text-muted-foreground">Sem discurso registrado</p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                    </>
                  ) : (
                    <div className="rounded-lg border">
                      {selectedMemberTalkOccurrences.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Orador</TableHead>
                              <TableHead>Tema</TableHead>
                              <TableHead className="text-right">Ata</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedMemberTalkOccurrences.map((talk) => (
                              <TableRow key={`${talk.minuteId}-${talk.speakerLabel}`}>
                                <TableCell className="whitespace-nowrap">
                                  <TablePrimaryAction asChild>
                                    <Link href={`/meetings/${talk.minuteId}`}>{formatDate(talk.date)}</Link>
                                  </TablePrimaryAction>
                                </TableCell>
                                <TableCell>{talk.speakerLabel}</TableCell>
                                <TableCell>{talk.theme || "Sem tema"}</TableCell>
                                <TableCell className="text-right">
                                  <TableActionButton asChild label="Visualizar ata">
                                    <Link href={`/meetings/${talk.minuteId}`}>
                                      <Eye />
                                    </Link>
                                  </TableActionButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum discurso vinculado nas atas.</div>
                      )}
                    </div>
                  )}
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

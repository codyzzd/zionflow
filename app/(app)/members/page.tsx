"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { CheckSquare, ChevronDown, Download, Eye, FileUp, MapPin, Pencil, RotateCcw, SlidersHorizontal, Trash2, UserCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { MemberActivityStatusImportDialog } from "@/components/features/members/member-activity-status-import-dialog";
import { MemberExportDialog } from "@/components/features/members/member-export-dialog";
import { MemberImportDialog } from "@/components/features/members/member-import-dialog";
import {
  MemberActivityStatusIcon,
  MemberSexIcon,
  memberActivityStatusLabels as churchActivityStatusLabels,
  memberSexLabels as sexLabels,
} from "@/components/features/members/member-visual-indicators";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { SearchInput } from "@/components/ui/search-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { parseCoordinateInput } from "@/lib/coordinates";
import { resolvePersistedMemberFrequencyStatus } from "@/lib/member-attendance";
import { TALK_DURATION_OPTIONS, talkDurationShortLabels } from "@/lib/member-talk-duration";
import { buildMemberTalkHistory, buildMemberTalkOccurrences } from "@/lib/member-talk-history";
import { MEMBER_PROGRESS_CATEGORY_OPTIONS } from "@/lib/member-progress-category";
import { buildBrazilWhatsAppUrl } from "@/lib/phone";
import { cn, normalizeDateInput } from "@/lib/utils";
import type { Member, MemberAttendanceRecord, MemberNote, MemberProgressCategory } from "@/types/domain";

type MemberForm = Omit<Member, "id" | "wardId">;
type DrawerMode = "create" | "view" | "edit";
type DrawerTab = "data" | "attendance" | "talks" | "progress";
type CoordinatesFilter = "all" | "mapped" | "unmapped";
type MemberStatusFilter = "active" | "archived";
type MemberActionDialog = "activity" | "export" | "import" | null;

const emptyMemberForm: MemberForm = {
  name: "",
  phone: "",
  address: "",
  observation: "",
  latitude: undefined,
  longitude: undefined,
  churchActivityStatus: "attending",
  progressCategory: "disconnected",
  birthDate: "",
  organization: "",
  sex: "M",
  sacramentTalkDuration: "not_designable",
  canSpeak: false,
  canPreside: false,
  canConduct: false,
};

const coordinatesFilterLabels: Record<CoordinatesFilter, string> = {
  all: "Todos mapas",
  mapped: "Com coordenadas",
  unmapped: "Sem coordenadas",
};

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

function toDateTimeLocalValue(value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function memberProgressToForm(note: MemberNote) {
  return {
    occurredAt: toDateTimeLocalValue(new Date(note.occurredAt)),
    text: note.text,
  };
}

function memberToForm(member: Member): MemberForm {
  return {
    name: member.name,
    phone: member.phone,
    address: member.address,
    observation: member.observation,
    latitude: member.latitude,
    longitude: member.longitude,
    churchActivityStatus: member.churchActivityStatus,
    progressCategory: member.progressCategory,
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    addMemberNote,
    allMembersByWard,
    currentUser,
    currentWard,
    deleteArchivedMembers,
    deleteMemberNote,
    deleteMembers,
    hasPermission,
    memberAttendanceRecordsByWard,
    memberNotesByWard,
    minutesByWard,
    ready,
    restoreMembers,
    saveMember,
    updateMemberProgressCategory,
    updateMemberNote,
  } = useAppContext();
  const { formatDate, formatDateTime } = useDateFormatter();
  const canManageMembers = hasPermission("members.manage");
  const canViewProgress = hasPermission("progress.view");
  const canManageProgress = hasPermission("progress.manage");
  const canExportMembers = canManageMembers || hasPermission("exports.run");

  const [search, setSearch] = useState("");
  const [form, setForm] = useState<MemberForm>(emptyMemberForm);
  const [memberSelectionActive, setMemberSelectionActive] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [actionDialog, setActionDialog] = useState<MemberActionDialog>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("data");
  const [progressOccurredAt, setProgressOccurredAt] = useState(() => toDateTimeLocalValue());
  const [progressText, setProgressText] = useState("");
  const [editingProgressId, setEditingProgressId] = useState<string | null>(null);
  const ignoreMemberQueryRef = useRef(false);
  const pendingDrawerTabRef = useRef<DrawerTab | null>(null);
  const [sexFilter, setSexFilter] = useState<"all" | Member["sex"]>("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState<MemberStatusFilter>("active");
  const [activityStatusFilter, setActivityStatusFilter] = useState<"all" | Member["churchActivityStatus"]>("all");
  const [coordinatesFilter, setCoordinatesFilter] = useState<CoordinatesFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");
  const [talkDurationFilter, setTalkDurationFilter] = useState<"all" | Member["sacramentTalkDuration"]>("all");
  const isReadOnly = drawerMode === "view";
  const talkHistoryByMemberId = useMemo(() => buildMemberTalkHistory(minutesByWard), [minutesByWard]);
  const talkOccurrencesByMemberId = useMemo(() => buildMemberTalkOccurrences(minutesByWard), [minutesByWard]);
  const attendanceRecordsByMemberId = useMemo(() => {
    const recordsByMemberId = new Map<string, MemberAttendanceRecord[]>();

    memberAttendanceRecordsByWard.forEach((record) => {
      recordsByMemberId.set(record.memberId, [...(recordsByMemberId.get(record.memberId) ?? []), record]);
    });

    return recordsByMemberId;
  }, [memberAttendanceRecordsByWard]);
  const getMemberFrequencyResolution = useCallback(
    (member: Member) => resolvePersistedMemberFrequencyStatus(member, attendanceRecordsByMemberId.get(member.id) ?? []),
    [attendanceRecordsByMemberId],
  );
  const selectedMemberTalkHistory = selectedMember ? talkHistoryByMemberId.get(selectedMember.id) : undefined;
  const selectedMemberTalkOccurrences = selectedMember ? (talkOccurrencesByMemberId.get(selectedMember.id) ?? []) : [];
  const selectedMemberAttendanceRecords = useMemo(
    () => (selectedMember ? [...(attendanceRecordsByMemberId.get(selectedMember.id) ?? [])].sort((a, b) => b.date.localeCompare(a.date)) : []),
    [attendanceRecordsByMemberId, selectedMember],
  );
  const selectedMemberFrequencyResolution = selectedMember ? getMemberFrequencyResolution(selectedMember) : undefined;
  const selectedMemberProgress = useMemo(
    () =>
      selectedMember
        ? memberNotesByWard
            .filter((note) => note.memberId === selectedMember.id)
            .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        : [],
    [memberNotesByWard, selectedMember],
  );
  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const advancedFilterChips = useMemo(() => {
    const chips: string[] = [];

    if (memberStatusFilter !== "active") chips.push("Cadastro: Arquivados");
    if (sexFilter !== "all") chips.push(`Sexo: ${sexLabels[sexFilter]}`);
    if (activityStatusFilter !== "all") chips.push(`Frequência: ${churchActivityStatusLabels[activityStatusFilter]}`);
    if (coordinatesFilter !== "all") chips.push(coordinatesFilterLabels[coordinatesFilter]);
    if (minimumAge !== null) chips.push(`Idade >= ${minimumAge}`);
    if (maximumAge !== null) chips.push(`Idade <= ${maximumAge}`);
    if (talkDurationFilter !== "all") chips.push(`Discurso: ${talkDurationShortLabels[talkDurationFilter]}`);

    return chips;
  }, [activityStatusFilter, coordinatesFilter, maximumAge, memberStatusFilter, minimumAge, sexFilter, talkDurationFilter]);
  const hasAdvancedFilters = advancedFilterChips.length > 0;

  const resetProgressForm = useCallback(() => {
    setEditingProgressId(null);
    setProgressOccurredAt(toDateTimeLocalValue());
    setProgressText("");
  }, []);

  const replaceMemberQuery = useCallback(
    (memberId?: string, tab?: DrawerTab) => {
      const params = new URLSearchParams(searchParams.toString());

      if (memberId) {
        params.set("member", memberId);
      } else {
        params.delete("member");
      }

      if (memberId && tab === "progress" && canViewProgress) {
        params.set("tab", "progress");
      } else {
        params.delete("tab");
      }

      const query = params.toString();
      router.replace(query ? `/members?${query}` : "/members", { scroll: false });
    },
    [canViewProgress, router, searchParams],
  );

  const filteredMembers = useMemo(
    () =>
      allMembersByWard.filter((member) => {
        const matchesMemberStatus = memberStatusFilter === "archived" ? Boolean(member.archivedAt) : !member.archivedAt;
        const normalizedSearch = search.trim().toLowerCase();
        const matchesSearch =
          !normalizedSearch ||
          member.name.toLowerCase().includes(normalizedSearch) ||
          member.address.toLowerCase().includes(normalizedSearch) ||
          member.phone.toLowerCase().includes(normalizedSearch);
        const age = calculateAge(member.birthDate);
        const matchesSex = sexFilter === "all" || member.sex === sexFilter;
        const frequencyStatus = getMemberFrequencyResolution(member).status;
        const matchesActivityStatus = activityStatusFilter === "all" || frequencyStatus === activityStatusFilter;
        const memberHasCoordinates = hasValidCoordinates(member);
        const matchesCoordinates =
          coordinatesFilter === "all" || (coordinatesFilter === "mapped" && memberHasCoordinates) || (coordinatesFilter === "unmapped" && !memberHasCoordinates);
        const matchesAge = matchesAgeRange(age, minimumAge, maximumAge);
        const matchesTalkDuration = talkDurationFilter === "all" || member.sacramentTalkDuration === talkDurationFilter;

        return matchesMemberStatus && matchesSearch && matchesSex && matchesActivityStatus && matchesCoordinates && matchesAge && matchesTalkDuration;
      }),
    [activityStatusFilter, allMembersByWard, coordinatesFilter, getMemberFrequencyResolution, maximumAge, memberStatusFilter, minimumAge, search, sexFilter, talkDurationFilter],
  );

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      ignoreMemberQueryRef.current = true;
      pendingDrawerTabRef.current = null;
      replaceMemberQuery();
      setForm(emptyMemberForm);
      setSelectedMember(null);
      setDrawerMode("create");
      setDrawerTab("data");
      resetProgressForm();
    }
  }

  function openCreateDrawer() {
    ignoreMemberQueryRef.current = true;
    pendingDrawerTabRef.current = null;
    replaceMemberQuery();
    setForm(emptyMemberForm);
    setSelectedMember(null);
    setDrawerMode("create");
    setDrawerTab("data");
    setDrawerOpen(true);
  }

  const showMemberDrawer = useCallback((member: Member, tab: DrawerTab = "data") => {
    setSelectedMember(member);
    setForm(memberToForm(member));
    setDrawerMode("view");
    setDrawerTab(tab);
    setDrawerOpen(true);
    resetProgressForm();
  }, [resetProgressForm]);

  const openViewDrawer = useCallback((member: Member) => {
    ignoreMemberQueryRef.current = false;
    pendingDrawerTabRef.current = null;
    replaceMemberQuery(member.id);
    showMemberDrawer(member, "data");
  }, [replaceMemberQuery, showMemberDrawer]);

  function selectDrawerTab(tab: DrawerTab) {
    pendingDrawerTabRef.current = tab;
    setDrawerTab(tab);
    if (selectedMember) {
      replaceMemberQuery(selectedMember.id, tab);
    }
  }

  useEffect(() => {
    const requestedMemberId = searchParams.get("member");
    if (!requestedMemberId) {
      ignoreMemberQueryRef.current = false;
      return;
    }
    if (!ready || ignoreMemberQueryRef.current) return;

    const requestedMember = allMembersByWard.find((member) => member.id === requestedMemberId);
    const requestedTab = searchParams.get("tab");
    const pendingDrawerTab = pendingDrawerTabRef.current;

    if (pendingDrawerTab) {
      const queryMatchesPendingTab =
        (pendingDrawerTab === "progress" && requestedTab === "progress") ||
        (pendingDrawerTab !== "progress" && !requestedTab);

      if (queryMatchesPendingTab) {
        pendingDrawerTabRef.current = null;
      }

      return;
    }

    const nextTab: DrawerTab =
      requestedTab === "progress" && canViewProgress
        ? "progress"
        : selectedMember?.id === requestedMemberId && drawerOpen
          ? drawerTab
          : "data";
    if (!requestedMember) {
      replaceMemberQuery();
      return;
    }

    if (requestedTab && requestedTab !== "progress") {
      replaceMemberQuery(requestedMember.id);
      return;
    }

    if (requestedTab === "progress" && !canViewProgress) {
      replaceMemberQuery(requestedMember.id);
      return;
    }

    if (selectedMember?.id !== requestedMember.id || !drawerOpen || drawerTab !== nextTab) {
      const timeoutId = window.setTimeout(() => showMemberDrawer(requestedMember, nextTab), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [allMembersByWard, canViewProgress, drawerOpen, drawerTab, ready, replaceMemberQuery, searchParams, selectedMember?.id, showMemberDrawer]);

  function startEditingProgress(note: MemberNote) {
    if (!canManageProgress) return;

    const nextForm = memberProgressToForm(note);
    setEditingProgressId(note.id);
    setProgressOccurredAt(nextForm.occurredAt);
    setProgressText(nextForm.text);
  }

  function saveProgress() {
    if (!canManageProgress || !selectedMember || !progressText.trim() || !progressOccurredAt) return;

    const input = {
      occurredAt: new Date(progressOccurredAt).toISOString(),
      text: progressText,
    };

    if (editingProgressId) {
      updateMemberNote(editingProgressId, input);
    } else {
      addMemberNote(selectedMember.id, input);
    }

    resetProgressForm();
  }

  function changeProgressCategory(category: MemberProgressCategory) {
    if (!canManageProgress || !selectedMember || selectedMember.progressCategory === category) return;

    updateMemberProgressCategory(selectedMember.id, category);
    setSelectedMember((current) => (current ? { ...current, progressCategory: category } : current));
    setForm((current) => ({ ...current, progressCategory: category }));
  }

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
      observation: form.observation.trim(),
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

  function clearAdvancedFilters() {
    setMemberStatusFilter("active");
    setSexFilter("all");
    setActivityStatusFilter("all");
    setCoordinatesFilter("all");
    setMinimumAgeFilter("");
    setMaximumAgeFilter("");
    setTalkDurationFilter("all");
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
          const frequencyStatus = getMemberFrequencyResolution(member).status;

          return (
            <div className="space-y-1">
              <TablePrimaryAction onClick={() => openViewDrawer(member)}>{member.name}</TablePrimaryAction>
              <div className="flex items-center gap-1">
                <MemberSexIcon sex={member.sex} />
                <MemberActivityStatusIcon status={frequencyStatus} />
                {member.archivedAt ? <Badge variant="secondary">Arquivado</Badge> : null}
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
              {canManageMembers && member.archivedAt ? (
                <TableActionButton label="Restaurar" onClick={() => restoreMembers([member.id])}>
                  <RotateCcw />
                </TableActionButton>
              ) : null}
              {canManageMembers && member.archivedAt ? (
                <DeleteTableActionButton
                  confirmLabel="Apagar definitivamente"
                  description={`Apagar definitivamente ${member.name}? Essa ação remove o membro arquivado e não pode ser desfeita.`}
                  label="Apagar membro"
                  onConfirm={() => deleteArchivedMembers([member.id])}
                />
              ) : null}
              {canManageMembers && !member.archivedAt ? (
                <DeleteTableActionButton
                  description={`Arquivar ${member.name}? O membro sai da lista ativa, mas pode ser restaurado pelo filtro Arquivados.`}
                  label="Arquivar membro"
                  onConfirm={() => deleteMembers([member.id])}
                />
              ) : null}
            </div>
          );
        },
      },
    ],
    [canManageMembers, deleteArchivedMembers, deleteMembers, formatDate, getMemberFrequencyResolution, openViewDrawer, restoreMembers, talkHistoryByMemberId],
  );

  return (
    <PermissionGuard permission="members.view">
      <div>
        <PageHeader
          eyebrow="Membros"
          title="Lista de membros"
          description="Cadastro enxuto com os dados usados pela ata sacramental."
          actions={
            canManageMembers || canExportMembers ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger className={cn(buttonVariants({ size: "lg", variant: "outline" }))} type="button">
                    Ações
                    <ChevronDown />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Membros</DropdownMenuLabel>
                      {canExportMembers ? (
                        <DropdownMenuItem onClick={() => setActionDialog("export")}>
                          <Download />
                          Exportar CSV
                        </DropdownMenuItem>
                      ) : null}
                      {canManageMembers ? (
                        <>
                          <DropdownMenuItem onClick={() => router.push("/members/geocoding")}>
                            <MapPin />
                            Mapear endereços
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setActionDialog("activity")}>
                            <UserCheck />
                            Atualizar frequência
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setActionDialog("import")}>
                            <FileUp />
                            Importar
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {canManageMembers ? (
                  <Button onClick={openCreateDrawer} size="lg">
                    Novo membro
                  </Button>
                ) : null}
              </>
            ) : null
          }
        />
        {canExportMembers ? <MemberExportDialog members={allMembersByWard} onOpenChange={(open) => setActionDialog(open ? "export" : null)} open={actionDialog === "export"} trigger={null} /> : null}
        {canManageMembers ? (
          <>
            <MemberActivityStatusImportDialog onOpenChange={(open) => setActionDialog(open ? "activity" : null)} open={actionDialog === "activity"} trigger={null} />
            <MemberImportDialog onOpenChange={(open) => setActionDialog(open ? "import" : null)} open={actionDialog === "import"} trigger={null} />
          </>
        ) : null}

        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={filteredMembers}
            emptyMessage="Nenhum membro encontrado com os filtros atuais."
            enableColumnVisibility
            enableRowSelection={canManageMembers}
            getRowId={(member) => member.id}
            toolbar={
              <div className="space-y-2">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {canManageMembers ? (
                      <Button
                        aria-label={memberSelectionActive ? "Cancelar seleção de membros" : "Selecionar membros"}
                        onClick={() => setMemberSelectionActive((current) => !current)}
                        size="icon"
                        variant={memberSelectionActive ? "secondary" : "outline"}
                      >
                        {memberSelectionActive ? <X /> : <CheckSquare />}
                      </Button>
                    ) : null}
                    <SearchInput
                      className="min-w-0 flex-1 lg:max-w-sm"
                      placeholder="Buscar por nome, telefone ou endereço"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="default" variant={hasAdvancedFilters ? "secondary" : "outline"}>
                          <SlidersHorizontal />
                          Mais filtros
                          {hasAdvancedFilters ? (
                            <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5 tabular-nums" variant="secondary">
                              {advancedFilterChips.length}
                            </Badge>
                          ) : null}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-xl gap-4 p-4">
                        <PopoverHeader>
                          <PopoverTitle>Filtros avançados</PopoverTitle>
                        </PopoverHeader>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label>Cadastro</Label>
                            <Select value={memberStatusFilter} onValueChange={(value) => setMemberStatusFilter(value as MemberStatusFilter)}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">Ativos</SelectItem>
                                <SelectItem value="archived">Arquivados</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Sexo</Label>
                            <Select value={sexFilter} onValueChange={(value) => setSexFilter(value as "all" | Member["sex"])}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos os sexos</SelectItem>
                                <SelectItem value="M">Masculino</SelectItem>
                                <SelectItem value="F">Feminino</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Frequência</Label>
                            <Select
                              value={activityStatusFilter}
                              onValueChange={(value) => setActivityStatusFilter(value as "all" | Member["churchActivityStatus"])}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos status</SelectItem>
                                <SelectItem value="attending">{churchActivityStatusLabels.attending}</SelectItem>
                                <SelectItem value="not_attending">{churchActivityStatusLabels.not_attending}</SelectItem>
                                <SelectItem value="away">{churchActivityStatusLabels.away}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Mapa</Label>
                            <Select value={coordinatesFilter} onValueChange={(value) => setCoordinatesFilter(value as CoordinatesFilter)}>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Todos mapas</SelectItem>
                                <SelectItem value="mapped">Com coordenadas</SelectItem>
                                <SelectItem value="unmapped">Sem coordenadas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Discurso</Label>
                            <Select
                              value={talkDurationFilter}
                              onValueChange={(value) => setTalkDurationFilter(value as "all" | Member["sacramentTalkDuration"])}
                            >
                              <SelectTrigger className="w-full">
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
                          <div className="space-y-1.5">
                            <Label>Idade mínima</Label>
                            <Input
                              inputMode="numeric"
                              min={0}
                              placeholder="Idade mín."
                              type="number"
                              value={minimumAgeFilter}
                              onChange={(event) => setMinimumAgeFilter(event.target.value)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Idade máxima</Label>
                            <Input
                              inputMode="numeric"
                              min={0}
                              placeholder="Idade máx."
                              type="number"
                              value={maximumAgeFilter}
                              onChange={(event) => setMaximumAgeFilter(event.target.value)}
                            />
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                {hasAdvancedFilters ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {advancedFilterChips.map((chip) => (
                      <Badge className="h-7 rounded-lg px-2.5 text-sm font-normal" key={chip} variant="secondary">
                        {chip}
                      </Badge>
                    ))}
                    <Button className="h-7 px-2 text-sm" onClick={clearAdvancedFilters} size="sm" variant="ghost">
                      Limpar filtros
                    </Button>
                  </div>
                ) : null}
              </div>
            }
            renderSelectedActions={
              canManageMembers
                ? (selectedMembers) => (
                    <>
                      {memberStatusFilter === "archived" ? (
                        <>
                          <Button disabled={!selectedMembers.length} onClick={() => restoreMembers(selectedMembers.map((member) => member.id))} size="sm" variant="outline">
                            <RotateCcw />
                            Restaurar selecionados
                          </Button>
                          <DeleteConfirmationDialog
                            confirmLabel="Apagar definitivamente"
                            description={`Apagar definitivamente ${selectedMembers.length} membro(s) arquivado(s)? Essa ação não pode ser desfeita.`}
                            onConfirm={() => deleteArchivedMembers(selectedMembers.map((member) => member.id))}
                          >
                            <Button disabled={!selectedMembers.length} size="sm" variant="destructive">
                              <Trash2 />
                              Apagar selecionados
                            </Button>
                          </DeleteConfirmationDialog>
                        </>
                      ) : (
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
                            confirmLabel="Arquivar selecionados"
                            description={`Arquivar ${selectedMembers.length} membro(s) selecionado(s)? Eles sairão da lista ativa, mas poderão ser restaurados pelo filtro Arquivados.`}
                            onConfirm={() => deleteMembers(selectedMembers.map((member) => member.id))}
                          >
                            <Button disabled={!selectedMembers.length} size="sm" variant="destructive">
                              <Trash2 />
                              Arquivar selecionados
                            </Button>
                          </DeleteConfirmationDialog>
                        </>
                      )}
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
                        onClick={() => selectDrawerTab("data")}
                        role="tab"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Dados
                      </Button>
                      <Button
                        aria-selected={drawerTab === "attendance"}
                        className={`rounded-none border-b-2 px-0 sm:px-3 ${drawerTab === "attendance" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                        onClick={() => selectDrawerTab("attendance")}
                        role="tab"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Frequência
                      </Button>
                      <Button
                        aria-selected={drawerTab === "talks"}
                        className={`rounded-none border-b-2 px-0 sm:px-3 ${drawerTab === "talks" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                        onClick={() => selectDrawerTab("talks")}
                        role="tab"
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Discursos
                      </Button>
                      {canViewProgress ? (
                        <Button
                          aria-selected={drawerTab === "progress"}
                          className={`rounded-none border-b-2 px-0 sm:px-3 ${drawerTab === "progress" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                          onClick={() => selectDrawerTab("progress")}
                          role="tab"
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Progresso
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {drawerTab === "data" ? (
                    <div className="space-y-6">
                      <section className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Dados pessoais</h3>
                          <p className="text-xs text-muted-foreground">Identificação e informações básicas do membro.</p>
                        </div>
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
                            <DatePicker
                              disabled={isReadOnly}
                              value={form.birthDate}
                              onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))}
                            />
                          </div>
                          <div>
                            <Label>Sexo</Label>
                            <Select
                              disabled={isReadOnly}
                              value={form.sex}
                              onValueChange={(value) => value && setForm((current) => ({ ...current, sex: value as Member["sex"] }))}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione o sexo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="M">Masculino</SelectItem>
                                <SelectItem value="F">Feminino</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </section>

                      <section className="space-y-3 border-t pt-5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Contato e localização</h3>
                          <p className="text-xs text-muted-foreground">Telefone, endereço e dados usados no mapa.</p>
                        </div>
                        <div className="section-grid">
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
                        </div>
                      </section>

                      <section className="space-y-3 border-t pt-5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Participação na igreja</h3>
                          <p className="text-xs text-muted-foreground">Frequência e informações relacionadas a discursos.</p>
                        </div>
                        <div className="section-grid">
                          <div>
                            <Label>Condição na igreja</Label>
                            <Select
                              disabled={isReadOnly}
                              value={form.churchActivityStatus}
                              onValueChange={(value) =>
                                value && setForm((current) => ({ ...current, churchActivityStatus: value as Member["churchActivityStatus"] }))
                              }
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
                          {selectedMemberFrequencyResolution ? (
                            <div>
                              <Label>Frequência cadastrada</Label>
                              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                                <MemberActivityStatusIcon status={selectedMemberFrequencyResolution.status} />
                                <span className="font-medium">{churchActivityStatusLabels[selectedMemberFrequencyResolution.status]}</span>
                                <span className="text-xs text-muted-foreground">
                                  {selectedMemberFrequencyResolution.consideredRecords.length
                                    ? `${selectedMemberFrequencyResolution.consideredRecords.length} domingo(s)`
                                    : "Sem histórico"}
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </section>

                      <section className="space-y-3 border-t pt-5">
                        <div>
                          <h3 className="text-sm font-semibold text-foreground">Observações</h3>
                          <p className="text-xs text-muted-foreground">Informações complementares sobre o membro.</p>
                        </div>
                        <Textarea
                          disabled={isReadOnly}
                          placeholder="Informações adicionais sobre o membro"
                          value={form.observation}
                          onChange={(event) => setForm((current) => ({ ...current, observation: event.target.value }))}
                        />
                      </section>
                    </div>
                  ) : drawerTab === "attendance" ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-md border bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Status</p>
                          <div className="mt-1 flex items-center gap-2 text-sm font-medium">
                            {selectedMemberFrequencyResolution ? <MemberActivityStatusIcon status={selectedMemberFrequencyResolution.status} /> : null}
                            {selectedMemberFrequencyResolution ? churchActivityStatusLabels[selectedMemberFrequencyResolution.status] : "Sem membro"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Domingos considerados</p>
                          <p className="mt-1 text-sm font-medium tabular-nums">{selectedMemberFrequencyResolution?.consideredRecords.length ?? 0}/3</p>
                        </div>
                        <div className="rounded-md border bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground">Registros</p>
                          <p className="mt-1 text-sm font-medium tabular-nums">{selectedMemberAttendanceRecords.length}</p>
                        </div>
                      </div>

                      <div className="rounded-lg border">
                        {selectedMemberAttendanceRecords.length ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Data</TableHead>
                                <TableHead>Presença</TableHead>
                                <TableHead className="text-right">Cálculo</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedMemberAttendanceRecords.slice(0, 24).map((record) => {
                                const isConsidered = selectedMemberFrequencyResolution?.consideredRecords.some((item) => item.id === record.id) ?? false;

                                return (
                                  <TableRow key={record.id}>
                                    <TableCell className="whitespace-nowrap font-medium">{formatDate(record.date)}</TableCell>
                                    <TableCell>
                                      <Badge variant={record.present ? "default" : "secondary"}>{record.present ? "Presente" : "Ausente"}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {isConsidered ? <Badge variant="outline">Últimos 3</Badge> : <span className="text-sm text-muted-foreground">Histórico</span>}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma frequência importada para este membro.</div>
                        )}
                      </div>
                    </div>
                  ) : drawerTab === "talks" ? (
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
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor="member-progress-category">Categoria</Label>
                        <Select
                          disabled={!canManageProgress}
                          value={selectedMember?.progressCategory ?? "disconnected"}
                          onValueChange={(value) => value && changeProgressCategory(value as MemberProgressCategory)}
                        >
                          <SelectTrigger className="w-44" id="member-progress-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MEMBER_PROGRESS_CATEGORY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {canManageProgress ? (
                        <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
                          <div>
                            <h3 className="text-sm font-semibold">{editingProgressId ? "Editar progresso" : "Registrar progresso"}</h3>
                            <p className="text-xs text-muted-foreground">O registro será associado automaticamente ao seu usuário.</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
                            <div className="space-y-2">
                              <Label htmlFor="member-progress-text">Descrição</Label>
                              <Textarea
                                className="min-h-28 resize-y"
                                id="member-progress-text"
                                placeholder="Registre acompanhamentos, orientações ou qualquer evolução relevante."
                                value={progressText}
                                onChange={(event) => setProgressText(event.target.value)}
                              />
                            </div>
                            <div className="flex flex-col gap-3">
                              <div className="space-y-2">
                                <Label htmlFor="member-progress-date">Data e hora</Label>
                                <Input
                                  id="member-progress-date"
                                  type="datetime-local"
                                  value={progressOccurredAt}
                                  onChange={(event) => setProgressOccurredAt(event.target.value)}
                                />
                              </div>
                              <div className="mt-auto flex flex-col gap-2">
                                <Button disabled={!progressOccurredAt || !progressText.trim()} onClick={saveProgress} type="button">
                                  {editingProgressId ? "Salvar alteração" : "Registrar progresso"}
                                </Button>
                                {editingProgressId ? (
                                  <Button onClick={resetProgressForm} type="button" variant="ghost">
                                    Cancelar edição
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </section>
                      ) : null}

                      <section className="space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold">Histórico</h3>
                          <p className="text-xs text-muted-foreground">Registros mais recentes aparecem primeiro.</p>
                        </div>
                        {selectedMemberProgress.length ? (
                          <div className="space-y-3">
                            {selectedMemberProgress.map((note) => {
                              const isAuthor = note.createdBy === currentUser?.id;

                              return (
                                <article className="rounded-lg border bg-background p-4" key={note.id}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium tabular-nums">{formatDateTime(note.occurredAt)}</p>
                                      <p className="text-xs text-muted-foreground">Registrado por {note.createdByName}</p>
                                      {note.updatedAt ? (
                                        <p className="text-xs text-muted-foreground">
                                          Editado em {formatDateTime(note.updatedAt)}
                                          {note.updatedByName ? ` por ${note.updatedByName}` : ""}
                                        </p>
                                      ) : null}
                                    </div>
                                    {isAuthor && canManageProgress ? (
                                      <div className="flex shrink-0 items-center gap-1">
                                        <TableActionButton label="Editar progresso" onClick={() => startEditingProgress(note)}>
                                          <Pencil />
                                        </TableActionButton>
                                        <DeleteTableActionButton
                                          confirmLabel="Excluir progresso"
                                          description="Excluir este registro de progresso? Essa ação não pode ser desfeita."
                                          label="Excluir progresso"
                                          onConfirm={() => {
                                            deleteMemberNote(note.id);
                                            if (editingProgressId === note.id) resetProgressForm();
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{note.text}</p>
                                </article>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                            Nenhum progresso registrado para este membro.
                          </div>
                        )}
                      </section>
                    </div>
                  )}
                </div>
              </div>

              <DrawerFooter className="border-t bg-background">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button onClick={closeDrawer} variant="ghost">
                    {isReadOnly ? "Fechar" : "Cancelar"}
                  </Button>
                  {drawerTab !== "progress" && canManageMembers && selectedMember?.archivedAt ? (
                    <DeleteConfirmationDialog
                      confirmLabel="Apagar definitivamente"
                      description={`Apagar definitivamente ${selectedMember.name}? Essa ação remove o membro arquivado e não pode ser desfeita.`}
                      onConfirm={() => {
                        deleteArchivedMembers([selectedMember.id]);
                        closeDrawer();
                      }}
                    >
                      <Button variant="destructive">
                        <Trash2 />
                        Apagar membro
                      </Button>
                    </DeleteConfirmationDialog>
                  ) : null}
                  {drawerTab !== "progress" && isReadOnly && canManageMembers && selectedMember ? (
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

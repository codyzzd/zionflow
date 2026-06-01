"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Check, ChevronsUpDown, Clock3, Copy, ExternalLink, List, LockKeyhole, Pencil, RefreshCcw, Save, SlidersHorizontal, Table2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { createEmptyMinuteForm } from "@/lib/demo-data";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { acquireMinuteLock, fetchMinuteSnapshot, releaseMinuteLock, renewMinuteLock, saveLockedMinuteSnapshot, type MinuteLockInfo } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { HybridField, SacramentMinute } from "@/types/domain";

type MinuteCreateForm = {
  date: string;
  notes: string;
};

type MeetingsView = "table" | "sheet";
type SheetColumnKey = "date" | "speaker1" | "speaker1Theme" | "speaker2" | "speaker2Theme" | "speaker3" | "speaker3Theme";
type SpeakerFieldKey = "speaker1" | "speaker2" | "speaker3";
type SpeakerThemeFieldKey = "speaker1Theme" | "speaker2Theme" | "speaker3Theme";

type SheetColumn = {
  key: SheetColumnKey;
  label: string;
  className: string;
};

type HybridOption = {
  value: string;
  label: string;
  searchValue?: string;
};

const SHEET_COLUMNS: SheetColumn[] = [
  { key: "date", label: "Data", className: "w-36 min-w-36 xl:w-28 xl:min-w-28" },
  { key: "speaker1", label: "1º orador", className: "w-64 min-w-64 xl:w-32 xl:min-w-32 2xl:w-36 2xl:min-w-36" },
  { key: "speaker1Theme", label: "Tema 1", className: "w-72 min-w-72 xl:w-36 xl:min-w-36 2xl:w-40 2xl:min-w-40" },
  { key: "speaker2", label: "2º orador", className: "w-64 min-w-64 xl:w-32 xl:min-w-32 2xl:w-36 2xl:min-w-36" },
  { key: "speaker2Theme", label: "Tema 2", className: "w-72 min-w-72 xl:w-36 xl:min-w-36 2xl:w-40 2xl:min-w-40" },
  { key: "speaker3", label: "3º orador", className: "w-64 min-w-64 xl:w-32 xl:min-w-32 2xl:w-36 2xl:min-w-36" },
  { key: "speaker3Theme", label: "Tema 3", className: "w-72 min-w-72 xl:w-36 xl:min-w-36 2xl:w-40 2xl:min-w-40" },
];
const SHEET_LOCK_TTL_SECONDS = 120;
const SHEET_LOCK_RENEW_INTERVAL_MS = 45_000;
const SHEET_STATUS_POLL_INTERVAL_MS = 15_000;
const SHEET_ACTIONS_COLUMN_CLASS =
  "sticky right-0 z-10 w-20 min-w-20 border-l bg-card shadow-[-8px_0_16px_rgba(15,23,42,0.08)]";

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function InlineHybridCell({
  disabled,
  manualPlaceholder,
  onSave,
  options,
  value,
}: {
  disabled: boolean;
  manualPlaceholder: string;
  onSave: (value: HybridField) => void;
  options: HybridOption[];
  value: HybridField;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");
  const selectedOption = useMemo(() => options.find((option) => option.value === value.linkedId), [options, value.linkedId]);
  const displayValue = value.mode === "manual" ? value.manualValue ?? "" : selectedOption?.label ?? "";
  const trimmedQuery = draftQuery.trim();
  const normalizedQuery = normalizeSearchValue(trimmedQuery);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options.slice(0, 8);

    return options
      .filter((option) => normalizeSearchValue(`${option.label} ${option.searchValue ?? ""}`).includes(normalizedQuery));
  }, [normalizedQuery, options]);
  const hasExactMatch = useMemo(
    () => options.some((option) => normalizeSearchValue(option.label) === normalizedQuery || normalizeSearchValue(option.searchValue ?? "") === normalizedQuery),
    [normalizedQuery, options],
  );

  function saveManualDraft() {
    if (!trimmedQuery || trimmedQuery === displayValue) return;

    onSave({
      mode: "manual",
      linkedId: "",
      manualValue: trimmedQuery,
    });
  }

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setDraftQuery(displayValue);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button className="h-9 w-full justify-between rounded-none border-0 bg-transparent px-2 font-normal shadow-none hover:bg-muted/60" disabled={disabled} variant="ghost">
          <span className={cn("truncate", !displayValue && "text-muted-foreground")}>{displayValue || manualPlaceholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-45" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={manualPlaceholder}
            value={draftQuery}
            onBlur={saveManualDraft}
            onValueChange={setDraftQuery}
          />
          <CommandList>
            {filteredOptions.length === 0 ? <CommandEmpty>Nenhum cadastro encontrado.</CommandEmpty> : null}

            {filteredOptions.length > 0 ? (
              <CommandGroup heading="Cadastros">
                {filteredOptions.map((option) => {
                  const isSelected = value.mode === "linked" && value.linkedId === option.value;

                  return (
                    <CommandItem
                      key={option.value}
                      data-checked={isSelected}
                      value={`${option.searchValue ?? option.label} ${option.value}`}
                      onSelect={() => {
                        onSave({ mode: "linked", linkedId: option.value, manualValue: "" });
                        setIsOpen(false);
                      }}
                    >
                      <span className="flex-1">{option.label}</span>
                      {isSelected ? <Check className="size-4" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {trimmedQuery && !hasExactMatch ? (
              <>
                <CommandSeparator />
                <CommandGroup heading="Manual">
                  <CommandItem
                    value={`manual ${trimmedQuery}`}
                    onSelect={() => {
                      onSave({ mode: "manual", linkedId: "", manualValue: trimmedQuery });
                      setIsOpen(false);
                    }}
                  >
                    <Clock3 className="size-4 shrink-0" />
                    <span className="flex-1">Temporário - {trimmedQuery}</span>
                  </CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function MinutesPage() {
  const { applyRemoteMinuteUpdate, currentUser, currentWard, hasPermission, membersByWard, minutesByWard, saveMinute, usersByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageMinutes = hasPermission("minutes.manage");

  const buildMinuteTitle = useCallback((date: string) => `Ata sacramental - ${formatDate(date)}`, [formatDate]);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<MeetingsView>("table");
  const [visibleSheetColumns, setVisibleSheetColumns] = useState<Record<SheetColumnKey, boolean>>(() =>
    Object.fromEntries(SHEET_COLUMNS.map((column) => [column.key, true])) as Record<SheetColumnKey, boolean>,
  );
  const [sheetDrafts, setSheetDrafts] = useState<Record<string, SacramentMinute>>({});
  const [sheetLocks, setSheetLocks] = useState<Record<string, MinuteLockInfo>>({});
  const [sheetStale, setSheetStale] = useState<Record<string, SacramentMinute>>({});
  const [busyMinuteIds, setBusyMinuteIds] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const activeSheetMinuteId = Object.keys(sheetDrafts)[0];

  function createEmptyForm(): MinuteCreateForm {
    return {
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    };
  }

  const [form, setForm] = useState<MinuteCreateForm>(() => createEmptyForm());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(intervalId);
  }, []);

  function setMinuteBusy(minuteId: string, busy: boolean) {
    setBusyMinuteIds((current) => {
      const next = new Set(current);
      if (busy) {
        next.add(minuteId);
      } else {
        next.delete(minuteId);
      }
      return next;
    });
  }

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
          const themes = [minute.form.speaker1Theme, minute.form.speaker2Theme, minute.form.speaker3Theme].join(" ");
          const matchesSearch = `${formatDate(minute.date)} ${speakers} ${themes}`.toLowerCase().includes(search.toLowerCase());
          return matchesSearch;
        })
        .sort((a, b) => b.date.localeCompare(a.date)),
    [formatDate, formatSpeakerField, minutesByWard, search],
  );

  useEffect(() => {
    if (view !== "sheet" || !items.length) return;
    let cancelled = false;

    async function refreshSheetState() {
      await Promise.all(
        items.map(async (minute) => {
          try {
            const remoteMinute = await fetchMinuteSnapshot(minute.id);
            if (!remoteMinute || cancelled) return;

            if (!sheetDrafts[minute.id] && remoteMinute.version > minute.version) {
              setSheetStale((current) => ({ ...current, [minute.id]: remoteMinute }));
            }

            setSheetLocks((current) => ({
              ...current,
              [minute.id]: {
                minuteId: remoteMinute.id,
                lockedByUserId: remoteMinute.lockedByUserId,
                lockedAt: remoteMinute.lockedAt,
                lockExpiresAt: remoteMinute.lockExpiresAt,
                version: remoteMinute.version,
                updatedAt: remoteMinute.updatedAt,
              },
            }));
          } catch (error) {
            console.error("Failed to refresh sheet minute state.", error);
          }
        }),
      );
    }

    void refreshSheetState();
    const intervalId = window.setInterval(refreshSheetState, SHEET_STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [items, sheetDrafts, view]);

  useEffect(() => {
    if (!activeSheetMinuteId || !currentUser?.id) return;

    const intervalId = window.setInterval(async () => {
      try {
        const renewed = await renewMinuteLock(activeSheetMinuteId, currentUser.id, SHEET_LOCK_TTL_SECONDS);
        setSheetLocks((current) => ({ ...current, [activeSheetMinuteId]: renewed }));

        if (!renewed.renewed) {
          setSheetDrafts((current) => {
            const next = { ...current };
            delete next[activeSheetMinuteId];
            return next;
          });
          toast.error("Seu tempo de edição expirou. Atualize a linha antes de continuar.");
        }
      } catch (error) {
        console.error("Failed to renew sheet minute lock.", error);
      }
    }, SHEET_LOCK_RENEW_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [activeSheetMinuteId, currentUser?.id]);

  useEffect(() => {
    if (!activeSheetMinuteId || !currentUser?.id) return;

    return () => {
      void releaseMinuteLock(activeSheetMinuteId, currentUser.id).catch((error) => {
        console.error("Failed to release sheet minute lock.", error);
      });
    };
  }, [activeSheetMinuteId, currentUser?.id]);

  const visibleColumns = useMemo(() => SHEET_COLUMNS.filter((column) => visibleSheetColumns[column.key]), [visibleSheetColumns]);
  const speakerMemberOptions = useMemo(
    () =>
      membersByWard
        .filter((member) => member.canSpeak)
        .map((member) => ({
          value: member.id,
          label: `${member.name} • ${member.organization} • ${member.sacramentTalkDuration} min`,
          searchValue: member.name,
        })),
    [membersByWard],
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

  function getSheetLockState(minute: SacramentMinute) {
    const localLock = sheetLocks[minute.id];
    const lockedByUserId = localLock?.lockedByUserId ?? minute.lockedByUserId;
    const lockExpiresAt = localLock?.lockExpiresAt ?? minute.lockExpiresAt;
    const lockExpiresAtTime = lockExpiresAt ? Date.parse(lockExpiresAt) : 0;
    const lockActive = Boolean(lockedByUserId && Number.isFinite(lockExpiresAtTime) && lockExpiresAtTime > nowMs);

    if (sheetDrafts[minute.id] && lockActive && lockedByUserId === currentUser?.id) return "locked_by_me";
    if (lockActive && lockedByUserId && lockedByUserId !== currentUser?.id) return "locked_by_other";
    if (sheetStale[minute.id]) return "stale";
    return "free";
  }

  async function beginSheetEdit(minute: SacramentMinute) {
    if (!canManageMinutes || !currentUser?.id || busyMinuteIds.has(minute.id)) return false;
    if (sheetDrafts[minute.id]) return true;
    if (activeSheetMinuteId && activeSheetMinuteId !== minute.id) {
      toast.error("Salve ou cancele a linha em edição antes de editar outra ata.");
      return false;
    }

    setMinuteBusy(minute.id, true);
    try {
      const lock = await acquireMinuteLock(minute.id, currentUser.id, SHEET_LOCK_TTL_SECONDS);
      setSheetLocks((current) => ({ ...current, [minute.id]: lock }));

      if (!lock.acquired) {
        toast.error(`Não foi possível editar. Esta ata está sendo editada por ${lock.lockedByName ?? "outro usuário"}.`);
        return false;
      }

      const latestMinute = await fetchMinuteSnapshot(minute.id);
      setSheetDrafts((current) => ({ ...current, [minute.id]: latestMinute ?? minute }));
      setSheetLocks((current) => ({
        ...current,
        [minute.id]: {
          ...lock,
          lockedByUserId: latestMinute?.lockedByUserId ?? lock.lockedByUserId ?? currentUser.id,
          lockedByName: lock.lockedByName ?? currentUser.name,
          lockedAt: latestMinute?.lockedAt ?? lock.lockedAt,
          lockExpiresAt: latestMinute?.lockExpiresAt ?? lock.lockExpiresAt,
          version: latestMinute?.version ?? lock.version,
          updatedAt: latestMinute?.updatedAt ?? lock.updatedAt,
        },
      }));
      return true;
    } finally {
      setMinuteBusy(minute.id, false);
    }
  }

  function patchSheetDraft(minute: SacramentMinute, patch: Partial<Pick<SacramentMinute, "date" | "form">>) {
    setSheetDrafts((current) => {
      const draft = current[minute.id] ?? minute;
      const nextDate = patch.date ?? draft.date;

      return {
        ...current,
        [minute.id]: {
          ...draft,
          date: nextDate,
          title: buildMinuteTitle(nextDate),
          form: patch.form ?? draft.form,
        },
      };
    });
  }

  async function cancelSheetEdit(minute: SacramentMinute) {
    if (currentUser?.id) {
      await releaseMinuteLock(minute.id, currentUser.id).catch(() => false);
    }
    setSheetDrafts((current) => {
      const next = { ...current };
      delete next[minute.id];
      return next;
    });
    setSheetLocks((current) => {
      const next = { ...current };
      delete next[minute.id];
      return next;
    });
  }

  async function saveSheetDraft(minute: SacramentMinute) {
    const draft = sheetDrafts[minute.id];
    const lock = sheetLocks[minute.id];
    if (!draft || !currentUser?.id || !lock?.version) return;

    setMinuteBusy(minute.id, true);
    try {
      const result = await saveLockedMinuteSnapshot(draft, currentUser.id, lock.version);
      if (!result.saved || !result.minute) {
        if (result.reason === "version_conflict" && result.minute) {
          setSheetStale((current) => ({ ...current, [minute.id]: result.minute! }));
        }
        toast.error(result.reason === "version_conflict" ? "Nova versão disponível. Atualize a linha antes de continuar." : "Seu tempo de edição expirou. Atualize a linha antes de continuar.");
        return;
      }

      applyRemoteMinuteUpdate(result.minute);
      await cancelSheetEdit(minute);
    } finally {
      setMinuteBusy(minute.id, false);
    }
  }

  function updateSheetDate(minute: SacramentMinute, value: string) {
    if (!value || value === minute.date) return;
    patchSheetDraft(minute, { date: value });
  }

  function updateSheetSpeaker(minute: SacramentMinute, key: SpeakerFieldKey, value: HybridField) {
    const draft = sheetDrafts[minute.id] ?? minute;
    const currentValue = draft.form[key];
    if (currentValue.mode === value.mode && currentValue.linkedId === value.linkedId && currentValue.manualValue === value.manualValue) return;

    patchSheetDraft(minute, {
      form: {
        ...draft.form,
        [key]: value,
      },
    });
  }

  function updateSheetTheme(minute: SacramentMinute, key: SpeakerThemeFieldKey, value: string) {
    const nextValue = value.trim();
    const draft = sheetDrafts[minute.id] ?? minute;
    if (nextValue === draft.form[key]) return;

    patchSheetDraft(minute, {
      form: {
        ...draft.form,
        [key]: nextValue,
      },
    });
  }

  function renderSheetCell(minute: SacramentMinute, column: SheetColumn) {
    const lockState = getSheetLockState(minute);
    const editable = canManageMinutes && lockState === "locked_by_me";
    const draft = sheetDrafts[minute.id] ?? minute;

    if (column.key === "date") {
      if (!editable) {
        return (
          <div
            aria-label={`Data da ata ${formatDate(minute.date)}`}
            className="flex h-9 min-w-0 items-center px-2 text-sm tabular-nums"
          >
            <span className="truncate">{formatDate(draft.date)}</span>
          </div>
        );
      }

      return (
        <Input
          aria-label={`Data da ata ${formatDate(minute.date)}`}
          className="h-9 min-w-0 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1 disabled:opacity-100"
          disabled={!editable}
          type="date"
          value={draft.date}
          onChange={(event) => updateSheetDate(minute, event.currentTarget.value)}
          key={`${minute.id}-${draft.date}`}
        />
      );
    }

    if (column.key === "speaker1" || column.key === "speaker2" || column.key === "speaker3") {
      const speakerKey = column.key;

      return (
        <InlineHybridCell
          disabled={!editable}
          manualPlaceholder={column.label}
          options={speakerMemberOptions}
          value={draft.form[speakerKey]}
          onSave={(value) => updateSheetSpeaker(minute, speakerKey, value)}
        />
      );
    }

    const themeKey = column.key as SpeakerThemeFieldKey;

    return (
      <Input
        aria-label={`${column.label} da ata ${formatDate(minute.date)}`}
        className="h-9 min-w-0 truncate rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1 disabled:opacity-100"
        disabled={!editable}
        value={draft.form[themeKey]}
        onChange={(event) => updateSheetTheme(minute, themeKey, event.currentTarget.value)}
        key={`${minute.id}-${themeKey}`}
      />
    );
  }

  function renderSheetRowActions(minute: SacramentMinute) {
    const lockState = getSheetLockState(minute);
    const lock = sheetLocks[minute.id];
    const lockOwnerName = lock?.lockedByName ?? usersByWard.find((user) => user.id === (lock?.lockedByUserId ?? minute.lockedByUserId))?.name ?? "outro usuário";
    const isBusy = busyMinuteIds.has(minute.id);

    if (lockState === "locked_by_me") {
      return (
        <div className="flex items-center justify-end gap-1 px-2">
          <TableActionButton disabled={isBusy} label="Cancelar edição" onClick={() => void cancelSheetEdit(minute)} size="icon-xs">
            <X />
          </TableActionButton>
          <TableActionButton disabled={isBusy} label="Salvar linha" onClick={() => void saveSheetDraft(minute)} size="icon-xs" variant="default">
            <Save />
          </TableActionButton>
        </div>
      );
    }

    if (lockState === "locked_by_other") {
      return (
        <div className="flex items-center justify-end px-2 text-muted-foreground" title={`Em edição por ${lockOwnerName}`}>
          <LockKeyhole className="size-4" />
        </div>
      );
    }

    if (lockState === "stale") {
      return (
        <div className="flex items-center justify-end px-2">
          <TableActionButton
            disabled={isBusy}
            label="Atualizar linha"
            onClick={() => {
              const staleMinute = sheetStale[minute.id];
              if (!staleMinute) return;
              applyRemoteMinuteUpdate(staleMinute);
              setSheetStale((current) => {
                const next = { ...current };
                delete next[minute.id];
                return next;
              });
            }}
            size="icon-xs"
            variant="outline"
          >
            <RefreshCcw />
          </TableActionButton>
        </div>
      );
    }

    return (
      <div className="flex justify-end px-2">
        <TableActionButton disabled={!canManageMinutes || isBusy} label="Editar linha" onClick={() => void beginSheetEdit(minute)} size="icon-xs" variant="outline">
          <Pencil />
        </TableActionButton>
      </div>
    );
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
        cell: ({ row }) => (
          <TablePrimaryAction asChild>
            <Link href={`/meetings/${row.original.id}`}>{formatDate(row.original.date)}</Link>
          </TablePrimaryAction>
        ),
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
            <div className="flex justify-end gap-1">
              <TableActionButton asChild label="Abrir ata">
                <Link href={`/meetings/${minute.id}`}>
                  <ExternalLink />
                </Link>
              </TableActionButton>
              <TableActionButton
                label="Duplicar ata"
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
                <Copy />
              </TableActionButton>
            </div>
          );
        },
      },
    ],
    [buildMinuteTitle, canManageMinutes, currentWard, formatDate, formatSpeakerField, saveMinute],
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <Input
              className="md:max-w-lg"
              placeholder="Buscar por data, oradores ou temas"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border bg-card p-1">
                <Button className="h-8" onClick={() => setView("table")} size="sm" variant={view === "table" ? "secondary" : "ghost"}>
                  <List />
                  Tabela
                </Button>
                <Button className="h-8" onClick={() => setView("sheet")} size="sm" variant={view === "sheet" ? "secondary" : "ghost"}>
                  <Table2 />
                  Planilha
                </Button>
              </div>
              {view === "sheet" ? (
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
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Exibir colunas</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {SHEET_COLUMNS.map((column) => (
                        <DropdownMenuCheckboxItem
                          checked={visibleSheetColumns[column.key]}
                          closeOnClick={false}
                          key={column.key}
                          onCheckedChange={(value) =>
                            setVisibleSheetColumns((current) => ({
                              ...current,
                              [column.key]: Boolean(value),
                            }))
                          }
                        >
                          {column.label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {view === "table" ? (
            <DataTable
              columns={columns}
              data={items}
              emptyMessage="Nenhuma ata encontrada com os filtros atuais."
              enableRowSelection={canManageMinutes}
              getRowId={(minute) => minute.id}
            />
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full table-fixed border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {visibleColumns.map((column) => (
                        <th className={cn("border-r px-2 py-2 text-left font-medium text-muted-foreground last:border-r-0", column.className)} key={column.key}>
                          {column.label}
                        </th>
                      ))}
                      <th className={cn(SHEET_ACTIONS_COLUMN_CLASS, "bg-muted px-2 py-2 text-right font-medium text-muted-foreground")}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length ? (
                      items.map((minute) => {
                        const lockState = getSheetLockState(minute);

                        return (
                          <tr
                            className={cn(
                              "border-b last:border-b-0",
                              lockState === "locked_by_other" && "bg-muted/35 text-muted-foreground",
                              lockState === "locked_by_me" && "bg-emerald-50/40 dark:bg-emerald-950/10",
                              lockState === "stale" && "bg-amber-50/40 dark:bg-amber-950/10",
                            )}
                            key={minute.id}
                          >
                            {visibleColumns.map((column) => (
                              <td className={cn("border-r p-0 align-middle last:border-r-0", column.className)} key={column.key}>
                                {renderSheetCell(minute, column)}
                              </td>
                            ))}
                            <td className={cn(SHEET_ACTIONS_COLUMN_CLASS, "p-0 align-middle")}>{renderSheetRowActions(minute)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td className="h-24 px-4 text-center text-muted-foreground" colSpan={Math.max(visibleColumns.length + 1, 1)}>
                          Nenhuma ata encontrada com os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">{items.length} linha(s).</p>
            </div>
          )}
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
                      <DatePicker value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
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

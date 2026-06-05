"use client";

import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TALK_DURATION_OPTIONS, talkDurationLabels } from "@/lib/member-talk-duration";
import { normalizeBrazilPhoneForWhatsApp } from "@/lib/phone";
import { normalizeDateInput } from "@/lib/utils";
import type { Member } from "@/types/domain";

type ArchiveStatus = "active" | "archived";
type CoordinatesStatus = "mapped" | "unmapped";
type MemberExportFilters = {
  activityStatuses: Member["churchActivityStatus"][];
  archiveStatuses: ArchiveStatus[];
  coordinates: CoordinatesStatus[];
  maximumAge: string;
  minimumAge: string;
  search: string;
  sexes: Member["sex"][];
  talkDurations: Member["sacramentTalkDuration"][];
};
type MemberExportDialogProps = {
  members: Member[];
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger?: ReactNode;
};
type ExportColumnKey =
  | "name"
  | "phone"
  | "address"
  | "birthDate"
  | "age"
  | "sex"
  | "churchActivityStatus"
  | "archiveStatus"
  | "organization"
  | "sacramentTalkDuration"
  | "canSpeak"
  | "canPreside"
  | "canConduct"
  | "latitude"
  | "longitude";

const churchActivityStatusLabels: Record<Member["churchActivityStatus"], string> = {
  away: "Afastado",
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

const sexLabels: Record<Member["sex"], string> = {
  F: "Feminino",
  M: "Masculino",
};

const archiveStatusLabels: Record<ArchiveStatus, string> = {
  active: "Ativos",
  archived: "Arquivados",
};

const coordinatesStatusLabels: Record<CoordinatesStatus, string> = {
  mapped: "Com coordenadas",
  unmapped: "Sem coordenadas",
};

const exportColumns: Array<{ key: ExportColumnKey; label: string; defaultSelected?: boolean }> = [
  { key: "name", label: "Nome", defaultSelected: true },
  { key: "phone", label: "Telefone", defaultSelected: true },
  { key: "churchActivityStatus", label: "Frequência", defaultSelected: true },
  { key: "address", label: "Endereço", defaultSelected: true },
  { key: "birthDate", label: "Nascimento", defaultSelected: true },
  { key: "age", label: "Idade", defaultSelected: true },
  { key: "sex", label: "Sexo", defaultSelected: true },
  { key: "archiveStatus", label: "Cadastro" },
  { key: "organization", label: "Organização" },
  { key: "sacramentTalkDuration", label: "Discurso" },
  { key: "canSpeak", label: "Pode discursar" },
  { key: "canPreside", label: "Pode presidir" },
  { key: "canConduct", label: "Pode dirigir" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
];

const defaultSelectedColumns = exportColumns.filter((column) => column.defaultSelected).map((column) => column.key);
const defaultFilters: MemberExportFilters = {
  activityStatuses: ["attending", "not_attending", "away"],
  archiveStatuses: ["active"],
  coordinates: ["mapped", "unmapped"],
  maximumAge: "",
  minimumAge: "",
  search: "",
  sexes: ["M", "F"],
  talkDurations: TALK_DURATION_OPTIONS.map((option) => option.value),
};

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

function hasValidCoordinates(member: Member) {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function buildCsv(rows: Member[], columns: ExportColumnKey[], normalizePhones: boolean) {
  const header = columns.map((columnKey) => exportColumns.find((column) => column.key === columnKey)?.label ?? columnKey);
  const body = rows.map((member) =>
    columns.map((columnKey) => {
      const age = calculateAge(member.birthDate);

      switch (columnKey) {
        case "address":
          return csvCell(member.address);
        case "age":
          return csvCell(age);
        case "archiveStatus":
          return csvCell(member.archivedAt ? "Arquivado" : "Ativo");
        case "birthDate":
          return csvCell(normalizeDateInput(member.birthDate) ?? member.birthDate);
        case "canConduct":
          return csvCell(member.canConduct ? "Sim" : "Não");
        case "canPreside":
          return csvCell(member.canPreside ? "Sim" : "Não");
        case "canSpeak":
          return csvCell(member.canSpeak ? "Sim" : "Não");
        case "churchActivityStatus":
          return csvCell(churchActivityStatusLabels[member.churchActivityStatus]);
        case "latitude":
          return csvCell(member.latitude);
        case "longitude":
          return csvCell(member.longitude);
        case "name":
          return csvCell(member.name);
        case "organization":
          return csvCell(member.organization);
        case "phone":
          return csvCell(normalizePhones ? (normalizeBrazilPhoneForWhatsApp(member.phone) ?? member.phone) : member.phone);
        case "sacramentTalkDuration":
          return csvCell(talkDurationLabels[member.sacramentTalkDuration]);
        case "sex":
          return csvCell(sexLabels[member.sex]);
        default:
          return csvCell("");
      }
    }),
  );

  return [header.map(csvCell), ...body].map((row) => row.join(";")).join("\r\n");
}

function downloadCsv(csv: string) {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = `membros-${datePart}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toggleValue<T extends string>(values: T[], value: T, checked: boolean) {
  return checked ? [...values, value] : values.filter((current) => current !== value);
}

function CheckboxOption({ checked, label, onCheckedChange }: { checked: boolean; label: string; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted/60">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      {label}
    </label>
  );
}

export function MemberExportDialog({ members, onOpenChange, open: controlledOpen, trigger }: MemberExportDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [filters, setFilters] = useState<MemberExportFilters>(defaultFilters);
  const [selectedColumns, setSelectedColumns] = useState<ExportColumnKey[]>(defaultSelectedColumns);
  const [normalizePhones, setNormalizePhones] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;

  function setDialogOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  const minimumAge = useMemo(() => parseAgeFilterValue(filters.minimumAge), [filters.minimumAge]);
  const maximumAge = useMemo(() => parseAgeFilterValue(filters.maximumAge), [filters.maximumAge]);
  const exportMembers = useMemo(
    () =>
      members.filter((member) => {
        const normalizedSearch = filters.search.trim().toLowerCase();
        const age = calculateAge(member.birthDate);
        const memberHasCoordinates = hasValidCoordinates(member);
        const memberArchiveStatus: ArchiveStatus = member.archivedAt ? "archived" : "active";
        const memberCoordinatesStatus: CoordinatesStatus = memberHasCoordinates ? "mapped" : "unmapped";

        const matchesSearch =
          !normalizedSearch ||
          member.name.toLowerCase().includes(normalizedSearch) ||
          member.address.toLowerCase().includes(normalizedSearch) ||
          member.phone.toLowerCase().includes(normalizedSearch);
        const matchesArchiveStatus = filters.archiveStatuses.includes(memberArchiveStatus);
        const matchesActivityStatus = filters.activityStatuses.includes(member.churchActivityStatus);
        const matchesSex = filters.sexes.includes(member.sex);
        const matchesCoordinates = filters.coordinates.includes(memberCoordinatesStatus);
        const matchesMinimumAge = minimumAge === null || (age !== null && age >= minimumAge);
        const matchesMaximumAge = maximumAge === null || (age !== null && age <= maximumAge);
        const matchesTalkDuration = filters.talkDurations.includes(member.sacramentTalkDuration);

        return matchesSearch && matchesArchiveStatus && matchesActivityStatus && matchesSex && matchesCoordinates && matchesMinimumAge && matchesMaximumAge && matchesTalkDuration;
      }),
    [filters, maximumAge, members, minimumAge],
  );

  function resetDialog() {
    setFilters(defaultFilters);
    setNormalizePhones(false);
    setSelectedColumns(defaultSelectedColumns);
  }

  function handleOpenChange(nextOpen: boolean) {
    setDialogOpen(nextOpen);

    if (nextOpen) {
      resetDialog();
    }
  }

  function toggleColumn(columnKey: ExportColumnKey, checked: boolean) {
    setSelectedColumns((current) => toggleValue(current, columnKey, checked));
  }

  function exportCsv() {
    if (!selectedColumns.length) {
      toast.error("Selecione pelo menos uma coluna.");
      return;
    }

    downloadCsv(buildCsv(exportMembers, selectedColumns, normalizePhones));
    toast.success(`${exportMembers.length} membro(s) exportado(s).`);
    setDialogOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="lg" variant="outline">
              <Download />
              Exportar CSV
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Exportar membros</DialogTitle>
          <DialogDescription>Escolha as colunas, filtros e formato dos telefones antes de gerar o CSV.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Cadastro</Label>
              <div className="space-y-1">
                {(["active", "archived"] as ArchiveStatus[]).map((status) => (
                  <CheckboxOption
                    checked={filters.archiveStatuses.includes(status)}
                    key={status}
                    label={archiveStatusLabels[status]}
                    onCheckedChange={(checked) => setFilters((current) => ({ ...current, archiveStatuses: toggleValue(current.archiveStatuses, status, checked) }))}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Frequência</Label>
              <div className="space-y-1">
                {(["attending", "not_attending", "away"] as Member["churchActivityStatus"][]).map((status) => (
                  <CheckboxOption
                    checked={filters.activityStatuses.includes(status)}
                    key={status}
                    label={churchActivityStatusLabels[status]}
                    onCheckedChange={(checked) =>
                      setFilters((current) => ({ ...current, activityStatuses: toggleValue(current.activityStatuses, status, checked) }))
                    }
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Sexo</Label>
              <div className="space-y-1">
                {(["M", "F"] as Member["sex"][]).map((sex) => (
                  <CheckboxOption
                    checked={filters.sexes.includes(sex)}
                    key={sex}
                    label={sexLabels[sex]}
                    onCheckedChange={(checked) => setFilters((current) => ({ ...current, sexes: toggleValue(current.sexes, sex, checked) }))}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3">
              <Label>Mapa</Label>
              <div className="space-y-1">
                {(["mapped", "unmapped"] as CoordinatesStatus[]).map((status) => (
                  <CheckboxOption
                    checked={filters.coordinates.includes(status)}
                    key={status}
                    label={coordinatesStatusLabels[status]}
                    onCheckedChange={(checked) => setFilters((current) => ({ ...current, coordinates: toggleValue(current.coordinates, status, checked) }))}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
              <Label>Discurso</Label>
              <div className="grid gap-1 sm:grid-cols-2">
                {TALK_DURATION_OPTIONS.map((option) => (
                  <CheckboxOption
                    checked={filters.talkDurations.includes(option.value)}
                    key={option.value}
                    label={option.shortLabel}
                    onCheckedChange={(checked) =>
                      setFilters((current) => ({ ...current, talkDurations: toggleValue(current.talkDurations, option.value, checked) }))
                    }
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Idade mínima</Label>
              <Input
                inputMode="numeric"
                min={0}
                placeholder="ex: 18"
                type="number"
                value={filters.minimumAge}
                onChange={(event) => setFilters((current) => ({ ...current, minimumAge: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Idade máxima</Label>
              <Input
                inputMode="numeric"
                min={0}
                placeholder="ex: 30"
                type="number"
                value={filters.maximumAge}
                onChange={(event) => setFilters((current) => ({ ...current, maximumAge: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Busca</Label>
              <Input
                placeholder="Nome, telefone ou endereço"
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/40 p-3">
            <CheckboxOption checked={normalizePhones} label="Normalizar telefones para 55DDDnumero quando possível" onCheckedChange={setNormalizePhones} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Colunas</Label>
              <p className="text-xs text-muted-foreground tabular-nums">{selectedColumns.length} selecionada(s)</p>
            </div>
            <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-3">
              {exportColumns.map((column) => (
                <CheckboxOption
                  checked={selectedColumns.includes(column.key)}
                  key={column.key}
                  label={column.label}
                  onCheckedChange={(checked) => toggleColumn(column.key, checked)}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => setDialogOpen(false)} variant="ghost">
            Cancelar
          </Button>
          <Button disabled={!exportMembers.length || !selectedColumns.length} onClick={exportCsv}>
            <Download />
            Exportar {exportMembers.length} membro(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

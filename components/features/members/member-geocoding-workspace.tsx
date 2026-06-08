"use client";

import { Check, Loader2, Play, Save, Search, SkipForward, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCoordinateInput, sanitizeCoordinateInput } from "@/lib/coordinates";
import { TALK_DURATION_OPTIONS } from "@/lib/member-talk-duration";
import { cn, normalizeDateInput, nowIso } from "@/lib/utils";
import type { Member } from "@/types/domain";

type GeocodeResult = {
  displayName: string;
  importance?: number;
  latitude: number;
  longitude: number;
  osmClass?: string;
  type?: string;
};

type MemberGeocodeStatus = "idle" | "loading" | "found" | "empty" | "error" | "saved" | "skipped";
type MemberGeocodeState = {
  error?: string;
  result?: GeocodeResult;
  skipped?: boolean;
  status: MemberGeocodeStatus;
};
type AddressSaveStatus = "idle" | "saving" | "saved";
type CoordinateDraft = {
  latitude: string;
  longitude: string;
};
type CoordinateSaveStatus = "idle" | "saving" | "saved";
type GeocodingFilter = "pending" | "not_attempted" | "no_result" | "error" | "skipped";
type RunGeocodeOptions = {
  persistFound?: boolean;
};

const processedStatuses = new Set<MemberGeocodeStatus>(["found", "empty", "error", "saved", "skipped"]);
const geocodingFilterLabels: Record<GeocodingFilter, string> = {
  pending: "Todos pendentes",
  not_attempted: "Nunca tentados",
  no_result: "Sem resultado",
  error: "Erro",
  skipped: "Pulados",
};
function isMappedMember(member: Member) {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function memberGeocodingStatus(member: Member) {
  return member.geocodingStatus ?? "not_attempted";
}

function getMemberDisplayState(member: Member, statesByMemberId: Record<string, MemberGeocodeState>): MemberGeocodeState {
  const runtimeState = statesByMemberId[member.id];
  if (runtimeState) return runtimeState;

  if (member.geocodingStatus === "no_result") return { status: "empty" };
  if (member.geocodingStatus === "error") return { error: member.geocodingError || "Erro registrado na última tentativa.", status: "error" };
  if (member.geocodingStatus === "skipped") return { skipped: true, status: "skipped" };

  return { status: "idle" };
}

function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, " ");
}

function formatCoordinateDraft(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
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

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function MemberGeocodingWorkspace() {
  const { membersByWard, saveMember } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [batchMembers, setBatchMembers] = useState<Member[]>([]);
  const [statesByMemberId, setStatesByMemberId] = useState<Record<string, MemberGeocodeState>>({});
  const [addressDraftsByMemberId, setAddressDraftsByMemberId] = useState<Record<string, string>>({});
  const [addressSaveStatusesByMemberId, setAddressSaveStatusesByMemberId] = useState<Record<string, AddressSaveStatus>>({});
  const [coordinateDraftsByMemberId, setCoordinateDraftsByMemberId] = useState<Record<string, CoordinateDraft>>({});
  const [coordinateSaveStatusesByMemberId, setCoordinateSaveStatusesByMemberId] = useState<Record<string, CoordinateSaveStatus>>({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<GeocodingFilter>("pending");
  const [sexFilter, setSexFilter] = useState<"all" | Member["sex"]>("all");
  const [activityStatusFilter, setActivityStatusFilter] = useState<"all" | Member["churchActivityStatus"]>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");
  const [talkDurationFilter, setTalkDurationFilter] = useState<"all" | Member["sacramentTalkDuration"]>("all");
  const cacheRef = useRef(new Map<string, GeocodeResult | null>());
  const lastRequestAtRef = useRef(0);
  const stopRequestedRef = useRef(false);

  const candidates = useMemo(
    () =>
      membersByWard
        .filter((member) => normalizeAddress(member.address) && !isMappedMember(member))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [membersByWard],
  );
  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const filteredCandidates = useMemo(
    () =>
      candidates.filter((member) => {
        const address = addressDraftsByMemberId[member.id] ?? member.address;
        const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
        const matchesSearch =
          !normalizedSearch ||
          member.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
          address.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
        const matchesStatus = statusFilter === "pending" || memberGeocodingStatus(member) === statusFilter;
        const matchesSex = sexFilter === "all" || member.sex === sexFilter;
        const matchesActivityStatus = activityStatusFilter === "all" || member.churchActivityStatus === activityStatusFilter;
        const matchesAge = matchesAgeRange(calculateAge(member.birthDate), minimumAge, maximumAge);
        const matchesTalkDuration = talkDurationFilter === "all" || member.sacramentTalkDuration === talkDurationFilter;

        return matchesSearch && matchesStatus && matchesSex && matchesActivityStatus && matchesAge && matchesTalkDuration;
      }),
    [activityStatusFilter, addressDraftsByMemberId, candidates, maximumAge, minimumAge, search, sexFilter, statusFilter, talkDurationFilter],
  );
  const hasBatchSnapshot = batchMembers.length > 0;
  const listMembers = hasBatchSnapshot ? batchMembers : filteredCandidates;
  const selectedMembers = useMemo(
    () => (hasBatchSnapshot ? batchMembers : filteredCandidates.filter((member) => selectedIds.has(member.id))),
    [batchMembers, filteredCandidates, hasBatchSnapshot, selectedIds],
  );
  const selectedMember = listMembers.find((member) => member.id === selectedMemberId) ?? selectedMembers[0] ?? listMembers[0];
  const selectedState = selectedMember ? getMemberDisplayState(selectedMember, statesByMemberId) : undefined;
  const selectedAddress = selectedMember ? addressDraftsByMemberId[selectedMember.id] ?? selectedMember.address : "";
  const selectedNormalizedAddress = normalizeAddress(selectedAddress);
  const selectedAddressDirty = selectedMember ? selectedNormalizedAddress !== normalizeAddress(selectedMember.address) : false;
  const selectedAddressSaveStatus = selectedMember ? addressSaveStatusesByMemberId[selectedMember.id] ?? "idle" : "idle";
  const selectedCoordinateDraft = selectedMember ? coordinateDraftFor(selectedMember) : { latitude: "", longitude: "" };
  const selectedLatitude = parseCoordinateInput(selectedCoordinateDraft.latitude);
  const selectedLongitude = parseCoordinateInput(selectedCoordinateDraft.longitude);
  const selectedCoordinatesValid = typeof selectedLatitude === "number" && typeof selectedLongitude === "number";
  const selectedCoordinateSaveStatus = selectedMember ? coordinateSaveStatusesByMemberId[selectedMember.id] ?? "idle" : "idle";
  const selectedMembersWithEmptyAddress = selectedMembers.filter((member) => !normalizeAddress(addressDraftsByMemberId[member.id] ?? member.address));
  const metricMembers = hasBatchSnapshot ? batchMembers : filteredCandidates;
  const selectedProcessedCount = selectedMembers.filter((member) => processedStatuses.has(getMemberDisplayState(member, statesByMemberId).status)).length;
  const foundCount = metricMembers.filter((member) => {
    const runtimeState = getMemberDisplayState(member, statesByMemberId);

    return Boolean(runtimeState.result) && (runtimeState.status === "found" || runtimeState.status === "saved");
  }).length;
  const savedCount = metricMembers.filter((member) => getMemberDisplayState(member, statesByMemberId).status === "saved").length;
  const issueCount = metricMembers.filter((member) => {
    const runtimeStatus = getMemberDisplayState(member, statesByMemberId).status;

    return runtimeStatus === "empty" || runtimeStatus === "error";
  }).length;
  const progressPercent = selectedMembers.length ? Math.round((selectedProcessedCount / selectedMembers.length) * 100) : 0;
  const allSelected = listMembers.length > 0 && selectedMembers.length === listMembers.length;
  const someSelected = selectedMembers.length > 0 && !allSelected;

  function setMemberState(memberId: string, state: MemberGeocodeState) {
    setStatesByMemberId((current) => ({ ...current, [memberId]: state }));
  }

  function clearBatchSnapshot() {
    if (!batchMembers.length) return;
    setBatchMembers([]);
  }

  function updateSearch(value: string) {
    clearBatchSnapshot();
    setSearch(value);
  }

  function updateStatusFilter(value: GeocodingFilter) {
    clearBatchSnapshot();
    setStatusFilter(value);
  }

  function updateSexFilter(value: "all" | Member["sex"]) {
    clearBatchSnapshot();
    setSexFilter(value);
  }

  function updateActivityStatusFilter(value: "all" | Member["churchActivityStatus"]) {
    clearBatchSnapshot();
    setActivityStatusFilter(value);
  }

  function updateMinimumAgeFilter(value: string) {
    clearBatchSnapshot();
    setMinimumAgeFilter(value);
  }

  function updateMaximumAgeFilter(value: string) {
    clearBatchSnapshot();
    setMaximumAgeFilter(value);
  }

  function updateTalkDurationFilter(value: "all" | Member["sacramentTalkDuration"]) {
    clearBatchSnapshot();
    setTalkDurationFilter(value);
  }

  function draftAddressFor(member: Member) {
    return addressDraftsByMemberId[member.id] ?? member.address;
  }

  function coordinateDraftFor(member: Member): CoordinateDraft {
    return (
      coordinateDraftsByMemberId[member.id] ?? {
        latitude: formatCoordinateDraft(member.latitude),
        longitude: formatCoordinateDraft(member.longitude),
      }
    );
  }

  function memberWithDraftAddress(member: Member) {
    return {
      ...member,
      address: normalizeAddress(draftAddressFor(member)),
    };
  }

  function clearRuntimeState(memberId: string) {
    setStatesByMemberId((current) => {
      const state = current[memberId];
      if (!state || state.status === "loading") return current;

      const next = { ...current };
      delete next[memberId];
      return next;
    });
  }

  async function persistMemberUpdate(input: Omit<Member, "id"> & { id: string }, failureMessage: string) {
    const result = saveMember(input, { persistImmediately: true, silent: true });
    const persisted = await result.persisted;

    if (!persisted) {
      setMemberState(input.id, { error: failureMessage, status: "error" });
      return false;
    }

    return true;
  }

  function updateAddressDraft(memberId: string, address: string) {
    setAddressDraftsByMemberId((current) => ({ ...current, [memberId]: address }));
    setAddressSaveStatusesByMemberId((current) => {
      if (!current[memberId]) return current;

      const next = { ...current };
      delete next[memberId];
      return next;
    });
    clearRuntimeState(memberId);
  }

  function updateCoordinateDraft(member: Member, field: keyof CoordinateDraft, value: string) {
    setCoordinateDraftsByMemberId((current) => {
      const existing =
        current[member.id] ?? {
          latitude: formatCoordinateDraft(member.latitude),
          longitude: formatCoordinateDraft(member.longitude),
        };

      return {
        ...current,
        [member.id]: {
          ...existing,
          [field]: sanitizeCoordinateInput(value),
        },
      };
    });
    setCoordinateSaveStatusesByMemberId((current) => {
      if (!current[member.id]) return current;

      const next = { ...current };
      delete next[member.id];
      return next;
    });
    clearRuntimeState(member.id);
  }

  async function saveAddressDraft(member: Member) {
    const address = normalizeAddress(draftAddressFor(member));
    if (address === normalizeAddress(member.address)) return;

    setAddressSaveStatusesByMemberId((current) => ({ ...current, [member.id]: "saving" }));
    const persisted = await persistMemberUpdate(
      {
        ...member,
        address,
        geocodingAttemptedAt: undefined,
        geocodingError: undefined,
        geocodingQuery: undefined,
        geocodingStatus: undefined,
      },
      "Endereco editado, mas nao foi possivel salvar no Supabase.",
    );

    if (!persisted) {
      setAddressSaveStatusesByMemberId((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      return;
    }

    setAddressDraftsByMemberId((current) => ({ ...current, [member.id]: address }));
    setAddressSaveStatusesByMemberId((current) => ({ ...current, [member.id]: "saved" }));
  }

  async function saveManualCoordinates(member: Member) {
    const coordinateDraft = coordinateDraftFor(member);
    const latitude = parseCoordinateInput(coordinateDraft.latitude);
    const longitude = parseCoordinateInput(coordinateDraft.longitude);

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      setMemberState(member.id, { error: "Informe latitude e longitude válidas antes de salvar.", status: "error" });
      return;
    }

    const memberToSave = memberWithDraftAddress(member);
    setCoordinateSaveStatusesByMemberId((current) => ({ ...current, [member.id]: "saving" }));
    const persisted = await persistMemberUpdate(
      {
        ...memberToSave,
        geocodingAttemptedAt: undefined,
        geocodingError: undefined,
        geocodingQuery: undefined,
        geocodingStatus: undefined,
        latitude,
        longitude,
      },
      "Coordenadas informadas, mas não foram salvas no Supabase.",
    );

    if (!persisted) {
      setCoordinateSaveStatusesByMemberId((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      return;
    }

    setAddressDraftsByMemberId((current) => ({ ...current, [member.id]: memberToSave.address }));
    setCoordinateDraftsByMemberId((current) => ({
      ...current,
      [member.id]: {
        latitude: String(latitude),
        longitude: String(longitude),
      },
    }));
    setCoordinateSaveStatusesByMemberId((current) => ({ ...current, [member.id]: "saved" }));
    setMemberState(member.id, { status: "saved" });
    selectNext(member.id);
  }

  function toggleMemberSelection(memberId: string, checked: boolean) {
    clearBatchSnapshot();
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(memberId);
      else next.delete(memberId);

      return next;
    });
  }

  function toggleAllSelection(checked: boolean) {
    clearBatchSnapshot();
    setSelectedIds(checked ? new Set(filteredCandidates.map((member) => member.id)) : new Set());
  }

  function selectNext(currentMemberId: string) {
    const currentIndex = listMembers.findIndex((member) => member.id === currentMemberId);
    const nextMember = listMembers.find((member, index) => index > currentIndex && statesByMemberId[member.id]?.status !== "saved");

    setSelectedMemberId(nextMember?.id ?? listMembers.find((member) => member.id !== currentMemberId)?.id ?? "");
  }

  async function runGeocode(member: Member, options: RunGeocodeOptions = {}): Promise<MemberGeocodeState> {
    const memberToSave = memberWithDraftAddress(member);
    const address = memberToSave.address;

    if (!address) {
      const nextState: MemberGeocodeState = { error: "Informe um endereço antes de processar.", status: "error" };
      setMemberState(member.id, nextState);
      return nextState;
    }

    const existingState = statesByMemberId[member.id];
    if (existingState?.result && existingState.status !== "saved") {
      if (options.persistFound) {
        return saveGeocodeResult(member, existingState.result);
      }

      return existingState;
    }

    setMemberState(member.id, { status: "loading" });

    const cached = cacheRef.current.get(address);
    if (cacheRef.current.has(address)) {
      const cachedState: MemberGeocodeState = cached ? { result: cached, status: "found" } : { status: "empty" };
      if (!cached) {
        const persisted = await persistMemberUpdate(
          {
            ...memberToSave,
            geocodingAttemptedAt: nowIso(),
            geocodingError: "",
            geocodingQuery: address,
            geocodingStatus: "no_result",
          },
          "Sem resultado encontrado, mas não foi possível salvar esse status no Supabase.",
        );
        if (!persisted) return { error: "Sem resultado encontrado, mas não foi possível salvar esse status no Supabase.", status: "error" };
      }
      if (cached && options.persistFound) return saveGeocodeResult(member, cached);
      setMemberState(member.id, cachedState);
      return cachedState;
    }

    const elapsed = Date.now() - lastRequestAtRef.current;
    if (elapsed < 1000) {
      await wait(1000 - elapsed);
    }

    try {
      lastRequestAtRef.current = Date.now();
      const response = await fetch("/api/geocode/member-address", {
        body: JSON.stringify({ address }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; results?: GeocodeResult[] };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível buscar esse endereço.");
      }

      const result = payload.results?.[0] ?? null;
      cacheRef.current.set(address, result);
      const nextState: MemberGeocodeState = result ? { result, status: "found" } : { status: "empty" };
      if (result && options.persistFound) return saveGeocodeResult(member, result);
      if (!result) {
        const persisted = await persistMemberUpdate(
          {
            ...memberToSave,
            geocodingAttemptedAt: nowIso(),
            geocodingError: "",
            geocodingQuery: address,
            geocodingStatus: "no_result",
          },
          "Sem resultado encontrado, mas não foi possível salvar esse status no Supabase.",
        );
        if (!persisted) return { error: "Sem resultado encontrado, mas não foi possível salvar esse status no Supabase.", status: "error" };
      }
      setMemberState(member.id, nextState);
      return nextState;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao buscar coordenadas.";
      const nextState: MemberGeocodeState = { error: errorMessage, status: "error" };
      const persisted = await persistMemberUpdate(
        {
          ...memberToSave,
          geocodingAttemptedAt: nowIso(),
          geocodingError: errorMessage,
          geocodingQuery: address,
          geocodingStatus: "error",
        },
        "O erro da busca aconteceu, mas não foi possível salvar esse status no Supabase.",
      );
      if (!persisted) return { error: "O erro da busca aconteceu, mas não foi possível salvar esse status no Supabase.", status: "error" };
      setMemberState(member.id, nextState);
      return nextState;
    }
  }

  async function processSelectedMembers() {
    if (!selectedMembers.length || batchRunning) return;

    const membersToProcess = selectedMembers;
    stopRequestedRef.current = false;
    setBatchMembers(membersToProcess);
    setBatchRunning(true);

    for (const member of membersToProcess) {
      if (stopRequestedRef.current) break;
      const currentState = statesByMemberId[member.id];
      if (currentState?.status === "saved") continue;
      setSelectedMemberId(member.id);
      await runGeocode(member, { persistFound: true });
    }

    setBatchRunning(false);
  }

  function stopBatch() {
    stopRequestedRef.current = true;
  }

  async function saveGeocodeResult(member: Member, result: GeocodeResult): Promise<MemberGeocodeState> {
    const memberToSave = memberWithDraftAddress(member);
    const persisted = await persistMemberUpdate(
      {
        ...memberToSave,
        geocodingAttemptedAt: undefined,
        geocodingError: undefined,
        geocodingQuery: undefined,
        geocodingStatus: undefined,
        latitude: result.latitude,
        longitude: result.longitude,
      },
      "Coordenada encontrada, mas não foi salva no Supabase.",
    );

    if (!persisted) return { error: "Coordenada encontrada, mas não foi salva no Supabase.", status: "error" };

    setMemberState(member.id, { result, status: "saved" });
    return { result, status: "saved" };
  }

  async function confirmResult(member: Member, result: GeocodeResult) {
    const savedState = await saveGeocodeResult(member, result);
    if (savedState.status !== "saved") return;
    selectNext(member.id);
  }

  async function saveFoundResults() {
    for (const member of selectedMembers) {
      const state = statesByMemberId[member.id];
      if (!state?.result || state.status === "saved") continue;

      await saveGeocodeResult(member, state.result);
    }
  }

  async function skipMember(member: Member) {
    const memberToSave = memberWithDraftAddress(member);
    const persisted = await persistMemberUpdate(
      {
        ...memberToSave,
        geocodingAttemptedAt: nowIso(),
        geocodingError: "",
        geocodingQuery: memberToSave.address,
        geocodingStatus: "skipped",
      },
      "Membro pulado, mas não foi possível salvar esse status no Supabase.",
    );
    if (!persisted) return;

    setMemberState(member.id, { skipped: true, status: "skipped" });
    selectNext(member.id);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Os endereços consultados são enviados para um serviço público externo. O processamento é sequencial, sem autocomplete, sem paralelismo e com intervalo mínimo de 1 segundo. Erros, sem resultado e pulados ficam marcados no cadastro para revisão futura.
      </div>

      <div className="grid gap-2 rounded-lg border bg-card p-3 lg:grid-cols-[minmax(220px,1fr)_repeat(6,minmax(120px,auto))]">
        <SearchInput
          placeholder="Buscar por nome ou endereço"
          value={search}
          onChange={(event) => updateSearch(event.target.value)}
        />
        <Select value={statusFilter} onValueChange={(value) => updateStatusFilter(value as GeocodingFilter)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(geocodingFilterLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sexFilter} onValueChange={(value) => updateSexFilter(value as "all" | Member["sex"])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os sexos</SelectItem>
            <SelectItem value="M">Masculino</SelectItem>
            <SelectItem value="F">Feminino</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activityStatusFilter} onValueChange={(value) => updateActivityStatusFilter(value as "all" | Member["churchActivityStatus"])}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="attending">Frequentando</SelectItem>
            <SelectItem value="not_attending">Não frequentando</SelectItem>
            <SelectItem value="away">Afastado</SelectItem>
          </SelectContent>
        </Select>
        <Input
          inputMode="numeric"
          min={0}
          placeholder="Idade mín."
          type="number"
          value={minimumAgeFilter}
          onChange={(event) => updateMinimumAgeFilter(event.target.value)}
        />
        <Input
          inputMode="numeric"
          min={0}
          placeholder="Idade máx."
          type="number"
          value={maximumAgeFilter}
          onChange={(event) => updateMaximumAgeFilter(event.target.value)}
        />
        <Select value={talkDurationFilter} onValueChange={(value) => updateTalkDurationFilter(value as "all" | Member["sacramentTalkDuration"])}>
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

      <div className="grid gap-3 md:grid-cols-6">
        <StatTile label="Pendentes" value={candidates.length} />
        <StatTile label="Filtrados" value={filteredCandidates.length} />
        <StatTile label="Processados" value={selectedProcessedCount} />
        <StatTile label="Encontrados" value={foundCount} />
        <StatTile label="Erros/sem resultado" value={issueCount} />
        <StatTile label="Salvos" value={savedCount} />
      </div>

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">Progresso do lote</span>
          <span className="text-muted-foreground tabular-nums">
            {selectedProcessedCount} de {selectedMembers.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="grid min-h-[620px] gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="min-h-0 rounded-lg border bg-card">
          <div className="border-b p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={allSelected || (someSelected && "indeterminate")} onCheckedChange={(checked) => toggleAllSelection(checked === true)} />
              Selecionar filtrados
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasBatchSnapshot ? `${listMembers.length} membros no ultimo lote` : `${filteredCandidates.length} de ${candidates.length} membros com endereço e sem coordenadas`}
            </p>
          </div>
          <div className="h-[560px] overflow-y-auto p-2">
            {listMembers.length ? (
              <div className="space-y-1">
                {listMembers.map((member) => {
                  const state = getMemberDisplayState(member, statesByMemberId);

                  return (
                    <div
                      className={cn(
                        "flex gap-2 rounded-md border px-2 py-2 transition hover:bg-muted",
                        selectedMember?.id === member.id ? "border-primary bg-primary/5" : "border-transparent",
                      )}
                      key={member.id}
                    >
                      <Checkbox
                        aria-label={`Selecionar ${member.name}`}
                        checked={selectedIds.has(member.id)}
                        className="mt-1"
                        onCheckedChange={(checked) => toggleMemberSelection(member.id, checked === true)}
                      />
                      <button className="min-w-0 flex-1 text-left" onClick={() => setSelectedMemberId(member.id)} type="button">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{member.name}</p>
                            <p className="truncate text-xs text-muted-foreground">{draftAddressFor(member) || "Sem endereço informado"}</p>
                            {member.geocodingStatus && member.geocodingStatus !== "not_attempted" ? (
                              <p className="truncate text-xs text-muted-foreground">{geocodingFilterLabels[member.geocodingStatus]}</p>
                            ) : null}
                          </div>
                          <StatusBadge status={state.status} />
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                {hasBatchSnapshot ? "Nenhum membro no lote." : "Nenhum membro pendente de mapeamento."}
              </div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border bg-card p-4">
          {selectedMember && selectedState ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-semibold">{selectedMember.name}</p>
                  <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor={`member-geocoding-address-${selectedMember.id}`}>
                    Endereço para buscar
                  </label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <Input
                      className="sm:flex-1"
                      disabled={selectedState.status === "loading" || batchRunning || selectedAddressSaveStatus === "saving"}
                      id={`member-geocoding-address-${selectedMember.id}`}
                      placeholder="ex: Rua, número, bairro, cidade - UF"
                      value={selectedAddress}
                      onChange={(event) => updateAddressDraft(selectedMember.id, event.target.value)}
                    />
                    <Button
                      className="sm:w-auto"
                      disabled={!selectedAddressDirty || selectedState.status === "loading" || batchRunning || selectedAddressSaveStatus === "saving"}
                      onClick={() => saveAddressDraft(selectedMember)}
                      type="button"
                      variant="outline"
                    >
                      {selectedAddressSaveStatus === "saving" ? <Loader2 className="animate-spin" /> : <Save />}
                      Salvar endereço
                    </Button>
                  </div>
                  {selectedAddressSaveStatus === "saved" && !selectedAddressDirty ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Endereço salvo na ficha do membro.</p>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground" htmlFor={`member-geocoding-latitude-${selectedMember.id}`}>
                        Latitude
                      </label>
                      <Input
                        className="mt-1"
                        disabled={selectedState.status === "loading" || batchRunning || selectedCoordinateSaveStatus === "saving"}
                        id={`member-geocoding-latitude-${selectedMember.id}`}
                        inputMode="decimal"
                        placeholder="ex: -3.7319"
                        value={selectedCoordinateDraft.latitude}
                        onChange={(event) => updateCoordinateDraft(selectedMember, "latitude", event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground" htmlFor={`member-geocoding-longitude-${selectedMember.id}`}>
                        Longitude
                      </label>
                      <Input
                        className="mt-1"
                        disabled={selectedState.status === "loading" || batchRunning || selectedCoordinateSaveStatus === "saving"}
                        id={`member-geocoding-longitude-${selectedMember.id}`}
                        inputMode="decimal"
                        placeholder="ex: -38.5267"
                        value={selectedCoordinateDraft.longitude}
                        onChange={(event) => updateCoordinateDraft(selectedMember, "longitude", event.target.value)}
                      />
                    </div>
                  </div>
                  {selectedCoordinateSaveStatus === "saved" ? (
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Coordenadas manuais salvas na ficha do membro.</p>
                  ) : null}
                  {(selectedCoordinateDraft.latitude || selectedCoordinateDraft.longitude) && !selectedCoordinatesValid ? (
                    <p className="mt-1 text-xs text-destructive">Informe latitude e longitude válidas para salvar manualmente.</p>
                  ) : null}
                </div>
                <StatusBadge status={selectedState.status} />
              </div>

              <div className="mt-4 rounded-lg bg-muted/40 p-4 text-sm">
                {selectedState.status === "idle" ? <p className="text-muted-foreground">Busque ou processe o lote para revisar o resultado.</p> : null}
                {selectedState.status === "loading" ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Consultando endereço...
                  </p>
                ) : null}
                {selectedState.status === "empty" ? <p className="text-muted-foreground">Nenhum resultado encontrado para esse endereço.</p> : null}
                {selectedState.status === "error" ? <p className="text-destructive">{selectedState.error}</p> : null}
                {selectedState.status === "skipped" ? <p className="text-muted-foreground">Membro pulado nesta rodada.</p> : null}
                {selectedState.status === "saved" ? <p className="text-emerald-700 dark:text-emerald-300">Coordenadas salvas no cadastro.</p> : null}
                {!normalizeAddress(selectedAddress) ? <p className="text-destructive">Informe um endereço para processar este membro.</p> : null}
                {selectedState.result ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Resultado encontrado</p>
                      <p className="font-medium">{selectedState.result.displayName}</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <CoordinateTile label="Latitude" value={selectedState.result.latitude} />
                      <CoordinateTile label="Longitude" value={selectedState.result.longitude} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-auto flex flex-wrap justify-end gap-2 pt-4">
                {batchRunning ? (
                  <Button onClick={stopBatch} type="button" variant="outline">
                    <Square />
                    Parar
                  </Button>
                ) : (
                  <Button disabled={!selectedMembers.length || selectedMembersWithEmptyAddress.length > 0} onClick={processSelectedMembers} type="button" variant="outline">
                    <Play />
                    Processar selecionados
                  </Button>
                )}
                <Button disabled={batchRunning || !selectedMembers.some((member) => statesByMemberId[member.id]?.result)} onClick={saveFoundResults} type="button" variant="outline">
                  <Save />
                  Salvar encontrados
                </Button>
                <Button disabled={batchRunning || selectedState.status === "loading"} onClick={() => skipMember(selectedMember)} type="button" variant="ghost">
                  <SkipForward />
                  Pular
                </Button>
                <Button disabled={selectedState.status === "loading" || !normalizeAddress(selectedAddress)} onClick={() => runGeocode(selectedMember)} type="button" variant="outline">
                  {selectedState.status === "loading" ? <Loader2 className="animate-spin" /> : <Search />}
                  Buscar
                </Button>
                <Button
                  disabled={!selectedCoordinatesValid || selectedState.status === "loading" || selectedCoordinateSaveStatus === "saving" || batchRunning}
                  onClick={() => saveManualCoordinates(selectedMember)}
                  type="button"
                  variant="outline"
                >
                  {selectedCoordinateSaveStatus === "saving" ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvar coordenadas
                </Button>
                <Button
                  disabled={!selectedState.result || selectedState.status === "saved" || batchRunning}
                  onClick={() => selectedState.result && confirmResult(selectedMember, selectedState.result)}
                  type="button"
                >
                  <Check />
                  Confirmar e salvar
                </Button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center text-center text-sm text-muted-foreground">
              Não há membros com endereço e sem coordenadas para mapear.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CoordinateTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MemberGeocodeStatus }) {
  const labels: Record<MemberGeocodeStatus, string> = {
    empty: "Sem resultado",
    error: "Erro",
    found: "Encontrado",
    idle: "Pendente",
    loading: "Buscando",
    saved: "Salvo",
    skipped: "Pulado",
  };

  return (
    <Badge className="shrink-0" variant={status === "saved" || status === "found" ? "secondary" : "outline"}>
      {labels[status]}
    </Badge>
  );
}

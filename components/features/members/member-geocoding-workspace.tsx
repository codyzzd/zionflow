"use client";

import { Check, Loader2, Play, Save, Search, SkipForward, Square } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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

const processedStatuses = new Set<MemberGeocodeStatus>(["found", "empty", "error", "saved", "skipped"]);

function isMappedMember(member: Member) {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, " ");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function MemberGeocodingWorkspace() {
  const { membersByWard, saveMember } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [statesByMemberId, setStatesByMemberId] = useState<Record<string, MemberGeocodeState>>({});
  const [batchRunning, setBatchRunning] = useState(false);
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
  const selectedMembers = useMemo(() => candidates.filter((member) => selectedIds.has(member.id)), [candidates, selectedIds]);
  const selectedMember = candidates.find((member) => member.id === selectedMemberId) ?? selectedMembers[0] ?? candidates[0];
  const selectedState = selectedMember ? statesByMemberId[selectedMember.id] ?? { status: "idle" } : undefined;
  const selectedProcessedCount = selectedMembers.filter((member) => processedStatuses.has(statesByMemberId[member.id]?.status ?? "idle")).length;
  const foundCount = candidates.filter((member) => statesByMemberId[member.id]?.status === "found").length;
  const savedCount = Object.values(statesByMemberId).filter((state) => state.status === "saved").length;
  const issueCount = candidates.filter((member) => ["empty", "error"].includes(statesByMemberId[member.id]?.status ?? "")).length;
  const progressPercent = selectedMembers.length ? Math.round((selectedProcessedCount / selectedMembers.length) * 100) : 0;
  const allSelected = candidates.length > 0 && selectedMembers.length === candidates.length;
  const someSelected = selectedMembers.length > 0 && !allSelected;

  function setMemberState(memberId: string, state: MemberGeocodeState) {
    setStatesByMemberId((current) => ({ ...current, [memberId]: state }));
  }

  function toggleMemberSelection(memberId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(memberId);
      else next.delete(memberId);

      return next;
    });
  }

  function toggleAllSelection(checked: boolean) {
    setSelectedIds(checked ? new Set(candidates.map((member) => member.id)) : new Set());
  }

  function selectNext(currentMemberId: string) {
    const currentIndex = candidates.findIndex((member) => member.id === currentMemberId);
    const nextMember = candidates.find((member, index) => index > currentIndex && statesByMemberId[member.id]?.status !== "saved");

    setSelectedMemberId(nextMember?.id ?? candidates.find((member) => member.id !== currentMemberId)?.id ?? "");
  }

  async function runGeocode(member: Member): Promise<MemberGeocodeState> {
    const address = normalizeAddress(member.address);

    if (!address) return { status: "empty" };

    const existingState = statesByMemberId[member.id];
    if (existingState?.result && existingState.status !== "saved") return existingState;

    setMemberState(member.id, { status: "loading" });

    const cached = cacheRef.current.get(address);
    if (cacheRef.current.has(address)) {
      const cachedState: MemberGeocodeState = cached ? { result: cached, status: "found" } : { status: "empty" };
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
      setMemberState(member.id, nextState);
      return nextState;
    } catch (error) {
      const nextState: MemberGeocodeState = { error: error instanceof Error ? error.message : "Erro ao buscar coordenadas.", status: "error" };
      setMemberState(member.id, nextState);
      return nextState;
    }
  }

  async function processSelectedMembers() {
    if (!selectedMembers.length || batchRunning) return;

    stopRequestedRef.current = false;
    setBatchRunning(true);

    for (const member of selectedMembers) {
      if (stopRequestedRef.current) break;
      const currentState = statesByMemberId[member.id];
      if (currentState?.status === "saved" || currentState?.result) continue;
      setSelectedMemberId(member.id);
      await runGeocode(member);
    }

    setBatchRunning(false);
  }

  function stopBatch() {
    stopRequestedRef.current = true;
  }

  function confirmResult(member: Member, result: GeocodeResult) {
    saveMember({
      ...member,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    setMemberState(member.id, { result, status: "saved" });
    selectNext(member.id);
  }

  function saveFoundResults() {
    selectedMembers.forEach((member) => {
      const state = statesByMemberId[member.id];
      if (!state?.result || state.status === "saved") return;

      saveMember({
        ...member,
        latitude: state.result.latitude,
        longitude: state.result.longitude,
      });
      setMemberState(member.id, { result: state.result, status: "saved" });
    });
  }

  function skipMember(member: Member) {
    setMemberState(member.id, { skipped: true, status: "skipped" });
    selectNext(member.id);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Os endereços consultados são enviados para um serviço público externo. O processamento é sequencial, sem autocomplete, sem paralelismo e com intervalo mínimo de 1 segundo.
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <StatTile label="Pendentes" value={candidates.length} />
        <StatTile label="Selecionados" value={selectedMembers.length} />
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
              Selecionar todos
            </label>
            <p className="mt-1 text-xs text-muted-foreground">{candidates.length} membros com endereço e sem coordenadas</p>
          </div>
          <div className="h-[560px] overflow-y-auto p-2">
            {candidates.length ? (
              <div className="space-y-1">
                {candidates.map((member) => {
                  const state = statesByMemberId[member.id] ?? { status: "idle" };

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
                            <p className="truncate text-xs text-muted-foreground">{member.address}</p>
                          </div>
                          {state.status !== "idle" ? <StatusBadge status={state.status} /> : null}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">Nenhum membro pendente de mapeamento.</div>
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border bg-card p-4">
          {selectedMember && selectedState ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                <div>
                  <p className="text-xl font-semibold">{selectedMember.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedMember.address}</p>
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
                  <Button disabled={!selectedMembers.length} onClick={processSelectedMembers} type="button" variant="outline">
                    <Play />
                    Processar selecionados
                  </Button>
                )}
                <Button disabled={!selectedMembers.some((member) => statesByMemberId[member.id]?.result)} onClick={saveFoundResults} type="button" variant="outline">
                  <Save />
                  Salvar encontrados
                </Button>
                <Button onClick={() => skipMember(selectedMember)} type="button" variant="ghost">
                  <SkipForward />
                  Pular
                </Button>
                <Button disabled={selectedState.status === "loading"} onClick={() => runGeocode(selectedMember)} type="button" variant="outline">
                  {selectedState.status === "loading" ? <Loader2 className="animate-spin" /> : <Search />}
                  Buscar
                </Button>
                <Button
                  disabled={!selectedState.result || selectedState.status === "saved"}
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

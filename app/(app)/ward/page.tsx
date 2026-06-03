"use client";

import { Landmark, Loader2, MapPin, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseCoordinateInput } from "@/lib/coordinates";
import type { Stake, User, Ward } from "@/types/domain";

type WardForm = {
  name: string;
  address: string;
  meetingTime: string;
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
};

type StakeRegistrationForm = Pick<Stake, "name" | "city" | "state" | "country">;

function formFromWard(ward: Ward): WardForm {
  return {
    name: ward.name,
    address: ward.address,
    meetingTime: ward.meetingTime,
    city: ward.city,
    state: ward.state,
    country: ward.country,
    latitude: ward.latitude,
    longitude: ward.longitude,
  };
}

const emptyWardForm: WardForm = {
  name: "",
  address: "",
  meetingTime: "",
  city: "",
  state: "",
  country: "",
  latitude: undefined,
  longitude: undefined,
};

type GeocodingResult = {
  displayName: string;
  latitude: number;
  longitude: number;
};

function stakeFormFromWard(ward?: Ward): StakeRegistrationForm {
  return {
    name: "",
    city: ward?.city ?? "",
    state: ward?.state ?? "",
    country: ward?.country || "Brasil",
  };
}

function UnlinkedStakeRegistration({
  currentUser,
  currentWard,
  onRequest,
}: {
  currentUser?: User;
  currentWard?: Ward;
  onRequest: (input: StakeRegistrationForm) => void;
}) {
  const [stakeForm, setStakeForm] = useState<StakeRegistrationForm>(() => stakeFormFromWard(currentWard));
  const canRequestStakeOwnership = Boolean(currentUser && currentUser.status === "active" && currentWard && !currentWard.stakeId && stakeForm.name.trim());

  function updateStakeField(field: keyof StakeRegistrationForm, value: string) {
    setStakeForm((current) => ({ ...current, [field]: value }));
  }

  function handleRequestStakeOwnership() {
    if (!canRequestStakeOwnership) return;
    onRequest(stakeForm);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-medium">Esta ala ainda não está atrelada a uma estaca.</p>
        <p className="mt-1 text-sm text-muted-foreground">Cadastre a estaca desta ala para enviar sua solicitação de responsável da estaca.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="stake-request-name">Nome da estaca</Label>
          <Input id="stake-request-name" value={stakeForm.name} onChange={(event) => updateStakeField("name", event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stake-request-city">Cidade</Label>
          <Input id="stake-request-city" value={stakeForm.city} onChange={(event) => updateStakeField("city", event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stake-request-state">Estado</Label>
          <Input id="stake-request-state" value={stakeForm.state} onChange={(event) => updateStakeField("state", event.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="stake-request-country">País</Label>
          <Input id="stake-request-country" value={stakeForm.country} onChange={(event) => updateStakeField("country", event.target.value)} />
        </div>
      </div>

      <Button disabled={!canRequestStakeOwnership} onClick={handleRequestStakeOwnership}>
        Solicitar ser responsável da estaca
      </Button>
    </div>
  );
}

export default function WardPage() {
  const {
    approveStakeOwnershipRequest,
    currentUser,
    currentWard,
    db,
    hasPermission,
    requestStakeOwnership,
    saveWard,
    stakeOwnerRequestsByStake,
    transferStakeOwnership,
  } = useAppContext();
  const canManageWard = hasPermission("ward.manage");
  const currentStake = useMemo(
    () => (currentWard?.stakeId ? db.stakes.find((stake) => stake.id === currentWard.stakeId) : undefined),
    [currentWard, db.stakes],
  );
  const [form, setForm] = useState<WardForm>(() => (currentWard ? formFromWard(currentWard) : emptyWardForm));
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [transferTargetUserId, setTransferTargetUserId] = useState("");
  const usersById = useMemo(() => new Map(db.users.map((user) => [user.id, user])), [db.users]);
  const wardsById = useMemo(() => new Map(db.wards.map((ward) => [ward.id, ward])), [db.wards]);
  const activeStakeUsers = useMemo(
    () =>
      currentStake
        ? db.users
            .filter((user) => user.status === "active" && !user.archivedAt && wardsById.get(user.wardId)?.stakeId === currentStake.id)
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        : [],
    [currentStake, db.users, wardsById],
  );
  const activeStakeOwner = activeStakeUsers.find((user) => user.accessLevel === "stake_owner");
  const pendingRequests = stakeOwnerRequestsByStake.filter((request) => request.status === "pending");
  const currentUserRequest = currentUser ? pendingRequests.find((request) => request.requesterUserId === currentUser.id) : undefined;
  const canRequestStakeOwnership = Boolean(currentUser && currentWard?.stakeId && currentUser.status === "active" && currentStake && !activeStakeOwner && !currentUserRequest);
  const canTransferStakeOwnership = Boolean(currentUser && currentStake && currentUser.accessLevel === "stake_owner" && activeStakeOwner?.id === currentUser.id);
  const transferTargets = activeStakeUsers.filter((user) => user.id !== currentUser?.id);

  const hasChanges = useMemo(() => {
    if (!currentWard) return false;
    const currentForm = formFromWard(currentWard);

    return Object.entries(currentForm).some(([key, value]) => form[key as keyof WardForm] !== value);
  }, [currentWard, form]);

  function updateField(field: keyof WardForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateCoordinateField(field: "latitude" | "longitude", value: string) {
    setForm((current) => ({ ...current, [field]: parseCoordinateInput(value) }));
  }

  function buildWardGeocodingAddress() {
    return [form.address, form.city, form.state, form.country].map((value) => value.trim()).filter(Boolean).join(", ");
  }

  async function handleGeocodeWardAddress() {
    const address = buildWardGeocodingAddress();
    if (!address) {
      toast.error("Informe o endereço da ala antes de buscar coordenadas.");
      return;
    }

    setIsGeocoding(true);
    try {
      const response = await fetch("/api/geocode/ward-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; results?: GeocodingResult[] } | null;

      if (!response.ok) {
        toast.error(payload?.error ?? "Não foi possível buscar coordenadas agora.");
        return;
      }

      const result = payload?.results?.[0];
      if (!result) {
        toast.error("Nenhuma coordenada encontrada para esse endereço.");
        return;
      }

      setForm((current) => ({
        ...current,
        latitude: result.latitude,
        longitude: result.longitude,
      }));
      toast.success("Coordenadas preenchidas. Salve a ala para persistir.");
    } catch (error) {
      console.error("Failed to geocode ward address.", error);
      toast.error("Não foi possível buscar coordenadas agora.");
    } finally {
      setIsGeocoding(false);
    }
  }

  function handleSave() {
    if (!currentWard || !canManageWard || !form.name.trim()) return;

    const nextWard: Ward = {
      ...currentWard,
      name: form.name.trim(),
      address: form.address.trim(),
      meetingTime: form.meetingTime.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
    };

    saveWard(nextWard);
    setForm(formFromWard(nextWard));
  }

  function handleTransferStakeOwnership() {
    if (!transferTargetUserId) return;
    transferStakeOwnership(transferTargetUserId);
    setTransferTargetUserId("");
  }

  return (
    <PermissionGuard permission="ward.view">
      <div className="mx-auto max-w-[800px]">
        <PageHeader
          eyebrow="Ala"
          title={currentWard?.name ?? "Dados da ala"}
          description="Dados institucionais usados como referência para a organização local."
          actions={
            canManageWard ? (
              <Button disabled={!currentWard || !form.name.trim() || !hasChanges} onClick={handleSave} size="lg">
                <Save className="size-4" />
                Salvar
              </Button>
            ) : null
          }
        />

        <Card>
          <CardHeader>
            <CardTitle>Cadastro da ala</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <div className="space-y-2">
                  <Label htmlFor="ward-name">Nome da ala</Label>
                  <Input disabled={!canManageWard} id="ward-name" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ward-meeting-time">Horário da reunião</Label>
                  <Input
                    disabled={!canManageWard}
                    id="ward-meeting-time"
                    type="time"
                    value={form.meetingTime}
                    onChange={(event) => updateField("meetingTime", event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ward-address">Endereço</Label>
                <Input disabled={!canManageWard} id="ward-address" value={form.address} onChange={(event) => updateField("address", event.target.value)} />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Localização</p>
                <p className="text-xs text-muted-foreground">Dados usados para identificar a ala e montar a busca de coordenadas.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ward-city">Cidade</Label>
                  <Input disabled={!canManageWard} id="ward-city" value={form.city} onChange={(event) => updateField("city", event.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ward-state">Estado</Label>
                  <Input disabled={!canManageWard} id="ward-state" value={form.state} onChange={(event) => updateField("state", event.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ward-country">País</Label>
                  <Input disabled={!canManageWard} id="ward-country" value={form.country} onChange={(event) => updateField("country", event.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Coordenadas para clima</p>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    O clima das atas só pode ser buscado quando latitude, longitude e horário da reunião estiverem preenchidos.
                  </p>
                </div>
                {canManageWard ? (
                  <Button className="shrink-0" disabled={isGeocoding || !buildWardGeocodingAddress()} onClick={() => void handleGeocodeWardAddress()} type="button" variant="outline">
                    {isGeocoding ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
                    Buscar coordenadas
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ward-latitude">Latitude</Label>
                  <Input
                    className="tabular-nums"
                    disabled={!canManageWard}
                    id="ward-latitude"
                    inputMode="decimal"
                    value={form.latitude ?? ""}
                    onChange={(event) => updateCoordinateField("latitude", event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ward-longitude">Longitude</Label>
                  <Input
                    className="tabular-nums"
                    disabled={!canManageWard}
                    id="ward-longitude"
                    inputMode="decimal"
                    value={form.longitude ?? ""}
                    onChange={(event) => updateCoordinateField("longitude", event.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Estaca</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {currentStake ? (
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Landmark className="size-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">{currentStake.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[currentStake.city, currentStake.state, currentStake.country].filter(Boolean).join(", ") || "Localização não informada"}
                  </p>
                </div>
              </div>
            ) : (
              <UnlinkedStakeRegistration
                key={currentWard?.id ?? "empty-ward"}
                currentUser={currentUser}
                currentWard={currentWard}
                onRequest={requestStakeOwnership}
              />
            )}
          </CardContent>
        </Card>

        {currentStake ? (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Responsável da estaca</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  {activeStakeOwner ? (
                    <>
                      <p className="font-medium">{activeStakeOwner.name}</p>
                      <p className="text-sm text-muted-foreground">Responsável atual pela administração da estaca.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">Nenhum responsável definido</p>
                      <p className="text-sm text-muted-foreground">Dois membros ativos da estaca podem aprovar a primeira definição.</p>
                    </>
                  )}
                </div>
                {activeStakeOwner ? <Badge variant="default">Definido</Badge> : <Badge variant="secondary">Pendente</Badge>}
              </div>

              {!activeStakeOwner ? (
                <div className="space-y-4">
                  <Button disabled={!canRequestStakeOwnership} onClick={() => requestStakeOwnership()} variant={currentUserRequest ? "secondary" : "default"}>
                    {currentUserRequest ? "Solicitação pendente" : "Solicitar ser responsável da estaca"}
                  </Button>

                  {pendingRequests.length ? (
                    <div className="space-y-3">
                      {pendingRequests.map((request) => {
                        const requester = usersById.get(request.requesterUserId);
                        const requesterWard = wardsById.get(request.wardId);
                        const alreadyApproved = Boolean(currentUser && request.approvals.some((approval) => approval.userId === currentUser.id));
                        const currentUserStakeId = currentUser ? wardsById.get(currentUser.wardId)?.stakeId : undefined;
                        const canApprove = Boolean(
                          currentUser &&
                            currentStake &&
                            currentUser.status === "active" &&
                            currentUserStakeId === currentStake.id &&
                            currentUser.id !== request.requesterUserId &&
                            !alreadyApproved,
                        );

                        return (
                          <div key={request.id} className="rounded-lg border p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="space-y-1">
                                <p className="font-medium">{requester?.name ?? "Usuário não encontrado"}</p>
                                <p className="text-sm text-muted-foreground">
                                  {requesterWard?.name ?? "Ala não encontrada"} - {request.approvals.length}/2 aprovações
                                </p>
                              </div>
                              <Button disabled={!canApprove} onClick={() => approveStakeOwnershipRequest(request.id)} size="sm" variant="secondary">
                                {alreadyApproved ? "Aprovado por você" : "Aprovar"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma solicitação pendente.</div>
                  )}
                </div>
              ) : null}

              {canTransferStakeOwnership ? (
                <div className="grid gap-3 border-t pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label>Transferir responsabilidade</Label>
                    <Select value={transferTargetUserId} onValueChange={setTransferTargetUserId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha um membro ativo da estaca" />
                      </SelectTrigger>
                      <SelectContent>
                        {transferTargets.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={!transferTargetUserId} onClick={handleTransferStakeOwnership}>
                    Transferir
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PermissionGuard>
  );
}

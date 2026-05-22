"use client";

import { Copy, Landmark, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Ward } from "@/types/domain";

type WardForm = {
  name: string;
  city: string;
  state: string;
  country: string;
};

function formFromWard(ward: Ward): WardForm {
  return {
    name: ward.name,
    city: ward.city,
    state: ward.state,
    country: ward.country,
  };
}

const emptyWardForm: WardForm = {
  name: "",
  city: "",
  state: "",
  country: "",
};

export default function WardPage() {
  const { currentWard, db, hasPermission, saveWard } = useAppContext();
  const canManageWard = hasPermission("ward.manage");
  const currentStake = useMemo(
    () => (currentWard?.stakeId ? db.stakes.find((stake) => stake.id === currentWard.stakeId) : undefined),
    [currentWard, db.stakes],
  );
  const [form, setForm] = useState<WardForm>(() => (currentWard ? formFromWard(currentWard) : emptyWardForm));

  const hasChanges = useMemo(() => {
    if (!currentWard) return false;
    const currentForm = formFromWard(currentWard);

    return Object.entries(currentForm).some(([key, value]) => form[key as keyof WardForm] !== value);
  }, [currentWard, form]);

  function updateField(field: keyof WardForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    if (!currentWard || !canManageWard || !form.name.trim()) return;

    const nextWard: Ward = {
      ...currentWard,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
    };

    saveWard(nextWard);
    setForm(formFromWard(nextWard));
  }

  async function copyStakeRequest() {
    if (!currentWard) return;

    const message = `Olá, preciso que a ${currentWard.name} seja atrelada à estaca no Zionwise para fazer parte da organização da estaca.`;
    await navigator.clipboard?.writeText(message);
    toast.success("Mensagem de solicitação copiada.");
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
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ward-name">Nome da ala</Label>
                <Input disabled={!canManageWard} id="ward-name" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
              </div>

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
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Estaca</CardTitle>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-4">
                <div>
                  <p className="font-medium">Esta ala ainda não está atrelada a uma estaca.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Solicite ao líder da estaca para atrelar esta ala à estaca para fazer parte da organização.
                  </p>
                </div>
                <Button disabled={!currentWard} onClick={copyStakeRequest} variant="secondary">
                  <Copy className="size-4" />
                  Copiar solicitação
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}

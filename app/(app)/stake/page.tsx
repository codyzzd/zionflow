"use client";

import { Landmark, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Stake } from "@/types/domain";

type StakeForm = {
  name: string;
  city: string;
  state: string;
  country: string;
};

function formFromStake(stake: Stake): StakeForm {
  return {
    name: stake.name,
    city: stake.city,
    state: stake.state,
    country: stake.country,
  };
}

function StakeFormCard({
  canManageStake,
  onSave,
  stake,
}: {
  canManageStake: boolean;
  onSave: (stake: Stake) => void;
  stake: Stake;
}) {
  const [form, setForm] = useState<StakeForm>(() => formFromStake(stake));

  const hasChanges = useMemo(() => {
    const currentForm = formFromStake(stake);

    return Object.entries(currentForm).some(([key, value]) => form[key as keyof StakeForm] !== value);
  }, [stake, form]);

  function updateField(field: keyof StakeForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    if (!canManageStake || !form.name.trim()) return;

    const nextStake: Stake = {
      ...stake,
      name: form.name.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
    };

    onSave(nextStake);
    setForm(formFromStake(nextStake));
  }

  return (
    <>
      <PageHeader
        eyebrow="Estaca"
        title={stake.name}
        description="Dados institucionais usados como referência para a organização da estaca."
        actions={
          canManageStake ? (
            <Button disabled={!form.name.trim() || !hasChanges} onClick={handleSave} size="lg">
              <Save className="size-4" />
              Salvar
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Cadastro da estaca</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="stake-name">Nome da estaca</Label>
              <Input disabled={!canManageStake} id="stake-name" value={form.name} onChange={(event) => updateField("name", event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stake-city">Cidade</Label>
              <Input disabled={!canManageStake} id="stake-city" value={form.city} onChange={(event) => updateField("city", event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stake-state">Estado</Label>
              <Input disabled={!canManageStake} id="stake-state" value={form.state} onChange={(event) => updateField("state", event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stake-country">País</Label>
              <Input disabled={!canManageStake} id="stake-country" value={form.country} onChange={(event) => updateField("country", event.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function StakePage() {
  const { currentWard, db, hasPermission, saveStake } = useAppContext();
  const canManageStake = hasPermission("stake.manage");
  const currentStake = useMemo(
    () => (currentWard?.stakeId ? db.stakes.find((stake) => stake.id === currentWard.stakeId) : undefined),
    [currentWard, db.stakes],
  );

  return (
    <PermissionGuard permission="stake.view">
      <div className="mx-auto max-w-[800px]">
        {currentStake ? (
          <StakeFormCard key={currentStake.id} canManageStake={canManageStake} onSave={saveStake} stake={currentStake} />
        ) : (
          <>
            <PageHeader
              eyebrow="Estaca"
              title="Dados da estaca"
              description="Dados institucionais usados como referência para a organização da estaca."
            />

            <Card>
              <CardHeader>
                <CardTitle>Cadastro da estaca</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Landmark className="size-5" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">Esta ala ainda não está atrelada a uma estaca.</p>
                    <p className="text-sm text-muted-foreground">Assim que a ala for vinculada, os dados da estaca aparecerão aqui.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PermissionGuard>
  );
}

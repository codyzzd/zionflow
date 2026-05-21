"use client";

import { Building2, Landmark, LoaderCircle, LogOut, Search, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type OnboardingMode = "stake" | "ward" | "join";

const ONBOARDING_OPTIONS: Array<{
  mode: OnboardingMode;
  title: string;
  description: string;
  icon: typeof Landmark;
}> = [
  {
    mode: "stake",
    title: "Criar estaca",
    description: "Administrador da estaca",
    icon: Landmark,
  },
  {
    mode: "ward",
    title: "Criar ala",
    description: "Administrador da ala",
    icon: Building2,
  },
  {
    mode: "join",
    title: "Entrar em ala",
    description: "Vincular a uma ala existente",
    icon: Users,
  },
];

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export default function OnboardingPage() {
  const router = useRouter();
  const { completeStakeOnboarding, completeWardOnboarding, currentUser, db, joinExistingWard, ready } = useAppContext();
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [mode, setMode] = useState<OnboardingMode>("stake");
  const [stakeName, setStakeName] = useState("");
  const [wardName, setWardName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [wardSearch, setWardSearch] = useState("");
  const [selectedWardId, setSelectedWardId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (currentUser) {
      router.replace("/dashboard");
      return;
    }

    let cancelled = false;

    createClient()
      .auth.getUser()
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error || !data.user?.email) {
          router.replace("/login");
          return;
        }

        setAuthEmail(data.user.email);
        setAuthUserId(data.user.id);
        setCheckingAuth(false);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, ready, router]);

  const filteredWards = useMemo(() => {
    const search = normalizeSearch(wardSearch);

    return db.wards
      .map((ward) => ({
        ward,
        stakeName: db.stakes.find((stake) => stake.id === ward.stakeId)?.name ?? "",
      }))
      .filter(({ ward, stakeName }) => {
        if (!search) return true;

        return normalizeSearch(`${ward.name} ${stakeName} ${ward.city} ${ward.state}`).includes(search);
      })
      .slice(0, 8);
  }, [db.stakes, db.wards, wardSearch]);

  const canSubmit =
    ready &&
    Boolean(authEmail) &&
    !submitting &&
    ((mode === "stake" && stakeName.trim() && wardName.trim()) ||
      (mode === "ward" && stakeName.trim() && wardName.trim()) ||
      (mode === "join" && selectedWardId));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setSubmitting(true);

    try {
      const commonInput = {
        authUserId,
        stakeName,
        wardName,
        city,
        state,
      };
      const completed =
        mode === "stake"
          ? completeStakeOnboarding(authEmail, commonInput)
          : mode === "ward"
            ? completeWardOnboarding(authEmail, commonInput)
            : joinExistingWard(authEmail, selectedWardId, authUserId);

      if (!completed) {
        toast.error("Não foi possível finalizar a configuração inicial.");
        return;
      }

      toast.success("Acesso configurado.");
      router.push("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  if (!ready || checkingAuth) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando configuração...</div>;
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{authEmail}</p>
            <h1 className="text-2xl font-semibold tracking-normal">Configurar acesso</h1>
          </div>
          <Button type="button" variant="ghost" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {ONBOARDING_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = mode === option.mode;

            return (
              <button
                key={option.mode}
                className={cn(
                  "flex min-h-24 items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40",
                  selected && "border-primary bg-primary/5",
                )}
                type="button"
                onClick={() => setMode(option.mode)}
              >
                <span className={cn("rounded-md border bg-background p-2 text-muted-foreground", selected && "text-primary")}>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{option.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {mode === "stake" ? "Nova estaca" : mode === "ward" ? "Nova ala" : "Escolher ala"}
            </CardTitle>
            <CardDescription>
              {mode === "stake"
                ? "Informe a estaca e uma ala de referência."
                : mode === "ward"
                  ? "Informe a estaca e a ala."
                  : "Busque uma ala já cadastrada."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              {mode !== "join" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="stakeName">Nome da estaca</Label>
                    <Input
                      id="stakeName"
                      value={stakeName}
                      onChange={(event) => setStakeName(event.target.value)}
                      placeholder="Estaca Fortaleza"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wardName">{mode === "stake" ? "Ala de referência" : "Nome da ala"}</Label>
                    <Input
                      id="wardName"
                      value={wardName}
                      onChange={(event) => setWardName(event.target.value)}
                      placeholder="Ala Aldeota"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Fortaleza" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">Estado</Label>
                    <Input id="state" value={state} onChange={(event) => setState(event.target.value)} placeholder="CE" />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="wardSearch">Buscar ala</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="wardSearch"
                        className="pl-9"
                        value={wardSearch}
                        onChange={(event) => setWardSearch(event.target.value)}
                        placeholder="Nome da ala, estaca ou cidade"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {filteredWards.length ? (
                      filteredWards.map(({ ward, stakeName }) => (
                        <button
                          key={ward.id}
                          className={cn(
                            "rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/40",
                            selectedWardId === ward.id && "border-primary bg-primary/5",
                          )}
                          type="button"
                          onClick={() => setSelectedWardId(ward.id)}
                        >
                          <span className="block font-medium">{ward.name}</span>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            {[stakeName, ward.city, ward.state].filter(Boolean).join(" - ") || "Sem dados adicionais"}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma ala cadastrada.</div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit}>
                  {submitting ? <LoaderCircle className="size-4 animate-spin" /> : "Continuar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

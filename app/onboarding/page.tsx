"use client";

import { Building2, LoaderCircle, LogOut, Search } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { Ward } from "@/types/domain";

type WardStep = "search" | "create" | "similar";

type SimilarWard = {
  ward: Ward;
  stakeName: string;
};

const DEFAULT_COUNTRY = "Brasil";

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ala|estaca|da|de|do|das|dos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function organizationLocation(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" - ") || "Localidade não informada";
}

function isSimilarWard(searchName: string, candidateName: string, searchCity?: string, candidateCity?: string, searchState?: string, candidateState?: string) {
  const search = normalizeSearch(searchName);
  const candidate = normalizeSearch(candidateName);
  const sameCity = searchCity && candidateCity ? normalizeSearch(searchCity) === normalizeSearch(candidateCity) : true;
  const sameState = searchState && candidateState ? normalizeSearch(searchState) === normalizeSearch(candidateState) : true;

  if (!search || !candidate || !sameCity || !sameState) return false;
  if (search === candidate || search.includes(candidate) || candidate.includes(search)) return true;

  const searchWords = new Set(search.split(" ").filter((word) => word.length > 2));
  const candidateWords = candidate.split(" ").filter((word) => word.length > 2);

  return candidateWords.some((word) => searchWords.has(word));
}

export default function OnboardingPage() {
  const router = useRouter();
  const { completeWardOnboarding, currentUser, currentWard, db, joinExistingWard, logout, ready, resolveAuthenticatedUser } = useAppContext();
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [wardStep, setWardStep] = useState<WardStep>("search");
  const [wardSearch, setWardSearch] = useState("");
  const [wardName, setWardName] = useState("");
  const [wardCity, setWardCity] = useState("");
  const [wardState, setWardState] = useState("");
  const [wardCountry, setWardCountry] = useState(DEFAULT_COUNTRY);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveAuthEmail = currentUser?.email ?? authEmail;
  const effectiveAuthUserId = currentUser?.authUserId ?? authUserId;

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (currentUser?.status === "inactive") {
      createClient()
        .auth.signOut()
        .finally(() => {
          logout();
          router.replace("/login");
        });
      return;
    }

    if (currentUser && currentWard) {
      router.replace("/dashboard");
      return;
    }

    if (currentUser && !currentWard) {
      return;
    }

    let cancelled = false;

    const supabase = createClient();

    supabase
      .auth.getUser()
      .then(async ({ data, error }) => {
        if (cancelled) return;

        if (error || !data.user?.email) {
          router.replace("/login");
          return;
        }

        setAuthEmail(data.user.email);
        setAuthUserId(data.user.id);

        const resolution = resolveAuthenticatedUser({
          authUserId: data.user.id,
          email: data.user.email,
        });

        if (resolution.status === "inactive") {
          await supabase.auth.signOut();
          logout();
          router.replace("/login");
          return;
        }

        if (resolution.status === "found" && resolution.route === "/dashboard") {
          router.replace("/dashboard");
          return;
        }

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
  }, [currentUser, currentWard, logout, ready, resolveAuthenticatedUser, router]);

  const wardsWithStake = useMemo<SimilarWard[]>(() => {
    return db.wards.map((ward) => ({
      ward,
      stakeName: db.stakes.find((stake) => stake.id === ward.stakeId)?.name ?? "",
    }));
  }, [db.stakes, db.wards]);

  const filteredWards = useMemo(() => {
    const search = normalizeSearch(wardSearch);

    if (!search) return [];

    return wardsWithStake
      .filter(({ ward, stakeName }) =>
        normalizeSearch(`${ward.name} ${stakeName} ${ward.city} ${ward.state} ${ward.country}`).includes(search),
      )
      .slice(0, 8);
  }, [wardSearch, wardsWithStake]);

  const similarWards = useMemo(() => {
    return wardsWithStake
      .filter(({ ward }) => isSimilarWard(wardName, ward.name, wardCity, ward.city, wardState, ward.state))
      .slice(0, 5);
  }, [wardCity, wardName, wardState, wardsWithStake]);

  const canCreateWard = Boolean(
    ready && effectiveAuthEmail && wardName.trim() && wardCity.trim() && wardState.trim() && wardCountry.trim() && !submitting,
  );

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  function handlePrepareCreateWard(event?: FormEvent<HTMLFormElement>, forceCreate = false) {
    event?.preventDefault();

    if (!canCreateWard) return;

    if (!forceCreate && similarWards.length) {
      setWardStep("similar");
      return;
    }

    setConfirmOpen(true);
  }

  async function handleConfirmCreateWard() {
    if (!canCreateWard) return;

    setSubmitting(true);

    try {
      const completed = completeWardOnboarding(effectiveAuthEmail, {
        authUserId: effectiveAuthUserId,
        wardName,
        city: wardCity,
        state: wardState,
        country: wardCountry,
      });

      if (!completed) {
        toast.error("Não foi possível finalizar a configuração inicial.");
        return;
      }

      toast.success("Acesso configurado.");
      setConfirmOpen(false);
      router.push("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  function handleRequestWardAccess(wardId: string) {
    if (!effectiveAuthEmail || submitting) return;

    setSubmitting(true);

    try {
      const completed = joinExistingWard(effectiveAuthEmail, wardId, effectiveAuthUserId);

      if (!completed) {
        toast.error("Não foi possível entrar na ala.");
        return;
      }

      toast.success("Você entrou na ala.");
      router.push("/dashboard");
    } finally {
      setSubmitting(false);
    }
  }

  function renderWardCard({ ward, stakeName }: SimilarWard) {
    return (
      <div key={ward.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">{ward.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">{organizationLocation([stakeName, ward.city, ward.state, ward.country])}</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => handleRequestWardAccess(ward.id)}>
          Entrar
        </Button>
      </div>
    );
  }

  function renderSimilarWards() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Encontramos alas parecidas</CardTitle>
          <CardDescription>Revise os registros encontrados antes de criar outro cadastro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">{similarWards.map((item) => renderWardCard(item))}</div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setWardStep("create")}>
              Voltar
            </Button>
            <Button type="button" onClick={() => handlePrepareCreateWard(undefined, true)}>
              Criar mesmo assim
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderCreateWard() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nova ala</CardTitle>
          <CardDescription>Informe os dados da ala.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handlePrepareCreateWard}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wardName">Nome da ala</Label>
                <Input id="wardName" value={wardName} onChange={(event) => setWardName(event.target.value)} placeholder="ex: Ala Torre" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wardCity">Cidade</Label>
                <Input id="wardCity" value={wardCity} onChange={(event) => setWardCity(event.target.value)} placeholder="ex: Fortaleza" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wardState">Estado</Label>
                <Input id="wardState" value={wardState} onChange={(event) => setWardState(event.target.value)} placeholder="ex: CE" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wardCountry">País</Label>
                <Input id="wardCountry" value={wardCountry} onChange={(event) => setWardCountry(event.target.value)} placeholder="ex: Brasil" required />
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground md:col-span-2">
                Se você precisa de acesso em nível de estaca, entre primeiro por uma ala. Depois disso, solicite esse nível dentro do sistema.
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setWardStep("search")}>
                Voltar
              </Button>
              <Button type="submit" disabled={!canCreateWard}>
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : "Continuar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  function renderSearchWard() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Encontrar sua ala</CardTitle>
          <CardDescription>Busque sua ala para entrar ou criar uma nova.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="wardSearch">Buscar por nome da ala</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="wardSearch"
                className="pl-9"
                value={wardSearch}
                onChange={(event) => setWardSearch(event.target.value)}
                placeholder="ex: Ala Torre"
              />
            </div>
          </div>

          {wardSearch.trim() && filteredWards.length ? (
            <div className="grid gap-3">{filteredWards.map((item) => renderWardCard(item))}</div>
          ) : wardSearch.trim() ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">Nenhuma ala encontrada para essa busca.</p>
              <Button
                className="mt-4"
                type="button"
                variant="secondary"
                onClick={() => {
                  setWardName(wardSearch);
                  setWardStep("create");
                }}
              >
                Criar nova ala
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">Digite o nome da ala para buscar registros existentes.</p>
              <Button className="mt-4" type="button" variant="secondary" onClick={() => setWardStep("create")}>
                Criar nova ala
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!ready || (!currentUser && checkingAuth)) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando configuração...</div>;
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{effectiveAuthEmail}</p>
            <h1 className="text-2xl font-semibold tracking-normal">Configurar acesso</h1>
            <p className="mt-1 text-sm text-muted-foreground">Escolha uma ala existente ou crie uma nova.</p>
          </div>
          <Button type="button" variant="ghost" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>

        <div className="flex items-start gap-3 rounded-lg border bg-card p-4">
          <span className="rounded-md border bg-background p-2 text-primary">
            <Building2 className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">Ala</span>
            <span className="mt-1 block text-sm text-muted-foreground">O acesso padrão do sistema é feito por uma ala.</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              Acesso de estaca é solicitado depois, já dentro do sistema, após entrar em uma ala.
            </span>
          </span>
        </div>

        {wardStep === "similar" ? renderSimilarWards() : wardStep === "create" ? renderCreateWard() : renderSearchWard()}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar criação da ala</DialogTitle>
              <DialogDescription>Revise os dados antes de criar o cadastro.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm">
              <div>
                <p className="text-muted-foreground">Ala</p>
                <p className="font-medium">{wardName.trim()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Localidade</p>
                <p className="font-medium">{organizationLocation([wardCountry.trim(), wardState.trim(), wardCity.trim()])}</p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
                Voltar
              </Button>
              <Button type="button" disabled={!canCreateWard} onClick={handleConfirmCreateWard}>
                {submitting ? <LoaderCircle className="size-4 animate-spin" /> : "Confirmar e criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

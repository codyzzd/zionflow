"use client";

import { LockKeyhole, MapPinned, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoginPage() {
  const router = useRouter();
  const { currentUser, loginAs, ready, usersByWard, wards } = useAppContext();
  const [selectedUserId, setSelectedUserId] = useState("");
  const effectiveSelectedUserId = useMemo(() => selectedUserId || usersByWard[0]?.id || "", [selectedUserId, usersByWard]);

  useEffect(() => {
    if (ready && currentUser) {
      router.replace("/dashboard");
    }
  }, [currentUser, ready, router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-xl border bg-card">
          <div className="border-b p-4">
            <Badge className="mb-4 w-fit" variant="outline">
              MVP fake com `localStorage`
            </Badge>
            <h1 className="max-w-xl text-3xl font-semibold leading-tight">
              Gestão de ala com foco em liderança, organização e operação semanal.
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
              Navegação administrativa, módulos principais do PRD e persistência local para validar fluxo sem depender do banco.
            </p>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <ShieldCheck className="size-5" />
                <CardTitle className="text-base">RBAC pronto para crescer</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Perfis, permissões e overrides por usuário já modelados.
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <LockKeyhole className="size-5" />
                <CardTitle className="text-base">Login local simples</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Selecione um usuário demo e entre direto no contexto da ala.
              </CardContent>
            </Card>
            <Card className="shadow-none">
              <CardHeader className="pb-3">
                <MapPinned className="size-5" />
                <CardTitle className="text-base">Preparado para multi-ala</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                O seed já inclui mais de uma ala para validar expansão futura.
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Entrar no sistema</CardTitle>
            <CardDescription>Sem backend por enquanto: o acesso é simulado com perfis locais persistidos no navegador.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Usuário demo</p>
              <Select value={effectiveSelectedUserId} onValueChange={(value) => setSelectedUserId(value ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um usuário demo" />
                </SelectTrigger>
                <SelectContent>
                  {usersByWard.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name} • {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Alas disponíveis no seed</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {wards.map((ward) => (
                  <Badge key={ward.id}>{ward.name}</Badge>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={() => {
                if (!effectiveSelectedUserId) return;
                loginAs(effectiveSelectedUserId);
                router.push("/dashboard");
              }}
            >
              Entrar no Zionwise
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

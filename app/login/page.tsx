"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "create";

function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("pt-BR");
}

function getAuthErrorMessage(message: string) {
  const normalizedMessage = message.toLocaleLowerCase("pt-BR");

  if (normalizedMessage.includes("invalid login") || normalizedMessage.includes("invalid credentials")) {
    return "Email ou senha inválidos.";
  }

  if (normalizedMessage.includes("already registered") || normalizedMessage.includes("already been registered")) {
    return "Este email já tem uma conta. Use Entrar.";
  }

  if (normalizedMessage.includes("email address") && normalizedMessage.includes("invalid")) {
    return "Este email não foi aceito pelo Supabase. Use um email real.";
  }

  if (normalizedMessage.includes("rate limit") || normalizedMessage.includes("too many")) {
    return "O Supabase bloqueou novas tentativas por limite temporário. Aguarde alguns minutos e tente de novo.";
  }

  return message || "Não foi possível concluir a autenticação.";
}

export default function LoginPage() {
  const router = useRouter();
  const { currentUser, currentWard, logout, resolveAuthenticatedUser, ready } = useAppContext();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const canSubmit = normalizedEmail.includes("@") && password.length >= 6 && ready && !loading;

  useEffect(() => {
    if (ready && currentUser?.status === "inactive") {
      createClient()
        .auth.signOut()
        .finally(() => {
          logout();
          toast.error("Este usuário está inativo no sistema.");
        });
      return;
    }

    if (ready && currentUser && currentWard) {
      router.replace("/dashboard");
    }
    if (ready && currentUser && !currentWard) {
      router.replace("/onboarding");
    }
  }, [currentUser, currentWard, logout, ready, router]);

  useEffect(() => {
    if (!ready || currentUser) {
      return;
    }

    let cancelled = false;

    async function routeAuthenticatedUser() {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();

      if (cancelled || error || !data.user?.email) {
        return;
      }

      const authEmail = normalizeEmail(data.user.email);
      const resolution = resolveAuthenticatedUser({
        authUserId: data.user.id,
        email: authEmail,
      });

      if (resolution.status === "inactive") {
        await supabase.auth.signOut();
        logout();
        return;
      }

      if (resolution.status === "found") {
        router.replace(resolution.route);
        return;
      }

      router.replace("/onboarding");
    }

    routeAuthenticatedUser().catch((error) => {
      console.error("Failed to resolve authenticated user.", error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser, logout, ready, resolveAuthenticatedUser, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) return;

    setLoading(true);

    try {
      const supabase = createClient();

      if (mode === "create") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (error) {
          toast.error(getAuthErrorMessage(error.message));
          return;
        }

        if (data.session && data.user?.email) {
          const resolution = resolveAuthenticatedUser({
            authUserId: data.user.id,
            email: data.user.email,
            auditLogin: true,
          });

          if (resolution.status === "inactive") {
            await supabase.auth.signOut();
            logout();
            toast.error("Este usuário está inativo no sistema.");
            return;
          }

          toast.success("Conta criada.");
          router.push(resolution.status === "found" ? resolution.route : "/onboarding");
          return;
        }

        toast.info("Conta criada, mas o acesso não foi iniciado. Entre com seu email e senha.");
        setMode("login");
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        toast.error(getAuthErrorMessage(error.message));
        return;
      }

      const authUser = data.user;
      const resolution = authUser?.email
        ? resolveAuthenticatedUser({
            authUserId: authUser.id,
            email: authUser.email,
            auditLogin: true,
          })
        : { status: "missing" as const, route: "/onboarding" as const };

      if (resolution.status === "inactive") {
        await supabase.auth.signOut();
        logout();
        toast.error("Este usuário está inativo no sistema.");
        return;
      }

      if (resolution.status === "found") {
        router.push(resolution.route);
        return;
      }

      router.push("/onboarding");
    } catch (error) {
      console.error("Authentication failed.", error);
      const message = error instanceof Error ? error.message : "";
      toast.error(message ? `Não foi possível conectar ao Supabase: ${message}` : "Não foi possível conectar ao Supabase.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === "login" ? "Entrar" : "Criar conta"}</CardTitle>
          <CardDescription>{mode === "login" ? "Use seu email e senha para acessar." : "Cadastre email e senha para entrar no sistema."}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ex: voce@email.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  className="pr-10"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  required
                />
                <Button
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>

            <Button className="w-full" type="submit" disabled={!canSubmit}>
              {loading ? <LoaderCircle className="size-4 animate-spin" /> : mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>

          <div className="mt-4">
            <Button
              className="w-full"
              type="button"
              variant="ghost"
              onClick={() => {
                setMode((current) => (current === "login" ? "create" : "login"));
                setShowPassword(false);
              }}
            >
              {mode === "login" ? "Criar conta" : "Já tenho login"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

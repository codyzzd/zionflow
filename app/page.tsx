"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/components/providers/app-provider";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const { ready, currentUser, currentWard, resolveAuthenticatedUser } = useAppContext();

  useEffect(() => {
    if (!ready) return;
    if (currentUser && currentWard) {
      router.replace("/dashboard");
      return;
    }
    if (currentUser && !currentWard) {
      router.replace("/onboarding");
      return;
    }

    let cancelled = false;

    const supabase = createClient();

    supabase
      .auth.getUser()
      .then(async ({ data }) => {
        if (cancelled) return;

        if (!data.user?.email) {
          router.replace("/login");
          return;
        }

        const resolution = resolveAuthenticatedUser({
          authUserId: data.user.id,
          email: data.user.email,
        });

        if (resolution.status === "inactive") {
          await supabase.auth.signOut();
          router.replace("/login");
          return;
        }

        router.replace(resolution.route);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace("/login");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, currentWard, ready, resolveAuthenticatedUser, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando Zionwise...</div>;
}

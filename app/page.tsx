"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/components/providers/app-provider";
import { createClient } from "@/lib/supabase/client";

export default function HomePage() {
  const router = useRouter();
  const { ready, currentUser } = useAppContext();

  useEffect(() => {
    if (!ready) return;
    if (currentUser) {
      router.replace("/dashboard");
      return;
    }

    let cancelled = false;

    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled) return;
        router.replace(data.user?.email ? "/onboarding" : "/login");
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

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando Zionwise...</div>;
}

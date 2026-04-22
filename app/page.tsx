"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/components/providers/app-provider";

export default function HomePage() {
  const router = useRouter();
  const { ready, currentUser } = useAppContext();

  useEffect(() => {
    if (!ready) return;
    router.replace(currentUser ? "/dashboard" : "/login");
  }, [currentUser, ready, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando Zionwise...</div>;
}

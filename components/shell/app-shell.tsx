"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/client";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, currentWard, hasPermission, logout, ready, resolveAuthenticatedUser } = useAppContext();

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
      return;
    }

    if (currentUser && !currentWard) {
      router.replace("/onboarding");
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getUser()
      .then(async ({ data, error }) => {
        if (cancelled) return;

        if (error || !data.user?.email) {
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

        if (resolution.route === "/onboarding") {
          router.replace("/onboarding");
        }
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

  if (!ready || !currentUser || !currentWard) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando contexto da ala...</div>;
  }

  async function handleLogout() {
    await createClient().auth.signOut();
    logout();
    router.push("/login");
  }

  return (
    <SidebarProvider>
      <Sidebar className="border-sidebar-border" collapsible="icon">
        <SidebarNav
          currentPath={pathname}
          currentUser={currentUser}
          hasPermission={hasPermission}
          onLogout={handleLogout}
          wardName={currentWard.name}
        />
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <SidebarTrigger />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentWard.name}</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

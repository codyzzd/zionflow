"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, currentWard, logout, ready, resetDemoData } = useAppContext();

  useEffect(() => {
    if (ready && !currentUser) {
      router.replace("/login");
    }
  }, [currentUser, ready, router]);

  if (!ready || !currentUser || !currentWard) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Carregando contexto da ala...</div>;
  }

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <SidebarProvider>
      <Sidebar className="border-sidebar-border" collapsible="offcanvas">
        <SidebarNav
          currentPath={pathname}
          currentUser={currentUser}
          onLogout={handleLogout}
          onResetDemo={resetDemoData}
          wardName={currentWard.name}
        />
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{currentWard.name}</p>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}

"use client";

import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSystemAdmin } from "@/lib/system-access";

export function SystemAdminGuard({ children }: { children: ReactNode }) {
  const { currentUser } = useAppContext();

  if (isSystemAdmin(currentUser)) return <>{children}</>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Acesso restrito</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Somente Codyzzd pode acessar esta área administrativa do sistema.</CardContent>
    </Card>
  );
}

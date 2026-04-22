"use client";

import type { ReactNode } from "react";

import type { PermissionKey } from "@/types/domain";

import { useAppContext } from "@/components/providers/app-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PermissionGuard({
  permission,
  fallback,
  children,
}: {
  permission: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { hasPermission } = useAppContext();

  if (hasPermission(permission)) return <>{children}</>;

  return (
    fallback ?? (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Seu perfil não tem permissão para acessar ou editar esta área.
        </CardContent>
      </Card>
    )
  );
}

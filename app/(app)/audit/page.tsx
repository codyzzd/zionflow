"use client";

import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export default function AuditPage() {
  const { auditLogsByWard } = useAppContext();
  const [search, setSearch] = useState("");

  const logs = useMemo(
    () =>
      auditLogsByWard.filter((log) => {
        const text = `${log.action} ${log.module} ${log.itemLabel} ${log.summary}`.toLowerCase();
        return text.includes(search.toLowerCase());
      }),
    [auditLogsByWard, search],
  );

  return (
    <PermissionGuard permission="audit.view">
      <div>
        <PageHeader
          eyebrow="Auditoria"
          title="Log de ações"
          description="Rastreabilidade do MVP para login, membros, usuários, atas, agenda missionária e ronda."
        />

        <Card>
          <CardHeader>
            <CardTitle>Eventos recentes</CardTitle>
            <CardDescription>Busca rápida por ação, módulo ou item afetado.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input className="mb-4 max-w-md" placeholder="Buscar em logs" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Resumo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action}</Badge>
                    </TableCell>
                    <TableCell>{log.module}</TableCell>
                    <TableCell>{log.itemLabel}</TableCell>
                    <TableCell className="text-muted-foreground">{log.summary}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}

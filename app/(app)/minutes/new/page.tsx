"use client";

import Link from "next/link";

import { MinuteEditor } from "@/components/features/minutes/minute-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";

export default function NewMinutePage() {
  return (
    <PermissionGuard permission="minutes.manage">
      <div>
        <PageHeader
          eyebrow="Atas Sacramentais"
          title="Nova ata"
          description="Registro estruturado da reunião sacramental com edição e impressão futura."
          actions={
            <Button asChild variant="outline">
              <Link href="/minutes">Voltar</Link>
            </Button>
          }
        />
        <MinuteEditor mode="new" />
      </div>
    </PermissionGuard>
  );
}

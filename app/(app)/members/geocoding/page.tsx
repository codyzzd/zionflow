"use client";

import Link from "next/link";

import { MemberGeocodingWorkspace } from "@/components/features/members/member-geocoding-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";

export default function MemberGeocodingPage() {
  return (
    <PermissionGuard permission="members.manage">
      <div>
        <PageHeader
          eyebrow="Membros"
          title="Mapear endereços"
          description="Processamento em lote dos endereços dos membros para preencher latitude e longitude."
          actions={
            <Button asChild variant="outline">
              <Link href="/members">Voltar</Link>
            </Button>
          }
        />
        <MemberGeocodingWorkspace />
      </div>
    </PermissionGuard>
  );
}

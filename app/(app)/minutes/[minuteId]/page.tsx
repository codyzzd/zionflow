"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";

import { MinuteEditor } from "@/components/features/minutes/minute-editor";
import { useAppContext } from "@/components/providers/app-provider";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { useDateFormatter } from "@/hooks/use-date-formatter";

export default function MinuteDetailPage({ params }: { params: Promise<{ minuteId: string }> }) {
  const { minuteId } = use(params);
  const { minutesByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const minute = minutesByWard.find((item) => item.id === minuteId);

  if (!minute) notFound();

  return (
    <PermissionGuard permission="minutes.manage">
      <div className="mx-auto max-w-[800px]">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Link className="text-muted-foreground transition hover:text-foreground" href="/minutes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Atas Sacramentais</p>
          </div>
          <h1 className="mt-1 text-3xl font-semibold">{formatDate(minute.date)}</h1>
        </div>
        <MinuteEditor minute={minute} mode="edit" />
      </div>
    </PermissionGuard>
  );
}

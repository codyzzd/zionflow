"use client";

import { AlertTriangle, CalendarRange, FileText, ShieldCheck, Users } from "lucide-react";
import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { formatRelativeDay } from "@/lib/utils";
import type { PatrolSchedule } from "@/types/domain";

function resolveSacramentalMemberIds(schedule: PatrolSchedule) {
  if (schedule.sacramentalMemberIds?.length) return schedule.sacramentalMemberIds;
  return schedule.primaryPatrolMemberId ? [schedule.primaryPatrolMemberId] : [];
}

function resolveClassMemberIds(schedule: PatrolSchedule) {
  if (schedule.classMemberIds?.length) return schedule.classMemberIds;
  return schedule.secondaryPatrolMemberId ? [schedule.secondaryPatrolMemberId] : [];
}

function StatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-2 text-3xl tabular-nums">{value}</CardTitle>
        </div>
        <div className="rounded-lg bg-secondary p-2.5 text-primary">{icon}</div>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{helper}</CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentWard, lunchSchedulesByWard, membersByWard, minutesByWard, patrolMembersByWard, patrolSchedulesByWard, usersByWard } = useAppContext();
  const { formatDate } = useDateFormatter();

  const nextLunches = [...lunchSchedulesByWard].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 3);
  const nextPatrols = [...patrolSchedulesByWard].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const recentMinutes = [...minutesByWard].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const patrolMembersById = new Map(patrolMembersByWard.map((member) => [member.id, member]));
  const alerts = [
    ...lunchSchedulesByWard
      .filter((item) => item.status === "pending")
      .map((item) => `Almoço missionário pendente em ${formatDate(item.date)} às ${item.time}.`),
    ...patrolSchedulesByWard
      .filter((item) => !resolveSacramentalMemberIds(item).length || !resolveClassMemberIds(item).length)
      .map((item) => `Ronda em ${formatDate(item.date)} sem irmãos para sacramental ou aulas.`),
  ].slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow="Dashboard"
        title={currentWard ? `${currentWard.name}` : "Dashboard da Ala"}
        description="Visão rápida do que precisa de atenção nesta semana, com pendências operacionais, atas e agendas principais."
      />

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <StatCard title="Membros ativos" value={`${membersByWard.length}`} helper="Base pesquisável da ala" icon={<Users className="size-5" />} />
        <StatCard title="Usuários com acesso" value={`${usersByWard.filter((user) => user.status === "active").length}`} helper="Perfis ativos no sistema" icon={<ShieldCheck className="size-5" />} />
        <StatCard title="Atas registradas" value={`${minutesByWard.length}`} helper="Registros salvos da reunião sacramental" icon={<FileText className="size-5" />} />
        <StatCard title="Próximas escalas" value={`${patrolSchedulesByWard.length}`} helper="Escala de segurança organizada por data" icon={<CalendarRange className="size-5" />} />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Pendências e alertas</CardTitle>
            <CardDescription>Itens que merecem atenção imediata da liderança.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length ? (
              alerts.map((alert) => (
                <div key={alert} className="flex items-start gap-3 rounded-lg border bg-secondary/35 p-4 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 text-amber-600 dark:text-amber-400" />
                  <span>{alert}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border bg-secondary/35 p-4 text-sm text-muted-foreground">
                Nenhuma pendência crítica no momento.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Atas recentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentMinutes.map((minute) => (
              <div key={minute.id} className="rounded-lg border p-4">
                <p className="font-medium">{formatDate(minute.date)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos almoços missionários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextLunches.map((lunch) => (
              <div key={lunch.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{formatRelativeDay(lunch.date)}</p>
                  <Badge variant={lunch.status === "confirmed" ? "default" : "secondary"}>{lunch.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground tabular-nums">{`${formatDate(lunch.date)} às ${lunch.time}`}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximas rondas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextPatrols.map((schedule) => (
              <div key={schedule.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{formatRelativeDay(schedule.date)}</p>
                  <Badge variant={schedule.status === "confirmed" ? "default" : "outline"}>{schedule.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{formatDate(schedule.date)}</p>
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    Sacramental:{" "}
                    {resolveSacramentalMemberIds(schedule)
                      .map((id) => patrolMembersById.get(id)?.name)
                      .filter(Boolean)
                      .join(", ") || "sem irmãos"}
                  </p>
                  <p className="text-muted-foreground">
                    Aulas:{" "}
                    {resolveClassMemberIds(schedule)
                      .map((id) => patrolMembersById.get(id)?.name)
                      .filter(Boolean)
                      .join(", ") || "sem irmãos"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

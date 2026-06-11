"use client";

import { MapPin, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { memberActivityStatusLabels } from "@/components/features/members/member-visual-indicators";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Member } from "@/types/domain";

const MemberMapCanvas = dynamic(() => import("@/components/features/members/member-map-canvas").then((mod) => mod.MemberMapCanvas), {
  loading: () => <div className="flex min-h-[420px] items-center justify-center rounded-lg border text-sm text-muted-foreground">Carregando mapa...</div>,
  ssr: false,
});

type MappedMember = Member & { latitude: number; longitude: number };

const activityBadgeClassNames: Record<Member["churchActivityStatus"], string> = {
  away: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  attending: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  not_attending: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};

function isMappedMember(member: Member): member is MappedMember {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

export default function MembersMapPage() {
  const { currentWard, membersByWard } = useAppContext();
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [selectedMemberFocusKey, setSelectedMemberFocusKey] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const mappedMembers = useMemo(() => membersByWard.filter(isMappedMember), [membersByWard]);
  const unmappedMembers = useMemo(() => membersByWard.filter((member) => !isMappedMember(member)), [membersByWard]);

  function selectMember(member: Member) {
    setSelectedMemberId(member.id);
    setSelectedMemberFocusKey((current) => current + 1);
  }

  function enterFullScreen() {
    setFullScreen(true);
  }

  const stats = (
    <div className={cn("grid gap-3", fullScreen ? "grid-cols-3" : "md:grid-cols-3")}>
      <StatTile compact={fullScreen} icon={<Users className="size-4" />} label="Membros" value={membersByWard.length} />
      <StatTile compact={fullScreen} icon={<MapPin className="size-4 text-emerald-600" />} label="Mapeados" value={mappedMembers.length} />
      <StatTile compact={fullScreen} icon={<MapPin className="size-4 text-muted-foreground" />} label="Não mapeados" value={unmappedMembers.length} />
    </div>
  );

  const subtleStats = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span className="tabular-nums">{membersByWard.length} membros</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{mappedMembers.length} mapeados</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{unmappedMembers.length} não mapeados</span>
    </div>
  );

  const legend = <MapLegend />;

  const memberList = (
    <aside
      className={cn(
        "flex min-h-[420px] flex-col rounded-lg border bg-card",
        fullScreen ? "min-h-0 flex-1 shadow-xl" : "max-h-[calc(100dvh-26rem)] xl:h-full xl:min-h-0",
      )}
    >
      <div className={cn("border-b px-4", fullScreen ? "py-2.5" : "py-3")}>
        <p className="font-medium">Membros</p>
        <p className={cn("text-muted-foreground", fullScreen ? "text-[11px]" : "text-xs")}>
          {mappedMembers.length} mapeados, {unmappedMembers.length} não mapeados
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {membersByWard.length ? (
          <div className="space-y-2">
            {mappedMembers.map((member) => (
              <MemberListButton key={member.id} member={member} onSelect={selectMember} selected={member.id === selectedMemberId} />
            ))}

            {unmappedMembers.length ? (
              <div className="pt-2">
                <div className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">Não mapeados</div>
                <div className="space-y-2">
                  {unmappedMembers.map((member) => (
                    <MemberListButton key={member.id} member={member} onSelect={selectMember} selected={member.id === selectedMemberId} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">Nenhum membro cadastrado.</div>
        )}
      </div>
    </aside>
  );

  if (fullScreen) {
    return (
      <PermissionGuard permission="map.view">
        <div className="member-map-fullscreen fixed inset-0 z-40 isolate bg-background">
          <div className="absolute inset-0 z-0">
            <MemberMapCanvas
              members={mappedMembers}
              onSelectMember={setSelectedMemberId}
              selectedMemberFocusKey={selectedMemberFocusKey}
              selectedMemberId={selectedMemberId}
            />
          </div>
          <div className="absolute right-4 top-4 z-[1000] flex gap-2">
            <Button className={panelCollapsed ? "" : "hidden"} onClick={() => setPanelCollapsed(false)} size="icon" variant="secondary">
              <PanelLeftOpen />
              <span className="sr-only">Mostrar painel</span>
            </Button>
          </div>
          <div
            className={cn(
              "absolute right-4 top-4 z-[1000] flex max-h-[calc(100vh-2rem)] w-[min(390px,calc(100vw-2rem))] flex-col gap-3 transition-transform",
              panelCollapsed && "translate-x-[calc(100%+2rem)]",
            )}
          >
            <div className="rounded-lg border bg-card/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">Mapa de membros</p>
                  <p className="text-xs text-muted-foreground">{currentWard?.name ?? "Ala atual"}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button onClick={() => setPanelCollapsed(true)} size="icon-sm" variant="ghost">
                    <PanelLeftClose />
                    <span className="sr-only">Recolher painel</span>
                  </Button>
                  <Button onClick={() => setFullScreen(false)} size="icon-sm" variant="ghost">
                    <Minimize2 />
                    <span className="sr-only">Sair da tela cheia</span>
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {subtleStats}
                {legend}
              </div>
            </div>
            {memberList}
          </div>
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="map.view">
      <div>
        <PageHeader
          eyebrow="Mapa"
          title="Mapa de membros"
          description={currentWard ? `Visualização territorial da ${currentWard.name}.` : "Visualização territorial dos membros da ala."}
        />

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={enterFullScreen} variant="outline">
              <Maximize2 />
              Tela cheia
            </Button>
          </div>
          {stats}
          {legend}

          <div className="grid gap-4 xl:h-[calc(100dvh-22rem)] xl:min-h-[420px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MemberMapCanvas
              members={mappedMembers}
              onSelectMember={setSelectedMemberId}
              selectedMemberFocusKey={selectedMemberFocusKey}
              selectedMemberId={selectedMemberId}
            />
            {memberList}
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}

function StatTile({ compact, icon, label, value }: { compact?: boolean; icon: ReactNode; label: string; value: number }) {
  return (
    <div className={cn("rounded-lg border bg-card px-4 py-3", compact && "px-3 py-2")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={cn("mt-2 font-semibold tabular-nums", compact ? "text-xl" : "text-2xl")}>{value}</p>
    </div>
  );
}

function MemberListButton({
  member,
  onSelect,
  selected,
}: {
  member: Member;
  onSelect: (member: Member) => void;
  selected: boolean;
}) {
  const mapped = isMappedMember(member);

  return (
    <div
      className={`rounded-md border px-3 py-2 transition hover:bg-muted/70 ${
        selected ? "border-primary bg-primary/5" : "border-transparent bg-background"
      }`}
    >
      <button className="w-full text-left" onClick={() => onSelect(member)} type="button">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.name}</p>
            <p className="truncate text-xs text-muted-foreground">{member.address || "Sem endereço informado"}</p>
          </div>
          <Badge
            className={activityBadgeClassNames[member.churchActivityStatus]}
            variant="outline"
          >
            {memberActivityStatusLabels[member.churchActivityStatus]}
          </Badge>
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <button className="truncate text-left" onClick={() => onSelect(member)} type="button">
          {mapped ? `${member.latitude}, ${member.longitude}` : "Não mapeado"}
        </button>
        <Link className="shrink-0 font-medium text-foreground hover:underline" href={`/members?member=${encodeURIComponent(member.id)}`}>
          Abrir
        </Link>
      </div>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 text-xs">
      <LegendItem className="bg-emerald-600" label="Frequentando" />
      <LegendItem className="bg-red-600" label="Não frequentando" />
      <LegendItem className="bg-zinc-500" label="Afastado" />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("size-3 rounded-full border border-white shadow-sm", className)} />
      {label}
    </span>
  );
}

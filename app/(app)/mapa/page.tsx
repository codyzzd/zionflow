"use client";

import { MapPin, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Search, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MEMBER_ORGANIZATION_OPTIONS, type Member } from "@/types/domain";

const MemberMapCanvas = dynamic(() => import("@/components/features/members/member-map-canvas").then((mod) => mod.MemberMapCanvas), {
  loading: () => <div className="flex min-h-[420px] items-center justify-center rounded-lg border text-sm text-muted-foreground">Carregando mapa...</div>,
  ssr: false,
});

type ActivityFilter = "all" | Member["churchActivityStatus"];
type MappingFilter = "all" | "mapped" | "unmapped";
type MappedMember = Member & { latitude: number; longitude: number };

const activityLabels: Record<Member["churchActivityStatus"], string> = {
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

const activityBadgeClassNames: Record<Member["churchActivityStatus"], string> = {
  attending: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  not_attending: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};
const mapSelectContentClassName = "z-[80]";

function isMappedMember(member: Member): member is MappedMember {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export default function MembersMapPage() {
  const { currentWard, membersByWard } = useAppContext();
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");
  const [organizationFilter, setOrganizationFilter] = useState("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [fullScreen, setFullScreen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const mappedMembers = useMemo(() => membersByWard.filter(isMappedMember), [membersByWard]);
  const unmappedMembers = useMemo(() => membersByWard.filter((member) => !isMappedMember(member)), [membersByWard]);

  const filteredMembers = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    return membersByWard.filter((member) => {
      const mapped = isMappedMember(member);
      const matchesSearch =
        !normalizedSearch ||
        member.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        member.address.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        member.organization.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      const matchesActivity = activityFilter === "all" || member.churchActivityStatus === activityFilter;
      const matchesOrganization = organizationFilter === "all" || member.organization === organizationFilter;
      const matchesMapping = mappingFilter === "all" || (mappingFilter === "mapped" ? mapped : !mapped);

      return matchesSearch && matchesActivity && matchesOrganization && matchesMapping;
    });
  }, [activityFilter, mappingFilter, membersByWard, organizationFilter, search]);

  const filteredMappedMembers = useMemo(() => filteredMembers.filter(isMappedMember), [filteredMembers]);
  const filteredUnmappedMembers = useMemo(() => filteredMembers.filter((member) => !isMappedMember(member)), [filteredMembers]);

  function selectMember(member: Member) {
    setSelectedMemberId(member.id);
  }

  const stats = (
    <div className={cn("grid gap-3", fullScreen ? "grid-cols-3" : "md:grid-cols-3")}>
      <StatTile compact={fullScreen} icon={<Users className="size-4" />} label="Membros" value={membersByWard.length} />
      <StatTile compact={fullScreen} icon={<MapPin className="size-4 text-emerald-600" />} label="Mapeados" value={mappedMembers.length} />
      <StatTile compact={fullScreen} icon={<MapPin className="size-4 text-muted-foreground" />} label="Não mapeados" value={unmappedMembers.length} />
    </div>
  );

  const filters = (
    <div className={cn("grid gap-3 rounded-lg border bg-card p-3", fullScreen ? "grid-cols-1" : "lg:grid-cols-[minmax(240px,1fr)_220px_220px_180px]")}>
      <div>
        <Label className="text-xs">Busca</Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nome, endereço ou organização" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <div>
        <Label className="text-xs">Condição</Label>
        <Select value={activityFilter} onValueChange={(value) => setActivityFilter(value as ActivityFilter)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={mapSelectContentClassName}>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="attending">Frequentando</SelectItem>
            <SelectItem value="not_attending">Não frequentando</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Organização</Label>
        <Select value={organizationFilter} onValueChange={setOrganizationFilter}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={mapSelectContentClassName}>
            <SelectItem value="all">Todas</SelectItem>
            {MEMBER_ORGANIZATION_OPTIONS.map((organization) => (
              <SelectItem key={organization} value={organization}>
                {organization}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Mapeamento</Label>
        <Select value={mappingFilter} onValueChange={(value) => setMappingFilter(value as MappingFilter)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={mapSelectContentClassName}>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="mapped">Mapeados</SelectItem>
            <SelectItem value="unmapped">Não mapeados</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const memberList = (
    <aside
      className={cn(
        "flex min-h-[420px] flex-col rounded-lg border bg-card",
        fullScreen ? "min-h-0 flex-1 shadow-xl" : "max-h-[calc(100dvh-26rem)] xl:h-full xl:min-h-0",
      )}
    >
      <div className="border-b px-4 py-3">
        <p className="font-medium">Membros filtrados</p>
        <p className="text-xs text-muted-foreground">
          {filteredMappedMembers.length} mapeados, {filteredUnmappedMembers.length} não mapeados
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filteredMembers.length ? (
          <div className="space-y-2">
            {filteredMappedMembers.map((member) => (
              <MemberListButton key={member.id} member={member} onSelect={selectMember} selected={member.id === selectedMemberId} />
            ))}

            {filteredUnmappedMembers.length ? (
              <div className="pt-2">
                <div className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">Não mapeados</div>
                <div className="space-y-2">
                  {filteredUnmappedMembers.map((member) => (
                    <MemberListButton key={member.id} member={member} onSelect={selectMember} selected={member.id === selectedMemberId} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[240px] items-center justify-center px-4 text-center text-sm text-muted-foreground">Nenhum membro encontrado com os filtros atuais.</div>
        )}
      </div>
    </aside>
  );

  if (fullScreen) {
    return (
      <PermissionGuard permission="map.view">
        <div className="member-map-fullscreen fixed inset-0 z-40 isolate bg-background">
          <div className="absolute inset-0 z-0">
            <MemberMapCanvas members={filteredMappedMembers} onSelectMember={setSelectedMemberId} selectedMemberId={selectedMemberId} />
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
                {stats}
                {filters}
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
            <Button onClick={() => setFullScreen(true)} variant="outline">
              <Maximize2 />
              Tela cheia
            </Button>
          </div>
          {stats}
          {filters}

          <div className="grid gap-4 xl:h-[calc(100dvh-26rem)] xl:min-h-[420px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MemberMapCanvas members={filteredMappedMembers} onSelectMember={setSelectedMemberId} selectedMemberId={selectedMemberId} />
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

function MemberListButton({ member, onSelect, selected }: { member: Member; onSelect: (member: Member) => void; selected: boolean }) {
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
          <Badge className={activityBadgeClassNames[member.churchActivityStatus]} variant="outline">
            {activityLabels[member.churchActivityStatus]}
          </Badge>
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <button className="truncate text-left" onClick={() => onSelect(member)} type="button">
          {mapped ? `${member.latitude}, ${member.longitude}` : "Não mapeado"}
        </button>
        <Link className="shrink-0 font-medium text-foreground hover:underline" href={`/members/${member.id}`}>
          Abrir
        </Link>
      </div>
    </div>
  );
}

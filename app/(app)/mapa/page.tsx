"use client";

import { ChevronDown, MapPin, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Search, SlidersHorizontal, Users } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { MemberDemographicPresetSelect } from "@/components/features/members/member-demographic-preset-select";
import { memberActivityStatusLabels } from "@/components/features/members/member-visual-indicators";
import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, normalizeDateInput } from "@/lib/utils";
import type { Member } from "@/types/domain";

const MemberMapCanvas = dynamic(() => import("@/components/features/members/member-map-canvas").then((mod) => mod.MemberMapCanvas), {
  loading: () => <div className="flex min-h-[420px] items-center justify-center rounded-lg border text-sm text-muted-foreground">Carregando mapa...</div>,
  ssr: false,
});

type MappedMember = Member & { latitude: number; longitude: number };
type ActivityStatusFilter = "all" | Member["churchActivityStatus"];
type MappingFilter = "all" | "mapped" | "unmapped";
type SexFilter = "all" | Member["sex"];

const activityBadgeClassNames: Record<Member["churchActivityStatus"], string> = {
  away: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  attending: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  not_attending: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300",
};
const mapSelectContentClassName = "z-[1100]";

function isMappedMember(member: Member): member is MappedMember {
  return typeof member.latitude === "number" && Number.isFinite(member.latitude) && typeof member.longitude === "number" && Number.isFinite(member.longitude);
}

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function calculateAge(birthDate: string) {
  const normalizedDate = normalizeDateInput(birthDate);
  if (!normalizedDate) return null;

  const today = new Date();
  const birth = new Date(`${normalizedDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function parseAgeFilterValue(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function matchesAgeRange(age: number | null, minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return true;
  if (age === null) return false;
  if (minimum !== null && age < minimum) return false;
  if (maximum !== null && age > maximum) return false;

  return true;
}

export default function MembersMapPage() {
  const { currentWard, membersByWard } = useAppContext();
  const [search, setSearch] = useState("");
  const [activityStatusFilter, setActivityStatusFilter] = useState<ActivityStatusFilter>("all");
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>("all");
  const [sexFilter, setSexFilter] = useState<SexFilter>("all");
  const [minimumAgeFilter, setMinimumAgeFilter] = useState("");
  const [maximumAgeFilter, setMaximumAgeFilter] = useState("");
  const [clusterEnabled, setClusterEnabled] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>();
  const [selectedMemberFocusKey, setSelectedMemberFocusKey] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [fullScreenFiltersOpen, setFullScreenFiltersOpen] = useState(false);
  const mappedMembers = useMemo(() => membersByWard.filter(isMappedMember), [membersByWard]);
  const unmappedMembers = useMemo(() => membersByWard.filter((member) => !isMappedMember(member)), [membersByWard]);
  const minimumAge = useMemo(() => parseAgeFilterValue(minimumAgeFilter), [minimumAgeFilter]);
  const maximumAge = useMemo(() => parseAgeFilterValue(maximumAgeFilter), [maximumAgeFilter]);
  const filteredMembers = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);

    return membersByWard.filter((member) => {
      const mapped = isMappedMember(member);
      const matchesSearch =
        !normalizedSearch ||
        member.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        member.address.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        member.phone.toLocaleLowerCase("pt-BR").includes(normalizedSearch);
      const matchesActivityStatus = activityStatusFilter === "all" || member.churchActivityStatus === activityStatusFilter;
      const matchesMapping = mappingFilter === "all" || (mappingFilter === "mapped" ? mapped : !mapped);
      const matchesSex = sexFilter === "all" || member.sex === sexFilter;
      const matchesAge = matchesAgeRange(calculateAge(member.birthDate), minimumAge, maximumAge);

      return matchesSearch && matchesActivityStatus && matchesMapping && matchesSex && matchesAge;
    });
  }, [activityStatusFilter, mappingFilter, maximumAge, membersByWard, minimumAge, search, sexFilter]);
  const filteredMappedMembers = useMemo(() => filteredMembers.filter(isMappedMember), [filteredMembers]);
  const filteredUnmappedMembers = useMemo(() => filteredMembers.filter((member) => !isMappedMember(member)), [filteredMembers]);

  function selectMember(member: Member) {
    setSelectedMemberId(member.id);
    setSelectedMemberFocusKey((current) => current + 1);
  }

  function enterFullScreen() {
    setFullScreenFiltersOpen(false);
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

  const filters = (
    <div
      className={cn(
        "grid items-end gap-3 rounded-lg border bg-card p-3",
        fullScreen ? "grid-cols-1" : "sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_140px_170px_110px_110px_150px_minmax(190px,auto)]",
      )}
    >
      <div>
        <Label className="text-xs">Busca</Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Nome, telefone ou endereço" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <MemberDemographicPresetSelect
        contentClassName={mapSelectContentClassName}
        filter={{ maximumAge: maximumAgeFilter, minimumAge: minimumAgeFilter, sex: sexFilter }}
        label="Preset"
        labelClassName="text-xs"
        onApply={(preset) => {
          setSexFilter(preset.sex);
          setMinimumAgeFilter(preset.minimumAge);
          setMaximumAgeFilter(preset.maximumAge);
        }}
        triggerClassName="mt-1"
      />
      <div>
        <Label className="text-xs">Sexo</Label>
        <Select value={sexFilter} onValueChange={(value) => setSexFilter(value as SexFilter)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={mapSelectContentClassName}>
            <SelectItem value="all">Todos os sexos</SelectItem>
            <SelectItem value="M">Masculino</SelectItem>
            <SelectItem value="F">Feminino</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Frequência</Label>
        <Select value={activityStatusFilter} onValueChange={(value) => setActivityStatusFilter(value as ActivityStatusFilter)}>
          <SelectTrigger className="mt-1 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className={mapSelectContentClassName}>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="attending">{memberActivityStatusLabels.attending}</SelectItem>
            <SelectItem value="not_attending">{memberActivityStatusLabels.not_attending}</SelectItem>
            <SelectItem value="away">{memberActivityStatusLabels.away}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Idade mín.</Label>
        <Input
          className="mt-1"
          inputMode="numeric"
          min={0}
          placeholder="Mín."
          type="number"
          value={minimumAgeFilter}
          onChange={(event) => setMinimumAgeFilter(event.target.value)}
        />
      </div>
      <div>
        <Label className="text-xs">Idade máx.</Label>
        <Input
          className="mt-1"
          inputMode="numeric"
          min={0}
          placeholder="Máx."
          type="number"
          value={maximumAgeFilter}
          onChange={(event) => setMaximumAgeFilter(event.target.value)}
        />
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
      <label className="flex h-10 items-center gap-3 rounded-md border bg-background px-3 text-sm">
        <Checkbox checked={clusterEnabled} onCheckedChange={(checked) => setClusterEnabled(checked === true)} />
        <span className="leading-tight">Agrupar pinos sobrepostos</span>
      </label>
    </div>
  );

  const fullScreenFilters = (
    <Collapsible className="group/map-filters" onOpenChange={setFullScreenFiltersOpen} open={fullScreenFiltersOpen}>
      <CollapsibleTrigger asChild>
        <Button className="h-9 w-full justify-between px-3 text-sm" variant="outline">
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4" />
            Filtros
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/map-filters:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{filters}</CollapsibleContent>
    </Collapsible>
  );

  const memberList = (
    <aside
      className={cn(
        "flex min-h-[420px] flex-col rounded-lg border bg-card",
        fullScreen ? "min-h-0 flex-1 shadow-xl" : "max-h-[calc(100dvh-26rem)] xl:h-full xl:min-h-0",
      )}
    >
      <div className={cn("border-b px-4", fullScreen ? "py-2.5" : "py-3")}>
        <p className="font-medium">Membros filtrados</p>
        <p className={cn("text-muted-foreground", fullScreen ? "text-[11px]" : "text-xs")}>
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
            <MemberMapCanvas
              clusterEnabled={clusterEnabled}
              members={filteredMappedMembers}
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
                {fullScreenFilters}
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
          {filters}
          {legend}

          <div className="grid gap-4 xl:h-[calc(100dvh-26rem)] xl:min-h-[420px] xl:grid-cols-[minmax(0,1fr)_360px]">
            <MemberMapCanvas
              clusterEnabled={clusterEnabled}
              members={filteredMappedMembers}
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

"use client";

import { Building2, BusFront, Eye, EyeOff, FileText, Handshake, KeyRound, Landmark, LayoutDashboard, Pencil, ShieldCheck, Utensils, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ACCESS_LEVEL_LABELS,
  ACCESS_MATRIX_AREA_GROUPS,
  accessLevelFromPermissions,
  permissionsForAccessLevel,
  type AccessArea,
  type AccessAreaIcon,
  type AccessLevel,
} from "@/lib/access-control";
import { cn } from "@/lib/utils";
import type { PermissionKey } from "@/types/domain";

const readOnlyAccessLevels: AccessLevel[] = ["hidden", "view"];
const editableAccessLevels: AccessLevel[] = ["hidden", "view", "edit"];

const accessLevelIcons: Record<AccessLevel, LucideIcon> = {
  hidden: EyeOff,
  view: Eye,
  edit: Pencil,
};

const accessAreaIcons: Record<AccessAreaIcon, LucideIcon> = {
  building: Building2,
  bus: BusFront,
  "file-text": FileText,
  handshake: Handshake,
  key: KeyRound,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  shield: ShieldCheck,
  utensils: Utensils,
  users: Users,
};

export function updateAreaAccess(permissions: PermissionKey[], area: AccessArea, level: AccessLevel) {
  const areaPermissions = [area.viewPermission, area.managePermission].filter(Boolean) as PermissionKey[];
  const nextPermissions = permissions.filter((permission) => !areaPermissions.includes(permission));

  return Array.from(new Set([...nextPermissions, ...permissionsForAccessLevel(area, level)]));
}

function AccessLevelButtonGroup({
  disabled,
  level,
  levels,
  onChange,
}: {
  disabled?: boolean;
  level: AccessLevel;
  levels: AccessLevel[];
  onChange: (level: AccessLevel) => void;
}) {
  return (
    <div aria-label="Nível de acesso" className="inline-flex w-fit rounded-md border bg-card p-0.5" role="group">
      {levels.map((accessLevel) => {
        const Icon = accessLevelIcons[accessLevel];
        const isActive = level === accessLevel;

        return (
          <Tooltip key={accessLevel}>
            <TooltipTrigger asChild>
              <Button
                aria-label={ACCESS_LEVEL_LABELS[accessLevel]}
                aria-pressed={isActive}
                className={cn(
                  "size-8 rounded-sm",
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                disabled={disabled}
                onClick={() => onChange(accessLevel)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{ACCESS_LEVEL_LABELS[accessLevel]}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function AccessMatrixEditor({
  disabled,
  onChange,
  permissions,
}: {
  disabled?: boolean;
  onChange: (permissions: PermissionKey[]) => void;
  permissions: PermissionKey[];
}) {
  return (
    <div className="space-y-4 rounded-lg bg-muted/30 p-2">
      {ACCESS_MATRIX_AREA_GROUPS.map((group) => (
        <section className="overflow-hidden rounded-lg border bg-card shadow-xs" key={group.id}>
          <div className="border-b bg-card px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
          </div>
          <div className="divide-y">
            {group.areas.map((area) => {
              const level = accessLevelFromPermissions(area, permissions);
              const availableAccessLevels = area.managePermission ? editableAccessLevels : readOnlyAccessLevels;
              const AreaIcon = accessAreaIcons[area.icon];

              return (
                <div className="grid gap-3 bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-center" key={area.id}>
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <AreaIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{area.label}</p>
                      <p className="text-xs text-muted-foreground">{area.description}</p>
                    </div>
                  </div>
                  <AccessLevelButtonGroup
                    disabled={disabled}
                    level={level}
                    levels={availableAccessLevels}
                    onChange={(accessLevel) => onChange(updateAreaAccess(permissions, area, accessLevel))}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

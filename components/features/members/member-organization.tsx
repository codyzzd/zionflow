"use client";

import type { LucideIcon } from "lucide-react";
import { GraduationCap, HeartHandshake, ShieldCheck, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";
import { MEMBER_ORGANIZATION_OPTIONS } from "@/types/domain";

type MemberOrganization = (typeof MEMBER_ORGANIZATION_OPTIONS)[number];

type MemberOrganizationVisual = {
  Icon: LucideIcon;
  iconClassName: string;
};

const memberOrganizationVisuals: Record<MemberOrganization, MemberOrganizationVisual> = {
  "Quorum de Elderes": {
    Icon: ShieldCheck,
    iconClassName: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30",
  },
  "Sociedade de Socorro": {
    Icon: HeartHandshake,
    iconClassName: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30",
  },
  "Rapazes e Moças": {
    Icon: UsersRound,
    iconClassName: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30",
  },
  "Jovens Adultos Solteiros": {
    Icon: GraduationCap,
    iconClassName:
      "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  },
};

const fallbackVisual: MemberOrganizationVisual = {
  Icon: UsersRound,
  iconClassName: "bg-muted text-muted-foreground ring-border",
};

function getMemberOrganizationVisual(organization: string): MemberOrganizationVisual {
  return memberOrganizationVisuals[organization as MemberOrganization] ?? fallbackVisual;
}

export function MemberOrganizationLabel({
  className,
  organization,
  placeholder = "Sem organização",
}: {
  className?: string;
  organization: string;
  placeholder?: string;
}) {
  const { Icon, iconClassName } = getMemberOrganizationVisual(organization);
  const label = organization || placeholder;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", !organization && "text-muted-foreground", className)}>
      <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-md ring-1", iconClassName)}>
        <Icon className="size-3.5" />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

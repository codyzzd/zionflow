"use client";

import { Building2, Landmark, ShieldCheck, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { USER_ACCESS_LEVEL_LABELS } from "@/lib/access-control";
import { cn } from "@/lib/utils";
import type { UserAccessLevel } from "@/types/domain";

type UserAccessLevelSelectProps = {
  levels: UserAccessLevel[];
  onValueChange: (value: UserAccessLevel) => void;
  value: UserAccessLevel;
};

type UserAccessLevelMeta = {
  description: string;
  Icon: LucideIcon;
  emphasisIcon?: LucideIcon;
};

const userAccessLevelMeta: Record<UserAccessLevel, UserAccessLevelMeta> = {
  stake_owner: {
    description: "Acesso principal da estaca",
    Icon: Landmark,
    emphasisIcon: ShieldCheck,
  },
  stake_leader: {
    description: "Apoio de liderança da estaca",
    Icon: Landmark,
    emphasisIcon: Users,
  },
  ward_owner: {
    description: "Acesso principal da ala",
    Icon: Building2,
    emphasisIcon: ShieldCheck,
  },
  ward_leader: {
    description: "Apoio de liderança da ala",
    Icon: Building2,
    emphasisIcon: Users,
  },
  member: {
    description: "Acesso padrão de membro",
    Icon: User,
  },
};

function UserAccessLevelOption({ compact = false, level }: { compact?: boolean; level: UserAccessLevel }) {
  const meta = userAccessLevelMeta[level];
  const Icon = meta.Icon;
  const EmphasisIcon = meta.emphasisIcon;

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          compact ? "size-6" : "size-8",
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-4"} />
        {EmphasisIcon ? (
          <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border border-popover bg-popover text-foreground">
            <EmphasisIcon className="size-2.5" />
          </span>
        ) : null}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate font-medium leading-5">{USER_ACCESS_LEVEL_LABELS[level]}</span>
        {!compact ? <span className="block truncate text-xs text-muted-foreground">{meta.description}</span> : null}
      </span>
    </div>
  );
}

export function UserAccessLevelSelect({ levels, onValueChange, value }: UserAccessLevelSelectProps) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as UserAccessLevel)}>
      <SelectTrigger className="h-10 w-full">
        <UserAccessLevelOption compact level={value} />
      </SelectTrigger>
      <SelectContent>
        {levels.map((level) => (
          <SelectItem className="py-2 pl-2 pr-8" key={level} textValue={USER_ACCESS_LEVEL_LABELS[level]} value={level}>
            <UserAccessLevelOption level={level} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { Mars, Pause, Play, Skull, Venus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Member } from "@/types/domain";

export const memberSexLabels: Record<Member["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

export const memberActivityStatusLabels: Record<Member["churchActivityStatus"], string> = {
  away: "Afastado",
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

const sexIconMeta: Record<Member["sex"], { className: string; icon: typeof Mars }> = {
  M: { className: "text-blue-500", icon: Mars },
  F: { className: "text-pink-500", icon: Venus },
};

const activityStatusIconMeta: Record<Member["churchActivityStatus"], { className: string; icon: typeof Play }> = {
  away: { className: "text-muted-foreground", icon: Skull },
  attending: { className: "text-emerald-600 dark:text-emerald-400", icon: Play },
  not_attending: { className: "text-red-600 dark:text-red-400", icon: Pause },
};

export const memberSexSurfaceClassNames: Record<Member["sex"], string> = {
  M: "bg-blue-50/80 ring-blue-200/70 hover:bg-blue-100/80 dark:bg-blue-950/25 dark:ring-blue-800/50 dark:hover:bg-blue-950/40",
  F: "bg-pink-50/80 ring-pink-200/70 hover:bg-pink-100/80 dark:bg-pink-950/25 dark:ring-pink-800/50 dark:hover:bg-pink-950/40",
};

export function MemberSexIcon({ className, sex }: { className?: string; sex: Member["sex"] }) {
  const meta = sexIconMeta[sex];
  const Icon = meta.icon;

  return (
    <span
      aria-label={memberSexLabels[sex]}
      className={cn("inline-flex size-5 shrink-0 items-center justify-center", meta.className, className)}
      title={memberSexLabels[sex]}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

export function MemberActivityStatusIcon({
  className,
  status,
}: {
  className?: string;
  status: Member["churchActivityStatus"];
}) {
  const meta = activityStatusIconMeta[status];
  const Icon = meta.icon;

  return (
    <span
      aria-label={memberActivityStatusLabels[status]}
      className={cn("inline-flex size-5 shrink-0 items-center justify-center", meta.className, className)}
      title={memberActivityStatusLabels[status]}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </span>
  );
}

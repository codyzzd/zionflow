import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export function PageHeader({
  backHref,
  backLabel = "Voltar",
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  backHref?: string;
  backLabel?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div>
        {backHref || eyebrow ? (
          <div className="flex items-center gap-2">
            {backHref ? (
              <Link
                aria-label={backLabel}
                className="relative text-muted-foreground transition-colors before:absolute before:-inset-3 before:content-[''] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                href={backHref}
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            ) : null}
            {eyebrow ? <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p> : null}
          </div>
        ) : null}
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
        {description ? <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

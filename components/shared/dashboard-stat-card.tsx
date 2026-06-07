import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type DashboardStatCardProps = {
  description: string;
  icon: ReactNode;
  title: string;
  value: ReactNode;
};

export function DashboardStatCard({
  description,
  icon,
  title,
  value,
}: DashboardStatCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardDescription className="text-balance">{title}</CardDescription>
          <CardTitle className="mt-1.5 text-3xl leading-none tabular-nums">
            {value}
          </CardTitle>
        </div>
        <CardAction className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary [&_svg]:shrink-0">
          {icon}
        </CardAction>
      </CardHeader>
      <CardContent className="text-pretty text-sm text-muted-foreground">
        {description}
      </CardContent>
    </Card>
  );
}

"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TableActionButtonProps = Omit<React.ComponentProps<typeof Button>, "size"> & {
  label: string;
  tooltip?: React.ReactNode;
  size?: Extract<React.ComponentProps<typeof Button>["size"], "icon" | "icon-sm" | "icon-xs" | "icon-lg">;
};

function TableActionButton({
  "aria-label": ariaLabel,
  children,
  className,
  label,
  size = "icon",
  tooltip,
  variant = "ghost",
  ...props
}: TableActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button aria-label={ariaLabel ?? label} className={cn("relative after:absolute after:-inset-1 after:content-['']", className)} size={size} variant={variant} {...props}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}

export { TableActionButton };

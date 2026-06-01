"use client";

import { Slot } from "@radix-ui/react-slot";
import type * as React from "react";

import { cn } from "@/lib/utils";

type TablePrimaryActionProps = React.ComponentProps<"button"> & {
  asChild?: boolean;
};

function TablePrimaryAction({ asChild, className, type = "button", ...props }: TablePrimaryActionProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex max-w-full items-center rounded-sm text-left font-medium text-foreground underline-offset-4 transition-[color,text-decoration-color,box-shadow] hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}

export { TablePrimaryAction };

"use client";

import * as React from "react";

import { XIcon } from "lucide-react";
import { Drawer as DrawerPrimitive } from "vaul";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DrawerDirection = "top" | "right" | "bottom" | "left";

function Drawer({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />;
}

function DrawerTrigger({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/20 transition-opacity supports-backdrop-filter:backdrop-blur-xs",
        className,
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  direction = "bottom",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  direction?: DrawerDirection;
  showCloseButton?: boolean;
}) {
  const directionStyles: Record<DrawerDirection, string> = {
    top: "inset-x-0 top-0 border-b rounded-b-2xl",
    right: "inset-y-0 right-0 h-full w-full border-l sm:max-w-2xl",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] border-t rounded-t-2xl",
    left: "inset-y-0 left-0 h-full w-full border-r sm:max-w-2xl",
  };

  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col bg-background text-foreground shadow-lg outline-none",
          directionStyles[direction],
          className,
        )}
        data-direction={direction}
        data-slot="drawer-content"
        {...props}
      >
        {direction === "bottom" ? <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" /> : null}
        {children}
        {showCloseButton ? (
          <DrawerPrimitive.Close asChild>
            <Button className="absolute top-3 right-3" size="icon-sm" variant="ghost">
              <XIcon />
              <span className="sr-only">Fechar</span>
            </Button>
          </DrawerPrimitive.Close>
        ) : null}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-4 pr-12", className)} data-slot="drawer-header" {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} data-slot="drawer-footer" {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title className={cn("text-base font-medium", className)} data-slot="drawer-title" {...props} />;
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-sm text-muted-foreground", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};

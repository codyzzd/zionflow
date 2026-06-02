"use client";

import type * as React from "react";
import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type DeleteConfirmationDialogProps = {
  children: React.ReactElement;
  confirmLabel?: string;
  description?: React.ReactNode;
  onConfirm: () => void;
  title?: string;
};

function DeleteConfirmationDialog({
  children,
  confirmLabel = "Excluir",
  description = "Essa ação não pode ser desfeita.",
  onConfirm,
  title = "Confirmar exclusão",
}: DeleteConfirmationDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30" onClick={onConfirm}>
            <Trash2 />
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DeleteTableActionButtonProps = {
  "aria-label"?: string;
  className?: string;
  confirmLabel?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  label: string;
  onConfirm: () => void;
  size?: Extract<React.ComponentProps<typeof Button>["size"], "icon" | "icon-sm" | "icon-xs" | "icon-lg">;
  title?: string;
  tooltip?: React.ReactNode;
};

function DeleteTableActionButton({
  "aria-label": ariaLabel,
  className,
  confirmLabel,
  description,
  disabled,
  label,
  onConfirm,
  size = "icon",
  title,
  tooltip,
}: DeleteTableActionButtonProps) {
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              aria-label={ariaLabel ?? label}
              className={cn("relative after:absolute after:-inset-1 after:content-['']", className)}
              disabled={disabled}
              size={size}
              variant="destructive"
            >
              <Trash2 />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltip ?? label}</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? "Confirmar exclusão"}</AlertDialogTitle>
          <AlertDialogDescription>{description ?? "Essa ação não pode ser desfeita."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30" onClick={onConfirm}>
            <Trash2 />
            {confirmLabel ?? "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { DeleteConfirmationDialog, DeleteTableActionButton };

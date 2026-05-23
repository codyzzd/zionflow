import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, onClick, ...props }: React.ComponentProps<"input">) {
  const isDateInput = type === "date"

  function handleClick(event: React.MouseEvent<HTMLInputElement>) {
    onClick?.(event)

    if (!isDateInput || event.defaultPrevented || props.disabled || props.readOnly) return

    try {
      event.currentTarget.showPicker?.()
    } catch {
      // Some browsers only allow the native picker from the built-in indicator.
    }
  }

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-card px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        isDateInput && "cursor-pointer pr-9 tabular-nums",
        className
      )}
      onClick={handleClick}
      {...props}
    />
  )
}

export { Input }

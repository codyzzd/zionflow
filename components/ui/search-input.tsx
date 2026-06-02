"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

function SearchInput({
  className,
  inputClassName,
  type = "search",
  ...props
}: React.ComponentProps<"input"> & {
  inputClassName?: string
}) {
  return (
    <div className={cn("relative w-full", className)}>
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input className={cn("pl-9", inputClassName)} type={type} {...props} />
    </div>
  )
}

export { SearchInput }

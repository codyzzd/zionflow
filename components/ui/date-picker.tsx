"use client"

import * as React from "react"
import { CalendarIcon, XIcon } from "lucide-react"
import { ptBR } from "react-day-picker/locale"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, normalizeDateInput } from "@/lib/utils"

type DatePickerProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  clearable?: boolean
}

function isoToDate(value: string) {
  const normalized = normalizeDateInput(value)
  if (!normalized) return undefined

  const [year, month, day] = normalized.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function dateToIso(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatPickerDate(value: string) {
  const date = isoToDate(value)
  if (!date) return ""

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function DatePicker({ id, value, onChange, placeholder = "Selecionar data", disabled, className, clearable = true }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selectedDate = isoToDate(value)
  const formattedDate = value ? formatPickerDate(value) : ""

  return (
    <div className={cn("relative", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            data-empty={!formattedDate}
            className="w-full justify-start gap-2 pr-9 text-left font-normal tabular-nums data-[empty=true]:text-muted-foreground"
          >
            <CalendarIcon className="size-4 text-muted-foreground" />
            <span className="truncate">{formattedDate || placeholder}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return
              onChange(dateToIso(date))
              setOpen(false)
            }}
            captionLayout="dropdown"
            locale={ptBR}
          />
        </PopoverContent>
      </Popover>

      {clearable && value && !disabled ? (
        <button
          type="button"
          aria-label="Limpar data"
          className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation()
            onChange("")
          }}
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

export { DatePicker }

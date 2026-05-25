"use client";

import { ChevronsUpDown, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { HybridField } from "@/types/domain";

type Option = {
  value: string;
  label: string;
  searchValue?: string;
};

const SEARCH_COLLATOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function getOptionSearchText(option: Option) {
  return normalizeSearchValue(`${option.label} ${option.searchValue ?? ""}`);
}

function getOptionPrimaryToken(option: Option) {
  const source = option.searchValue?.trim() || option.label.trim();
  return normalizeSearchValue(source.split(/\s+/)[0] ?? "");
}

function getOptionRank(option: Option, normalizedQuery: string) {
  const primaryToken = getOptionPrimaryToken(option);
  const searchText = getOptionSearchText(option);
  const isNumericQuery = /^\d+[a-z]?$/i.test(normalizedQuery);

  if (isNumericQuery) {
    if (primaryToken === normalizedQuery) return 0;
    if (primaryToken.startsWith(normalizedQuery)) return 1;
    if (primaryToken.includes(normalizedQuery)) return 2;
  }

  if (searchText.startsWith(normalizedQuery)) return 3;
  if (searchText.includes(normalizedQuery)) return 4;

  return Number.POSITIVE_INFINITY;
}

export function HybridSelector({
  label,
  value,
  options,
  onChange,
  manualPlaceholder,
  manualOptionLabel = "Manual",
  disabled = false,
}: {
  label: string;
  value: HybridField;
  options: Option[];
  onChange: (value: HybridField) => void;
  manualPlaceholder: string;
  manualOptionLabel?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftQuery, setDraftQuery] = useState("");

  const selectedOption = useMemo(() => options.find((option) => option.value === value.linkedId), [options, value.linkedId]);
  const displayValue = value.mode === "manual" ? value.manualValue ?? "" : selectedOption?.label ?? "";
  const trimmedQuery = draftQuery.trim();

  const matchingOption = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(trimmedQuery);
    if (!normalizedQuery) return undefined;

    return options.find((option) => {
      const values = [option.label, option.searchValue ?? "", getOptionPrimaryToken(option)].map(normalizeSearchValue);
      return values.some((item) => item === normalizedQuery);
    });
  }, [options, trimmedQuery]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(trimmedQuery);

    if (!normalizedQuery) {
      return options.slice(0, 8);
    }

    return options
      .map((option, index) => ({ index, option, rank: getOptionRank(option, normalizedQuery) }))
      .filter((item) => Number.isFinite(item.rank))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;

        const primaryTokenSort = SEARCH_COLLATOR.compare(getOptionPrimaryToken(a.option), getOptionPrimaryToken(b.option));
        if (primaryTokenSort !== 0) return primaryTokenSort;

        const labelSort = SEARCH_COLLATOR.compare(a.option.label, b.option.label);
        return labelSort || a.index - b.index;
      })
      .map((item) => item.option)
      .slice(0, 8);
  }, [options, trimmedQuery]);

  function selectLinkedOption(option: Option) {
    setDraftQuery(option.label);
    setIsOpen(false);
    onChange({
      mode: "linked",
      linkedId: option.value,
      manualValue: "",
    });
  }

  function selectManualValue() {
    if (!trimmedQuery) return;

    setDraftQuery(trimmedQuery);
    setIsOpen(false);
    onChange({
      mode: "manual",
      linkedId: "",
      manualValue: trimmedQuery,
    });
  }

  function handleInputChange(nextValue: string) {
    setDraftQuery(nextValue);

    if (value.mode === "manual") {
      onChange({
        mode: "manual",
        linkedId: "",
        manualValue: nextValue,
      });
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open) {
            setDraftQuery(displayValue);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button className="w-full justify-between" disabled={disabled} variant="outline">
            <span className={cn("truncate", !displayValue && "text-muted-foreground")}>{displayValue || manualPlaceholder}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-(--anchor-width) p-0">
          <Command shouldFilter={false}>
            <CommandInput placeholder={manualPlaceholder} value={draftQuery} onValueChange={handleInputChange} />
            <CommandList>
              {filteredOptions.length === 0 ? <CommandEmpty>Nenhum cadastro encontrado.</CommandEmpty> : null}

              {filteredOptions.length > 0 ? (
                <CommandGroup heading="Cadastros">
                  {filteredOptions.map((option) => {
                    const isSelected = value.mode === "linked" && value.linkedId === option.value;

                    return (
                      <CommandItem
                        key={option.value}
                        data-checked={isSelected}
                        value={`${option.searchValue ?? option.label} ${option.value}`}
                        onSelect={() => selectLinkedOption(option)}
                      >
                        <span className="flex-1">{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}

              {trimmedQuery && !matchingOption ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Manual">
                    <CommandItem data-checked={value.mode === "manual"} value={`manual ${trimmedQuery}`} onSelect={selectManualValue}>
                      <Clock3 className="size-4 shrink-0" />
                      <span className="flex-1">
                        {manualOptionLabel} - {trimmedQuery}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

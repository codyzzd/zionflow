"use client";

import type { Member } from "@/types/domain";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type MemberDemographicFilter = {
  maximumAge: string;
  minimumAge: string;
  sex: "all" | Member["sex"];
};

type MemberDemographicPreset = MemberDemographicFilter & {
  key: string;
  label: string;
};

const memberDemographicPresets: MemberDemographicPreset[] = [
  { key: "elders_quorum", label: "Quórum de Élderes", sex: "M", minimumAge: "18", maximumAge: "" },
  { key: "relief_society", label: "Sociedade de Socorro", sex: "F", minimumAge: "18", maximumAge: "" },
  { key: "primary", label: "Primária", sex: "all", minimumAge: "", maximumAge: "11" },
  { key: "youth", label: "Jovens", sex: "all", minimumAge: "12", maximumAge: "17" },
  { key: "young_men", label: "Rapazes", sex: "M", minimumAge: "12", maximumAge: "17" },
  { key: "young_women", label: "Moças", sex: "F", minimumAge: "12", maximumAge: "17" },
  { key: "ysa", label: "JAS", sex: "all", minimumAge: "18", maximumAge: "35" },
  { key: "sa", label: "MAS", sex: "all", minimumAge: "36", maximumAge: "" },
];

const emptyDemographicFilter: MemberDemographicFilter = {
  maximumAge: "",
  minimumAge: "",
  sex: "all",
};

function normalizeAgeFilter(value: string) {
  return value.trim();
}

function resolvePresetValue(filter: MemberDemographicFilter) {
  const minimumAge = normalizeAgeFilter(filter.minimumAge);
  const maximumAge = normalizeAgeFilter(filter.maximumAge);

  if (filter.sex === "all" && !minimumAge && !maximumAge) return "all";

  return (
    memberDemographicPresets.find(
      (preset) =>
        preset.sex === filter.sex &&
        preset.minimumAge === minimumAge &&
        preset.maximumAge === maximumAge,
    )?.key ?? "custom"
  );
}

export function MemberDemographicPresetSelect({
  className,
  contentClassName,
  filter,
  forceCustom = false,
  label = "Preset",
  labelClassName,
  onApply,
  triggerClassName,
}: {
  className?: string;
  contentClassName?: string;
  filter: MemberDemographicFilter;
  forceCustom?: boolean;
  label?: string;
  labelClassName?: string;
  onApply: (filter: MemberDemographicFilter) => void;
  triggerClassName?: string;
}) {
  const selectedValue = forceCustom ? "custom" : resolvePresetValue(filter);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className={labelClassName}>{label}</Label>
      <Select
        value={selectedValue}
        onValueChange={(value) => {
          if (value === "custom") return;
          if (value === "all") {
            onApply(emptyDemographicFilter);
            return;
          }

          const preset = memberDemographicPresets.find((item) => item.key === value);
          if (preset) {
            onApply({
              maximumAge: preset.maximumAge,
              minimumAge: preset.minimumAge,
              sex: preset.sex,
            });
          }
        }}
      >
        <SelectTrigger className={cn("w-full", triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          <SelectItem value="all">Sem preset</SelectItem>
          {selectedValue === "custom" ? (
            <SelectItem disabled value="custom">
              Personalizado
            </SelectItem>
          ) : null}
          {memberDemographicPresets.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

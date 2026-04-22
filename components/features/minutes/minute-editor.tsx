"use client";

import { Printer, Save } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useAppContext } from "@/components/providers/app-provider";
import { HybridSelector } from "@/components/shared/hybrid-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn } from "@/lib/utils";
import type { HybridField, SacramentMinute } from "@/types/domain";

type MinutePrintItem = {
  label: string;
  value: string | number;
  wide?: boolean;
};

type MinutePrintSection = {
  title: string;
  items: MinutePrintItem[];
};

type MinutePrintSettings = {
  fontSize: number;
  sectionGap: number;
};

type MinuteEditorStep = "edit" | "preview";

const subscribeToPrintPortal = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const defaultPrintSettings: MinutePrintSettings = {
  fontSize: 11.5,
  sectionGap: 6,
};

export function MinuteEditor({
  minute,
  mode,
}: {
  minute?: SacramentMinute;
  mode: "new" | "edit";
}) {
  const router = useRouter();
  const { currentUser, currentWard, db, membersByWard, saveMinute } = useAppContext();
  const { formatDate, formatDateTime } = useDateFormatter();

  function buildMinuteTitle(date: string) {
    return `Ata sacramental - ${formatDate(date)}`;
  }
  const isPrintPortalReady = useSyncExternalStore(subscribeToPrintPortal, getClientSnapshot, getServerSnapshot);
  const [printSettings, setPrintSettings] = useState<MinutePrintSettings>(defaultPrintSettings);
  const [editorStep, setEditorStep] = useState<MinuteEditorStep>("edit");
  const [form, setForm] = useState<SacramentMinute | null>(() => {
    if (minute) {
      return minute;
    }

    if (!currentUser || !currentWard) {
      return null;
    }

    return {
      id: "",
      wardId: currentWard.id,
      date: new Date().toISOString().slice(0, 10),
      title: buildMinuteTitle(new Date().toISOString().slice(0, 10)),
      status: "draft",
      presidency: "Bispado",
      responsibleUserId: currentUser.id,
      form: {
        presiding: { mode: "linked", linkedId: "", manualValue: "" },
        conducting: { mode: "linked", linkedId: "", manualValue: "" },
        recognitions: "",
        announcements: "",
        attendance: 0,
        conductor: { mode: "linked", linkedId: "", manualValue: "" },
        accompanist: { mode: "linked", linkedId: "", manualValue: "" },
        openingHymn: { mode: "linked", linkedId: "", manualValue: "" },
        openingPrayer: { mode: "linked", linkedId: "", manualValue: "" },
        releases: "",
        sustainings: "",
        priesthoodAdvancements: "",
        certificates: "",
        confirmations: "",
        childBlessings: "",
        sacramentHymn: { mode: "linked", linkedId: "", manualValue: "" },
        speaker1: { mode: "linked", linkedId: "", manualValue: "" },
        speaker2: { mode: "linked", linkedId: "", manualValue: "" },
        intermediateHymn: { mode: "linked", linkedId: "", manualValue: "" },
        speaker3: { mode: "linked", linkedId: "", manualValue: "" },
        closingHymn: { mode: "linked", linkedId: "", manualValue: "" },
        closingPrayer: { mode: "linked", linkedId: "", manualValue: "" },
        notes: "",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versionIds: [],
    };
  });

  const memberOptions = useMemo(
    () =>
      membersByWard.map((member) => ({
        value: member.id,
        label: `${member.name} • ${member.organization}`,
      })),
    [membersByWard],
  );

  const presidingMemberOptions = useMemo(
    () =>
      membersByWard
        .filter((member) => member.canPreside)
        .map((member) => ({
          value: member.id,
          label: `${member.name} • ${member.organization}`,
        })),
    [membersByWard],
  );

  const conductingMemberOptions = useMemo(
    () =>
      membersByWard
        .filter((member) => member.canConduct)
        .map((member) => ({
          value: member.id,
          label: `${member.name} • ${member.organization}`,
        })),
    [membersByWard],
  );

  const speakerMemberOptions = useMemo(
    () =>
      membersByWard
        .filter((member) => member.canSpeak)
        .map((member) => ({
          value: member.id,
          label: `${member.name} • ${member.organization} • ${member.sacramentTalkDuration} min`,
        })),
    [membersByWard],
  );

  const hymnOptions = useMemo(
    () =>
      db.hymns.map((hymn) => ({
        value: hymn.id,
        label: `Hino ${hymn.number} - ${hymn.title}`,
      })),
    [db.hymns],
  );

  if (!form) {
    return <div className="text-sm text-muted-foreground">Carregando formulário...</div>;
  }

  const currentForm = form;
  const versions = minute ? db.minuteVersions.filter((item) => item.minuteId === minute.id) : [];

  function formatHybridField(field: HybridField, options: { value: string; label: string }[]) {
    if (field.mode === "manual") {
      return field.manualValue?.trim() || "-";
    }

    return options.find((option) => option.value === field.linkedId)?.label ?? "-";
  }

  const printSections: MinutePrintSection[] = [
    {
      title: "Saudações e boas-vindas",
      items: [
        { label: "Presidida por", value: formatHybridField(currentForm.form.presiding, presidingMemberOptions) },
        { label: "Dirigida por", value: formatHybridField(currentForm.form.conducting, conductingMemberOptions) },
        { label: "Frequência", value: currentForm.form.attendance || "-" },
        { label: "Reconhecimentos", value: currentForm.form.recognitions, wide: true },
        { label: "Anúncios", value: currentForm.form.announcements, wide: true },
      ],
    },
    {
      title: "Hino e oração",
      items: [
        { label: "Regente", value: formatHybridField(currentForm.form.conductor, memberOptions) },
        { label: "Instrumentista", value: formatHybridField(currentForm.form.accompanist, memberOptions) },
        { label: "Hino inicial", value: formatHybridField(currentForm.form.openingHymn, hymnOptions) },
        { label: "Oração inicial", value: formatHybridField(currentForm.form.openingPrayer, memberOptions) },
      ],
    },
    {
      title: "Chamados e ordenanças",
      items: [
        { label: "Desobrigações", value: currentForm.form.releases },
        { label: "Apoios", value: currentForm.form.sustainings },
        { label: "Avanço no sacerdócio", value: currentForm.form.priesthoodAdvancements },
        { label: "Entrega de certificado", value: currentForm.form.certificates },
        { label: "Confirmação batismal", value: currentForm.form.confirmations },
        { label: "Bênção de criança", value: currentForm.form.childBlessings },
      ],
    },
    {
      title: "Sacramento e oradores",
      items: [
        { label: "Hino sacramental", value: formatHybridField(currentForm.form.sacramentHymn, hymnOptions), wide: true },
        { label: "Primeiro orador", value: formatHybridField(currentForm.form.speaker1, speakerMemberOptions) },
        { label: "Segundo orador", value: formatHybridField(currentForm.form.speaker2, speakerMemberOptions) },
        { label: "Hino intermediário", value: formatHybridField(currentForm.form.intermediateHymn, hymnOptions) },
        { label: "Terceiro orador", value: formatHybridField(currentForm.form.speaker3, speakerMemberOptions) },
        { label: "Hino final", value: formatHybridField(currentForm.form.closingHymn, hymnOptions) },
        { label: "Última oração", value: formatHybridField(currentForm.form.closingPrayer, memberOptions) },
        { label: "Anotações gerais", value: currentForm.form.notes, wide: true },
      ],
    },
  ];

  function saveCurrentMinute() {
    if (!form) return;

    const savedId = saveMinute({
      id: form.id || undefined,
      wardId: form.wardId,
      title: buildMinuteTitle(form.date),
      date: form.date,
      status: form.status,
      presidency: form.presidency,
      responsibleUserId: form.responsibleUserId,
      form: form.form,
    });
    router.push(`/minutes/${savedId}`);
  }

  const printStyle = {
    "--minute-print-font-size": `${printSettings.fontSize}pt`,
    "--minute-print-section-gap": `${printSettings.sectionGap}mm`,
  } as CSSProperties;

  function renderPrintDocument(kind: "print" | "preview") {
    return (
      <div
        aria-hidden={kind === "print" ? "true" : undefined}
        aria-label={kind === "preview" ? "Prévia A4 da ata sacramental" : undefined}
        className={kind === "print" ? "minute-print-document hidden" : "minute-print-document"}
        data-minute-preview={kind === "preview" ? true : undefined}
        data-minute-print={kind === "print" ? true : undefined}
        style={printStyle}
      >
        <header className="minute-print-header">
          <div>
            <p className="minute-print-eyebrow">{currentWard?.name ?? "Ata sacramental"}</p>
            <h1>{formatDate(currentForm.date)}</h1>
          </div>
          <div className="minute-print-meta">
            <span>Ata sacramental</span>
          </div>
        </header>

        <main className="minute-print-body">
          {printSections.map((section) => {
            const items = section.items.filter((item) => String(item.value).trim() && item.value !== "-");

            if (items.length === 0) return null;

            return (
              <section key={section.title} className="minute-print-section">
                <h2>{section.title}</h2>
                <div className="minute-print-grid">
                  {items.map((item) => (
                    <div key={`${section.title}-${item.label}`} className={item.wide ? "minute-print-item minute-print-item-wide" : "minute-print-item"}>
                      <span>{item.label}</span>
                      <p>{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </main>
      </div>
    );
  }

  const printDocument = renderPrintDocument("print");

  function resetPrintSettings() {
    setPrintSettings(defaultPrintSettings);
  }

  function updatePrintSetting(key: keyof MinutePrintSettings, value: number) {
    setPrintSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function renderPrintSettingControl({
    label,
    min,
    max,
    step,
    suffix,
    settingKey,
  }: {
    label: string;
    min: number;
    max: number;
    step: number;
    suffix: string;
    settingKey: keyof MinutePrintSettings;
  }) {
    const value = printSettings[settingKey];

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`minute-print-${settingKey}`}>{label}</Label>
          <span className="min-w-14 text-right text-xs tabular-nums text-muted-foreground">
            {value.toFixed(step < 1 ? 1 : 0)}
            {suffix}
          </span>
        </div>
        <Input
          id={`minute-print-${settingKey}`}
          className="h-8 cursor-pointer px-0"
          max={max}
          min={min}
          onChange={(event) => updatePrintSetting(settingKey, Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
      </div>
    );
  }

  function renderPrintPreview() {
    return (
      <Card>
        <CardHeader className="flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Prévia da impressão</CardTitle>
            <CardDescription>Ajuste a folha antes de imprimir a ata.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEditorStep("edit")} type="button" variant="outline">
              Voltar para edição
            </Button>
            <Button onClick={resetPrintSettings} type="button" variant="outline">
              Restaurar padrão
            </Button>
            <Button onClick={() => window.print()} type="button" variant="secondary">
              <Printer className="size-4" />
              Imprimir
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {renderPrintSettingControl({
              label: "Tamanho da fonte",
              min: 8,
              max: 14,
              step: 0.5,
              suffix: "pt",
              settingKey: "fontSize",
            })}
            {renderPrintSettingControl({
              label: "Espaçamento das seções",
              min: 2,
              max: 12,
              step: 0.5,
              suffix: "mm",
              settingKey: "sectionGap",
            })}
          </div>

          <div className="minute-print-preview-viewport">
            <div className="minute-print-preview-scale">
              {renderPrintDocument("preview")}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {isPrintPortalReady ? createPortal(printDocument, document.body) : null}
      <div className="space-y-4">
        {mode === "edit" && editorStep === "preview" ? (
          renderPrintPreview()
        ) : (
          <>
            <Card>
              <CardHeader className="flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle>{mode === "new" ? "Nova ata sacramental" : "Editar ata sacramental"}</CardTitle>
                  <CardDescription>Campos híbridos aceitam seleção estruturada ou digitação manual, como definido no PRD.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveCurrentMinute}>
                    <Save className="size-4" />
                    Salvar
                  </Button>
                  {mode === "edit" ? (
                    <Button onClick={() => setEditorStep("preview")} variant="secondary">
                      Prévia da impressão
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="section-grid">
                <div>
                  <Label>Data</Label>
                  <Input type="date" value={form.date} onChange={(event) => setForm((current) => (current ? { ...current, date: event.target.value } : current))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saudações e boas-vindas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="section-grid">
                  <HybridSelector
                    label="Presidida por"
                    value={form.form.presiding}
                    options={presidingMemberOptions}
                    manualPlaceholder="Nome de quem presidiu"
                    manualOptionLabel="Temporário"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, presiding: value } } : current))}
                  />
                  <HybridSelector
                    label="Dirigida por"
                    value={form.form.conducting}
                    options={conductingMemberOptions}
                    manualPlaceholder="Nome de quem dirigiu"
                    manualOptionLabel="Temporário"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, conducting: value } } : current))}
                  />
                </div>
                <div className="section-grid">
                  <div>
                    <Label>Reconhecimentos</Label>
                    <Textarea
                      value={form.form.recognitions}
                      onChange={(event) =>
                        setForm((current) => (current ? { ...current, form: { ...current.form, recognitions: event.target.value } } : current))
                      }
                    />
                  </div>
                  <div>
                    <Label>Anúncios</Label>
                    <Textarea
                      value={form.form.announcements}
                      onChange={(event) =>
                        setForm((current) => (current ? { ...current, form: { ...current.form, announcements: event.target.value } } : current))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Frequência</Label>
                  <Input
                    type="number"
                    value={form.form.attendance}
                    onChange={(event) =>
                      setForm((current) =>
                        current ? { ...current, form: { ...current.form, attendance: Number(event.target.value) || 0 } } : current,
                      )
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hino e oração</CardTitle>
              </CardHeader>
              <CardContent className="section-grid">
                <HybridSelector
                  label="Regente"
                  value={form.form.conductor}
                  options={memberOptions}
                  manualPlaceholder="Nome do regente"
                  manualOptionLabel="Temporário"
                  onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, conductor: value } } : current))}
                />
                <HybridSelector
                  label="Instrumentista"
                  value={form.form.accompanist}
                  options={memberOptions}
                  manualPlaceholder="Nome do instrumentista"
                  manualOptionLabel="Temporário"
                  onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, accompanist: value } } : current))}
                />
                <HybridSelector
                  label="Hino inicial"
                  value={form.form.openingHymn}
                  options={hymnOptions}
                  manualPlaceholder="Digite o hino inicial"
                  onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, openingHymn: value } } : current))}
                />
                <HybridSelector
                  label="Oração inicial"
                  value={form.form.openingPrayer}
                  options={memberOptions}
                  manualPlaceholder="Nome da oração inicial"
                  manualOptionLabel="Temporário"
                  onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, openingPrayer: value } } : current))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Chamados e ordenanças</CardTitle>
              </CardHeader>
              <CardContent className="section-grid">
                {[
                  ["Desobrigações", "releases"],
                  ["Apoios", "sustainings"],
                  ["Avanço no sacerdócio", "priesthoodAdvancements"],
                  ["Entrega de certificado", "certificates"],
                  ["Confirmação batismal", "confirmations"],
                  ["Bênção de criança", "childBlessings"],
                ].map(([label, key]) => (
                  <div key={key}>
                    <Label>{label}</Label>
                    <Textarea
                      value={form.form[key as keyof typeof form.form] as string}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, form: { ...current.form, [key]: event.target.value } } : current,
                        )
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sacramento e oradores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <HybridSelector
                  label="Hino sacramental"
                  value={form.form.sacramentHymn}
                  options={hymnOptions}
                  manualPlaceholder="Digite o hino sacramental"
                  onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, sacramentHymn: value } } : current))}
                />
                <div className="section-grid">
                  <HybridSelector
                    label="Primeiro orador"
                    value={form.form.speaker1}
                    options={speakerMemberOptions}
                    manualPlaceholder="Primeiro orador"
                    manualOptionLabel="Temporário"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, speaker1: value } } : current))}
                  />
                  <HybridSelector
                    label="Segundo orador"
                    value={form.form.speaker2}
                    options={speakerMemberOptions}
                    manualPlaceholder="Segundo orador"
                    manualOptionLabel="Temporário"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, speaker2: value } } : current))}
                  />
                  <HybridSelector
                    label="Hino intermediário"
                    value={form.form.intermediateHymn}
                    options={hymnOptions}
                    manualPlaceholder="Digite o hino intermediário"
                    onChange={(value) =>
                      setForm((current) => (current ? { ...current, form: { ...current.form, intermediateHymn: value } } : current))
                    }
                  />
                  <HybridSelector
                    label="Terceiro orador"
                    value={form.form.speaker3}
                    options={speakerMemberOptions}
                    manualPlaceholder="Terceiro orador"
                    manualOptionLabel="Temporário"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, speaker3: value } } : current))}
                  />
                  <HybridSelector
                    label="Hino final"
                    value={form.form.closingHymn}
                    options={hymnOptions}
                    manualPlaceholder="Digite o hino final"
                    onChange={(value) => setForm((current) => (current ? { ...current, form: { ...current.form, closingHymn: value } } : current))}
                  />
                  <HybridSelector
                    label="Última oração"
                    value={form.form.closingPrayer}
                    options={memberOptions}
                    manualPlaceholder="Nome da última oração"
                    manualOptionLabel="Temporário"
                    onChange={(value) =>
                      setForm((current) => (current ? { ...current, form: { ...current.form, closingPrayer: value } } : current))
                    }
                  />
                </div>
                <div>
                  <Label>Anotações gerais</Label>
                  <Textarea
                    value={form.form.notes}
                    onChange={(event) => setForm((current) => (current ? { ...current, form: { ...current.form, notes: event.target.value } } : current))}
                  />
                </div>
              </CardContent>
            </Card>

            {mode === "edit" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Histórico de versões</CardTitle>
                  <CardDescription>Cada salvamento gera uma nova versão no log local.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {versions.map((version) => (
                    <div key={version.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">Salvo</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

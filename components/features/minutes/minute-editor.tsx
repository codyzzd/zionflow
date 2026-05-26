"use client";

import { Printer, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { HybridSelector } from "@/components/shared/hybrid-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { createEmptyMinuteForm } from "@/lib/demo-data";
import { createClient } from "@/lib/supabase/client";
import type { HybridField, MinuteFormData, SacramentMinute } from "@/types/domain";

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
type MinuteCollaborativeField = "date" | keyof MinuteFormData;
type MinutePresencePayload = {
  userId: string;
  name: string;
  activeField: MinuteCollaborativeField | null;
  lastSeenAt: string;
};
type RemoteMinuteRow = {
  id?: string;
  data?: Partial<SacramentMinute> | null;
};

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
  const { applyRemoteMinuteUpdate, currentUser, currentWard, db, hasPermission, membersByWard, saveMinute } = useAppContext();
  const { formatDate, formatDateTime } = useDateFormatter();
  const canManageMinutes = hasPermission("minutes.manage");

  function buildMinuteTitle(date: string) {
    return `Ata sacramental - ${formatDate(date)}`;
  }
  const isPrintPortalReady = useSyncExternalStore(subscribeToPrintPortal, getClientSnapshot, getServerSnapshot);
  const [printSettings, setPrintSettings] = useState<MinutePrintSettings>(defaultPrintSettings);
  const [previewBounds, setPreviewBounds] = useState({ height: 0, scale: 1, width: 0 });
  const [editorStep, setEditorStep] = useState<MinuteEditorStep>("edit");
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewDocumentRef = useRef<HTMLDivElement>(null);
  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const activeFieldRef = useRef<MinuteCollaborativeField | null>(null);
  const savedMinuteRef = useRef<SacramentMinute | null>(minute ?? null);
  const [activeField, setActiveField] = useState<MinuteCollaborativeField | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<MinutePresencePayload[]>([]);
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
      form: createEmptyMinuteForm(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versionIds: [],
    };
  });

  const lockedFields = useMemo(() => {
    const fields = new Map<MinuteCollaborativeField, MinutePresencePayload>();

    presenceUsers.forEach((user) => {
      if (user.userId === currentUser?.id || !user.activeField) return;
      if (!fields.has(user.activeField)) {
        fields.set(user.activeField, user);
      }
    });

    return fields;
  }, [currentUser?.id, presenceUsers]);

  const memberOptions = useMemo(
    () =>
      membersByWard.map((member) => ({
        value: member.id,
        label: `${member.name} • ${member.organization}`,
      })),
    [membersByWard],
  );

  const printMemberOptions = useMemo(
    () =>
      membersByWard.map((member) => ({
        value: member.id,
        label: member.name,
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

  const hymnBooksById = useMemo(() => new Map(db.hymnBooks.map((hymnBook) => [hymnBook.id, hymnBook])), [db.hymnBooks]);
  const hymnOptions = useMemo(
    () =>
      db.hymns.map((hymn) => {
        const hymnBook = hymnBooksById.get(hymn.hymnBookId);
        const emoji = hymnBook?.emoji?.trim() || "🎵";

        return {
          value: hymn.id,
          label: `${emoji} ${hymn.number}. ${hymn.title}`,
          searchValue: [hymn.number, hymn.title].join(" "),
        };
      }),
    [db.hymns, hymnBooksById],
  );

  useEffect(() => {
    if (editorStep !== "preview") return;

    const viewport = previewViewportRef.current;
    const documentElement = previewDocumentRef.current;

    if (!viewport || !documentElement) return;

    function updatePreviewScale() {
      if (!viewport || !documentElement) return;

      const viewportStyle = window.getComputedStyle(viewport);
      const horizontalPadding = parseFloat(viewportStyle.paddingLeft) + parseFloat(viewportStyle.paddingRight);
      const verticalPadding = parseFloat(viewportStyle.paddingTop) + parseFloat(viewportStyle.paddingBottom);
      const availableWidth = Math.max(1, viewport.clientWidth - horizontalPadding);
      const availableHeight = Math.max(1, viewport.clientHeight - verticalPadding);
      const documentWidth = documentElement.offsetWidth;
      const documentHeight = documentElement.offsetHeight;

      if (!documentWidth || !documentHeight) return;

      const scale = Math.min(1, availableWidth / documentWidth, availableHeight / documentHeight);
      const nextBounds = {
        height: Math.round(documentHeight * scale),
        scale,
        width: Math.round(documentWidth * scale),
      };

      setPreviewBounds((current) => {
        const isSame =
          Math.abs(current.height - nextBounds.height) < 1 &&
          Math.abs(current.width - nextBounds.width) < 1 &&
          Math.abs(current.scale - nextBounds.scale) < 0.001;

        return isSame ? current : nextBounds;
      });
    }

    const animationFrame = window.requestAnimationFrame(updatePreviewScale);
    const resizeObserver = new ResizeObserver(updatePreviewScale);
    resizeObserver.observe(viewport);
    resizeObserver.observe(documentElement);
    window.addEventListener("resize", updatePreviewScale);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePreviewScale);
    };
  }, [editorStep, printSettings.fontSize, printSettings.sectionGap]);

  useEffect(() => {
    savedMinuteRef.current = minute ?? savedMinuteRef.current;
  }, [minute]);

  useEffect(() => {
    if (mode !== "edit" || !minute?.id || !currentUser) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`minute:${minute.id}`, {
        config: {
          presence: {
            key: currentUser.id,
          },
        },
      })
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState() as Record<string, MinutePresencePayload[]>;
        setPresenceUsers(Object.values(presenceState).flat().filter((item) => item.userId && item.name));
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sacrament_minutes",
          filter: `id=eq.${minute.id}`,
        },
        (payload) => {
          const row = payload.new as RemoteMinuteRow;
          const remoteMinute = row.data && typeof row.data === "object" ? ({ ...row.data, id: row.id ?? row.data.id } as SacramentMinute) : null;
          if (!remoteMinute?.id) return;

          savedMinuteRef.current = remoteMinute;
          applyRemoteMinuteUpdate(remoteMinute);

          setForm((current) => {
            if (!current || current.id !== remoteMinute.id) return current;

            const editingField = activeFieldRef.current;
            const nextForm =
              editingField && editingField !== "date"
                ? {
                    ...remoteMinute,
                    form: {
                      ...remoteMinute.form,
                      [editingField]: current.form[editingField],
                    },
                  }
                : editingField === "date"
                  ? {
                      ...remoteMinute,
                      date: current.date,
                      title: current.title,
                    }
                  : remoteMinute;

            return nextForm;
          });

          if (remoteMinute.updatedByUserId && remoteMinute.updatedByUserId !== currentUser.id) {
            const editor = db.users.find((user) => user.id === remoteMinute.updatedByUserId);
            toast.info(`Ata atualizada por ${editor?.name ?? "outro usuário"}.`);
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          userId: currentUser.id,
          name: currentUser.name,
          activeField: activeFieldRef.current,
          lastSeenAt: new Date().toISOString(),
        } satisfies MinutePresencePayload);
      });

    realtimeChannelRef.current = channel;

    return () => {
      realtimeChannelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteMinuteUpdate, currentUser, db.users, minute?.id, mode]);

  useEffect(() => {
    if (mode !== "edit" || !currentUser || !realtimeChannelRef.current) return;

    void realtimeChannelRef.current.track({
      userId: currentUser.id,
      name: currentUser.name,
      activeField,
      lastSeenAt: new Date().toISOString(),
    } satisfies MinutePresencePayload);
  }, [activeField, currentUser, mode]);

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

  function saveMinuteDraft(nextMinute: SacramentMinute, options: { redirect?: boolean; silent?: boolean } = {}) {
    const savedId = saveMinute(
      {
        id: nextMinute.id || undefined,
        wardId: nextMinute.wardId,
        title: buildMinuteTitle(nextMinute.date),
        date: nextMinute.date,
        status: nextMinute.status,
        presidency: nextMinute.presidency,
        responsibleUserId: nextMinute.responsibleUserId,
        form: nextMinute.form,
      },
      { silent: options.silent },
    );

    savedMinuteRef.current = {
      ...nextMinute,
      id: savedId,
      title: buildMinuteTitle(nextMinute.date),
    };

    if (options.redirect) {
      router.push(`/meetings/${savedId}`);
    }
  }

  function saveCurrentMinute() {
    if (!form) return;
    saveMinuteDraft(form, { redirect: true });
  }

  function activateField(field: MinuteCollaborativeField) {
    if (!canManageMinutes || lockedFields.has(field)) return;
    activeFieldRef.current = field;
    setActiveField(field);
  }

  function clearActiveField(field: MinuteCollaborativeField) {
    if (activeFieldRef.current !== field) return;
    activeFieldRef.current = null;
    setActiveField(null);
  }

  function isFieldChanged(field: MinuteCollaborativeField) {
    const savedMinute = savedMinuteRef.current;
    if (!savedMinute || !form) return true;
    if (field === "date") return savedMinute.date !== form.date;

    return JSON.stringify(savedMinute.form[field]) !== JSON.stringify(form.form[field]);
  }

  function finishFieldEdit(field: MinuteCollaborativeField) {
    clearActiveField(field);
    if (!form || mode !== "edit" || !form.id || lockedFields.has(field) || !isFieldChanged(field)) return;
    saveMinuteDraft(form, { silent: true });
  }

  function updateDate(value: string) {
    if (!form) return;

    const nextMinute = { ...form, date: value, title: buildMinuteTitle(value) };
    setForm(nextMinute);
    if (mode === "edit" && form.id && !lockedFields.has("date")) {
      clearActiveField("date");
      saveMinuteDraft(nextMinute, { silent: true });
    }
  }

  function updateHybridField(field: keyof MinuteFormData, value: HybridField) {
    if (!form) return;

    const nextMinute = {
      ...form,
      form: {
        ...form.form,
        [field]: value,
      },
    };
    setForm(nextMinute);

    if (mode === "edit" && form.id && !lockedFields.has(field)) {
      clearActiveField(field);
      saveMinuteDraft(nextMinute, { silent: true });
    }
  }

  function renderCollaborativeField(
    field: MinuteCollaborativeField,
    children: (options: { disabled: boolean }) => ReactNode,
  ) {
    const lockedBy = lockedFields.get(field);
    const disabled = !canManageMinutes || Boolean(lockedBy);
    const isEditing = activeField === field && !lockedBy;

    return (
      <div
        className="space-y-1"
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          finishFieldEdit(field);
        }}
        onFocusCapture={() => activateField(field)}
      >
        {children({ disabled })}
        {lockedBy ? <p className="text-xs text-amber-600">Em uso por {lockedBy.name}</p> : null}
        {isEditing ? <p className="text-xs text-muted-foreground">Editando</p> : null}
      </div>
    );
  }

  const printSections: MinutePrintSection[] = [
    {
      title: "Saudações e boas-vindas",
      items: [
        { label: "Presidida por", value: formatHybridField(currentForm.form.presiding, printMemberOptions) },
        { label: "Dirigida por", value: formatHybridField(currentForm.form.conducting, printMemberOptions) },
        { label: "Frequência", value: currentForm.form.attendance || "-" },
        { label: "Reconhecimentos", value: currentForm.form.recognitions, wide: true },
        { label: "Anúncios", value: currentForm.form.announcements, wide: true },
      ],
    },
    {
      title: "Hino e oração",
      items: [
        { label: "Regente", value: formatHybridField(currentForm.form.conductor, printMemberOptions) },
        { label: "Instrumentista", value: formatHybridField(currentForm.form.accompanist, printMemberOptions) },
        { label: "Hino inicial", value: formatHybridField(currentForm.form.openingHymn, hymnOptions) },
        { label: "Oração inicial", value: formatHybridField(currentForm.form.openingPrayer, printMemberOptions) },
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
        { label: "Primeiro orador", value: formatHybridField(currentForm.form.speaker1, printMemberOptions) },
        { label: "Tema 1", value: currentForm.form.speaker1Theme },
        { label: "Segundo orador", value: formatHybridField(currentForm.form.speaker2, printMemberOptions) },
        { label: "Tema 2", value: currentForm.form.speaker2Theme },
        { label: "Hino intermediário", value: formatHybridField(currentForm.form.intermediateHymn, hymnOptions) },
        { label: "Terceiro orador", value: formatHybridField(currentForm.form.speaker3, printMemberOptions) },
        { label: "Tema 3", value: currentForm.form.speaker3Theme },
        { label: "Hino final", value: formatHybridField(currentForm.form.closingHymn, hymnOptions) },
        { label: "Última oração", value: formatHybridField(currentForm.form.closingPrayer, printMemberOptions) },
        { label: "Anotações gerais", value: currentForm.form.notes, wide: true },
      ],
    },
  ];

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
        ref={kind === "preview" ? previewDocumentRef : undefined}
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

          <div className="minute-print-preview-viewport" ref={previewViewportRef}>
            <div
              className="minute-print-preview-scale"
              style={
                {
                  "--minute-preview-scale": previewBounds.scale,
                  height: previewBounds.height ? `${previewBounds.height}px` : undefined,
                  width: previewBounds.width ? `${previewBounds.width}px` : undefined,
                } as CSSProperties
              }
            >
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
                  {mode === "edit" && presenceUsers.length ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Editando agora: {presenceUsers.map((user) => user.name).join(", ")}
                    </p>
                  ) : null}
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
                {renderCollaborativeField("date", ({ disabled }) => (
                  <div>
                    <Label>Data</Label>
                    <DatePicker disabled={disabled} value={form.date} onChange={updateDate} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saudações e boas-vindas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="section-grid">
                  {renderCollaborativeField("presiding", ({ disabled }) => (
                    <HybridSelector
                      disabled={disabled}
                      label="Presidida por"
                      value={form.form.presiding}
                      options={presidingMemberOptions}
                      manualPlaceholder="Nome de quem presidiu"
                      manualOptionLabel="Temporário"
                      onChange={(value) => updateHybridField("presiding", value)}
                    />
                  ))}
                  {renderCollaborativeField("conducting", ({ disabled }) => (
                    <HybridSelector
                      disabled={disabled}
                      label="Dirigida por"
                      value={form.form.conducting}
                      options={conductingMemberOptions}
                      manualPlaceholder="Nome de quem dirigiu"
                      manualOptionLabel="Temporário"
                      onChange={(value) => updateHybridField("conducting", value)}
                    />
                  ))}
                </div>
                <div className="section-grid">
                  {renderCollaborativeField("recognitions", ({ disabled }) => (
                    <div>
                      <Label>Reconhecimentos</Label>
                      <Textarea
                        disabled={disabled}
                        value={form.form.recognitions}
                        onChange={(event) =>
                          setForm((current) => (current ? { ...current, form: { ...current.form, recognitions: event.target.value } } : current))
                        }
                      />
                    </div>
                  ))}
                  {renderCollaborativeField("announcements", ({ disabled }) => (
                    <div>
                      <Label>Anúncios</Label>
                      <Textarea
                        disabled={disabled}
                        value={form.form.announcements}
                        onChange={(event) =>
                          setForm((current) => (current ? { ...current, form: { ...current.form, announcements: event.target.value } } : current))
                        }
                      />
                    </div>
                  ))}
                </div>
                {renderCollaborativeField("attendance", ({ disabled }) => (
                  <div>
                    <Label>Frequência</Label>
                    <Input
                      disabled={disabled}
                      type="number"
                      value={form.form.attendance}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, form: { ...current.form, attendance: Number(event.target.value) || 0 } } : current,
                        )
                      }
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hino e oração</CardTitle>
              </CardHeader>
              <CardContent className="section-grid">
                {renderCollaborativeField("conductor", ({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Regente"
                    value={form.form.conductor}
                    options={memberOptions}
                    manualPlaceholder="Nome do regente"
                    manualOptionLabel="Temporário"
                    onChange={(value) => updateHybridField("conductor", value)}
                  />
                ))}
                {renderCollaborativeField("accompanist", ({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Instrumentista"
                    value={form.form.accompanist}
                    options={memberOptions}
                    manualPlaceholder="Nome do instrumentista"
                    manualOptionLabel="Temporário"
                    onChange={(value) => updateHybridField("accompanist", value)}
                  />
                ))}
                {renderCollaborativeField("openingHymn", ({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Hino inicial"
                    value={form.form.openingHymn}
                    options={hymnOptions}
                    manualPlaceholder="Digite o hino inicial"
                    onChange={(value) => updateHybridField("openingHymn", value)}
                  />
                ))}
                {renderCollaborativeField("openingPrayer", ({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Oração inicial"
                    value={form.form.openingPrayer}
                    options={memberOptions}
                    manualPlaceholder="Nome da oração inicial"
                    manualOptionLabel="Temporário"
                    onChange={(value) => updateHybridField("openingPrayer", value)}
                  />
                ))}
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
                ].map(([label, key]) => {
                  const field = key as keyof MinuteFormData;

                  return (
                    <div className="contents" key={key}>
                      {renderCollaborativeField(field, ({ disabled }) => (
                        <div>
                          <Label>{label}</Label>
                          <Textarea
                            disabled={disabled}
                            value={form.form[field] as string}
                            onChange={(event) =>
                              setForm((current) =>
                                current ? { ...current, form: { ...current.form, [key]: event.target.value } } : current,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sacramento e oradores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {renderCollaborativeField("sacramentHymn", ({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Hino sacramental"
                    value={form.form.sacramentHymn}
                    options={hymnOptions}
                    manualPlaceholder="Digite o hino sacramental"
                    onChange={(value) => updateHybridField("sacramentHymn", value)}
                  />
                ))}
                <div className="space-y-4">
                  <div className="section-grid">
                    {renderCollaborativeField("speaker1", ({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Primeiro orador"
                        value={form.form.speaker1}
                        options={speakerMemberOptions}
                        manualPlaceholder="Primeiro orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker1", value)}
                      />
                    ))}
                    {renderCollaborativeField("speaker1Theme", ({ disabled }) => (
                      <div className="space-y-2">
                        <Label>Tema 1</Label>
                        <Input
                          disabled={disabled}
                          value={form.form.speaker1Theme}
                          onChange={(event) =>
                            setForm((current) => (current ? { ...current, form: { ...current.form, speaker1Theme: event.target.value } } : current))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="section-grid">
                    {renderCollaborativeField("speaker2", ({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Segundo orador"
                        value={form.form.speaker2}
                        options={speakerMemberOptions}
                        manualPlaceholder="Segundo orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker2", value)}
                      />
                    ))}
                    {renderCollaborativeField("speaker2Theme", ({ disabled }) => (
                      <div className="space-y-2">
                        <Label>Tema 2</Label>
                        <Input
                          disabled={disabled}
                          value={form.form.speaker2Theme}
                          onChange={(event) =>
                            setForm((current) => (current ? { ...current, form: { ...current.form, speaker2Theme: event.target.value } } : current))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  {renderCollaborativeField("intermediateHymn", ({ disabled }) => (
                    <HybridSelector
                      disabled={disabled}
                      label="Hino intermediário"
                      value={form.form.intermediateHymn}
                      options={hymnOptions}
                      manualPlaceholder="Digite o hino intermediário"
                      onChange={(value) => updateHybridField("intermediateHymn", value)}
                    />
                  ))}

                  <div className="section-grid">
                    {renderCollaborativeField("speaker3", ({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Terceiro orador"
                        value={form.form.speaker3}
                        options={speakerMemberOptions}
                        manualPlaceholder="Terceiro orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker3", value)}
                      />
                    ))}
                    {renderCollaborativeField("speaker3Theme", ({ disabled }) => (
                      <div className="space-y-2">
                        <Label>Tema 3</Label>
                        <Input
                          disabled={disabled}
                          value={form.form.speaker3Theme}
                          onChange={(event) =>
                            setForm((current) => (current ? { ...current, form: { ...current.form, speaker3Theme: event.target.value } } : current))
                          }
                        />
                      </div>
                    ))}
                  </div>

                  <div className="section-grid">
                    {renderCollaborativeField("closingHymn", ({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Hino final"
                        value={form.form.closingHymn}
                        options={hymnOptions}
                        manualPlaceholder="Digite o hino final"
                        onChange={(value) => updateHybridField("closingHymn", value)}
                      />
                    ))}
                    {renderCollaborativeField("closingPrayer", ({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Última oração"
                        value={form.form.closingPrayer}
                        options={memberOptions}
                        manualPlaceholder="Nome da última oração"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("closingPrayer", value)}
                      />
                    ))}
                  </div>
                </div>
                {renderCollaborativeField("notes", ({ disabled }) => (
                  <div>
                    <Label>Anotações gerais</Label>
                    <Textarea
                      disabled={disabled}
                      value={form.form.notes}
                      onChange={(event) => setForm((current) => (current ? { ...current, form: { ...current.form, notes: event.target.value } } : current))}
                    />
                  </div>
                ))}
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

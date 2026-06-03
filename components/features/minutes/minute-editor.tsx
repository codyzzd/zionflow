"use client";

import { CloudSun, Loader2, LockKeyhole, Printer, RefreshCcw, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { MinuteWeatherDisplay } from "@/components/features/minutes/minute-weather-display";
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
import { fetchMinuteWeather, formatPrecipitation, formatTemperature, WARD_WEATHER_REQUIRED_MESSAGE } from "@/lib/minute-weather";
import { acquireMinuteLock, fetchMinuteSnapshot, releaseMinuteLock, renewMinuteLock, saveLockedMinuteSnapshot, type MinuteLockInfo } from "@/lib/storage";
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
type ExistingMinuteEditorMode = "view" | "edit";

const subscribeToPrintPortal = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
const LOCK_TTL_SECONDS = 120;
const LOCK_RENEW_INTERVAL_MS = 45_000;
const MINUTE_POLL_INTERVAL_MS = 15_000;
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
  const { formatDate } = useDateFormatter();
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
  const savedMinuteRef = useRef<SacramentMinute | null>(minute ?? null);
  const staleNoticeShownRef = useRef(false);
  const [existingEditorMode, setExistingEditorMode] = useState<ExistingMinuteEditorMode>("view");
  const [lockInfo, setLockInfo] = useState<MinuteLockInfo | null>(() =>
    minute
      ? {
          minuteId: minute.id,
          lockedByUserId: minute.lockedByUserId,
          lockedAt: minute.lockedAt,
          lockExpiresAt: minute.lockExpiresAt,
          version: minute.version,
          updatedAt: minute.updatedAt,
        }
      : null,
  );
  const [lockVersion, setLockVersion] = useState(minute?.version ?? 1);
  const [staleMinute, setStaleMinute] = useState<SacramentMinute | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isWeatherBusy, setIsWeatherBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
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
      version: 1,
      versionIds: [],
    };
  });

  const memberOptions = useMemo(
    () =>
      membersByWard.map((member) => ({
        value: member.id,
        label: member.name,
        searchValue: [member.name, member.organization].filter(Boolean).join(" "),
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
    const intervalId = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (mode !== "edit" || existingEditorMode !== "edit" || !minute?.id || !currentUser?.id) return;

    const intervalId = window.setInterval(async () => {
      try {
        const renewed = await renewMinuteLock(minute.id, currentUser.id, LOCK_TTL_SECONDS);
        setLockInfo(renewed);
        if (!renewed.renewed) {
          setExistingEditorMode("view");
          toast.error("Seu tempo de edição expirou. Atualize a ata antes de continuar.");
        }
      } catch (error) {
        console.error("Failed to renew minute lock.", error);
      }
    }, LOCK_RENEW_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [currentUser?.id, existingEditorMode, minute?.id, mode]);

  useEffect(() => {
    if (mode !== "edit" || !minute?.id) return;
    const minuteId = minute.id;
    let cancelled = false;

    async function refreshMinuteState() {
      try {
        const remoteMinute = await fetchMinuteSnapshot(minuteId);
        if (!remoteMinute || cancelled) return;

        setLockInfo({
          minuteId: remoteMinute.id,
          lockedByUserId: remoteMinute.lockedByUserId,
          lockedAt: remoteMinute.lockedAt,
          lockExpiresAt: remoteMinute.lockExpiresAt,
          version: remoteMinute.version,
          updatedAt: remoteMinute.updatedAt,
        });

        if (remoteMinute.version > (savedMinuteRef.current?.version ?? 1)) {
          setStaleMinute(remoteMinute);
          if (!staleNoticeShownRef.current && remoteMinute.updatedByUserId !== currentUser?.id) {
            staleNoticeShownRef.current = true;
            const editor = db.users.find((user) => user.id === remoteMinute.updatedByUserId);
            toast.info(`Nova versão disponível. ${editor?.name ?? "Outro usuário"} salvou alterações nesta ata.`);
          }
        }
      } catch (error) {
        console.error("Failed to refresh minute state.", error);
      }
    }

    void refreshMinuteState();
    const intervalId = window.setInterval(refreshMinuteState, MINUTE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, db.users, minute?.id, mode]);

  useEffect(() => {
    if (mode !== "edit" || existingEditorMode !== "edit" || !minute?.id || !currentUser?.id) return;

    return () => {
      void releaseMinuteLock(minute.id, currentUser.id).catch((error) => {
        console.error("Failed to release minute lock.", error);
      });
    };
  }, [currentUser?.id, existingEditorMode, minute?.id, mode]);

  if (!form) {
    return <div className="text-sm text-muted-foreground">Carregando formulário...</div>;
  }

  const currentForm = form;
  const isExistingMinute = mode === "edit" && Boolean(form.id);
  const lockExpiresAt = lockInfo?.lockExpiresAt ? Date.parse(lockInfo.lockExpiresAt) : 0;
  const lockIsActive = Boolean(lockInfo?.lockedByUserId && Number.isFinite(lockExpiresAt) && lockExpiresAt > nowMs);
  const lockedByMe = Boolean(isExistingMinute && lockIsActive && lockInfo?.lockedByUserId === currentUser?.id);
  const lockedByOther = Boolean(isExistingMinute && lockIsActive && lockInfo?.lockedByUserId && lockInfo.lockedByUserId !== currentUser?.id);
  const lockOwnerName = lockInfo?.lockedByName ?? db.users.find((user) => user.id === lockInfo?.lockedByUserId)?.name ?? "outro usuário";
  const fieldsDisabled = mode === "edit" ? existingEditorMode !== "edit" || !lockedByMe || !canManageMinutes : !canManageMinutes;

  function formatHybridField(field: HybridField, options: { value: string; label: string }[]) {
    if (field.mode === "manual") {
      return field.manualValue?.trim() || "-";
    }

    return options.find((option) => option.value === field.linkedId)?.label ?? "-";
  }

  async function getWeatherForMinute(date: string) {
    try {
      return await fetchMinuteWeather(date, currentWard);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível buscar o clima da ata.";
      if (message === WARD_WEATHER_REQUIRED_MESSAGE) {
        toast.info(message);
      } else {
        toast.error(message);
      }
      return undefined;
    }
  }

  async function saveMinuteDraft(nextMinute: SacramentMinute, options: { redirect?: boolean; silent?: boolean } = {}) {
    if (mode === "edit") {
      if (!currentUser?.id || !lockedByMe) {
        toast.error("Não foi possível editar. Esta ata está sendo editada por outro usuário.");
        return nextMinute.id;
      }

      const nextPersistedMinute = {
        ...nextMinute,
        title: buildMinuteTitle(nextMinute.date),
      };
      const result = await saveLockedMinuteSnapshot(nextPersistedMinute, currentUser.id, lockVersion);

      if (!result.saved || !result.minute) {
        if (result.reason === "version_conflict") {
          setStaleMinute(result.minute ?? null);
          toast.error("Nova versão disponível. Atualize a ata antes de continuar.");
        } else {
          toast.error("Seu tempo de edição expirou. Atualize a ata antes de continuar.");
        }
        setExistingEditorMode("view");
        return nextMinute.id;
      }

      savedMinuteRef.current = result.minute;
      applyRemoteMinuteUpdate(result.minute);
      setForm(result.minute);
      setLockInfo({
        minuteId: result.minute.id,
        version: result.minute.version,
        updatedAt: result.minute.updatedAt,
      });
      setLockVersion(result.minute.version);
      setStaleMinute(null);
      staleNoticeShownRef.current = false;
      setExistingEditorMode("view");

      if (!options.silent) toast.success("Ata salva.");
      return result.minute.id;
    }

    const result = saveMinute(
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

    savedMinuteRef.current = result.minute;

    const persisted = await result.persisted;
    if (!persisted) {
      return result.id;
    }

    if (options.redirect) {
      router.push(`/meetings/${result.id}`);
    }

    return result.id;
  }

  async function saveCurrentMinute() {
    if (!form) return;
    setIsBusy(true);
    try {
      const attendanceChanged = mode === "edit" && savedMinuteRef.current?.form.attendance !== form.form.attendance;
      const shouldRefreshWeather = mode === "new" || attendanceChanged;
      let nextMinute = form;

      if (shouldRefreshWeather) {
        const weather = await getWeatherForMinute(form.date);
        if (weather) {
          nextMinute = { ...form, form: { ...form.form, weather } };
          setForm(nextMinute);
        }
      }

      await saveMinuteDraft(nextMinute, { redirect: mode === "new" });
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshWeather() {
    if (!form) return;

    setIsWeatherBusy(true);
    try {
      const weather = await getWeatherForMinute(form.date);
      if (!weather) return;

      setForm((current) => (current ? { ...current, form: { ...current.form, weather } } : current));
      toast.success("Clima da ata atualizado.");
    } finally {
      setIsWeatherBusy(false);
    }
  }

  function updateDate(value: string) {
    if (!form) return;

    const nextMinute = { ...form, date: value, title: buildMinuteTitle(value) };
    setForm(nextMinute);
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
  }

  function renderMinuteField(children: (options: { disabled: boolean }) => ReactNode) {
    return <div className="space-y-1">{children({ disabled: fieldsDisabled })}</div>;
  }

  async function startEditing(refreshFirst = true) {
    if (!minute?.id || !currentUser?.id || !canManageMinutes) return;

    setIsBusy(true);
    try {
      const acquired = await acquireMinuteLock(minute.id, currentUser.id, LOCK_TTL_SECONDS);
      setLockInfo(acquired);

      if (!acquired.acquired) {
        toast.error(`Não foi possível editar. Esta ata está sendo editada por ${acquired.lockedByName ?? "outro usuário"}.`);
        return;
      }

      const latestMinute = refreshFirst ? await fetchMinuteSnapshot(minute.id) : undefined;
      const nextMinute = latestMinute ?? form;
      if (nextMinute) {
        savedMinuteRef.current = nextMinute;
        applyRemoteMinuteUpdate(nextMinute);
        setForm(nextMinute);
        setLockVersion(nextMinute.version);
        setLockInfo({
          minuteId: nextMinute.id,
          lockedByUserId: nextMinute.lockedByUserId ?? acquired.lockedByUserId ?? currentUser.id,
          lockedByName: acquired.lockedByName ?? currentUser.name,
          lockedAt: nextMinute.lockedAt ?? acquired.lockedAt,
          lockExpiresAt: nextMinute.lockExpiresAt ?? acquired.lockExpiresAt,
          version: nextMinute.version,
          updatedAt: nextMinute.updatedAt,
        });
      } else {
        setLockVersion(acquired.version);
      }
      setStaleMinute(null);
      staleNoticeShownRef.current = false;
      setExistingEditorMode("edit");
    } catch (error) {
      console.error("Failed to acquire minute lock.", error);
      toast.error("Não foi possível iniciar a edição da ata.");
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelEditing() {
    if (!minute?.id || !currentUser?.id) return;

    setIsBusy(true);
    try {
      await releaseMinuteLock(minute.id, currentUser.id);
    } catch (error) {
      console.error("Failed to release minute lock.", error);
    } finally {
      setForm(savedMinuteRef.current ?? minute);
      setExistingEditorMode("view");
      setLockInfo((current) => (current ? { ...current, lockedByUserId: undefined, lockedByName: undefined, lockedAt: undefined, lockExpiresAt: undefined } : current));
      setIsBusy(false);
    }
  }

  function applyStaleMinute() {
    if (!staleMinute) return;
    savedMinuteRef.current = staleMinute;
    applyRemoteMinuteUpdate(staleMinute);
    setForm(staleMinute);
    setLockVersion(staleMinute.version);
    setStaleMinute(null);
    staleNoticeShownRef.current = false;
  }

  async function refreshAndEdit() {
    applyStaleMinute();
    await startEditing(false);
  }

  function formatLockTime(value?: string) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function renderMinuteStatus() {
    if (staleMinute) {
      const editor = db.users.find((user) => user.id === staleMinute.updatedByUserId);
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Nova versão disponível.</p>
          <p>{editor?.name ?? "Outro usuário"} salvou alterações nesta ata. Atualize para visualizar a versão mais recente.</p>
        </div>
      );
    }

    if (lockedByOther) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Ata em edição por {lockOwnerName}.</p>
          <p>Esta ata está sendo editada desde {formatLockTime(lockInfo?.lockedAt)}. Você está visualizando a última versão salva.</p>
        </div>
      );
    }

    if (mode === "edit" && existingEditorMode === "edit") {
      return (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          <p className="font-medium">Você está editando esta ata.</p>
          <p>As alterações só serão salvas quando você clicar em Salvar.</p>
        </div>
      );
    }

    return null;
  }

  function renderActionBar() {
    if (editorStep === "preview") return null;

    return (
      <div className="fixed right-0 bottom-0 left-0 z-30 border-t bg-background/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.10)] backdrop-blur supports-backdrop-filter:bg-background/85 md:left-[var(--sidebar-width)] group-data-[state=collapsed]/sidebar-wrapper:md:left-[var(--sidebar-width-icon)]">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-sm">
            {mode === "new" ? <p className="font-medium">Nova ata</p> : null}
            {mode === "edit" && existingEditorMode === "edit" ? <p className="font-medium">Editando</p> : null}
            {mode === "edit" && existingEditorMode !== "edit" && !lockedByOther ? <p className="font-medium">Modo leitura</p> : null}
            {lockedByOther ? (
              <p className="flex items-center gap-2 font-medium">
                <LockKeyhole className="size-4" />
                Em edição por {lockOwnerName}
              </p>
            ) : null}
            {staleMinute ? <p className="text-muted-foreground">Nova versão disponível.</p> : null}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {staleMinute ? (
              <Button disabled={isBusy} onClick={applyStaleMinute} type="button" variant="outline">
                <RefreshCcw className="size-4" />
                Atualizar ata
              </Button>
            ) : null}
            {mode === "edit" && staleMinute && canManageMinutes ? (
              <Button disabled={isBusy || lockedByOther} onClick={() => void refreshAndEdit()} type="button" variant="secondary">
                Atualizar e editar
              </Button>
            ) : null}
            {mode === "edit" && existingEditorMode === "view" && !staleMinute ? (
              <Button disabled={isBusy || !canManageMinutes || lockedByOther} onClick={() => void startEditing()} type="button">
                Editar
              </Button>
            ) : null}
            {mode === "edit" && existingEditorMode === "edit" ? (
              <>
                <Button disabled={isBusy} onClick={cancelEditing} type="button" variant="outline">
                  <X className="size-4" />
                  Cancelar
                </Button>
                <Button disabled={isBusy} onClick={saveCurrentMinute} type="button">
                  <Save className="size-4" />
                  Salvar
                </Button>
              </>
            ) : null}
            {mode === "new" ? (
              <Button disabled={isBusy} onClick={saveCurrentMinute} type="button">
                <Save className="size-4" />
                Criar ata
              </Button>
            ) : null}
          </div>
        </div>
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
        { label: "Clima", value: currentForm.form.weather ? `${formatTemperature(currentForm.form.weather.temperatureMeanC)} no horario, ${formatPrecipitation(currentForm.form.weather.precipitationMm)} de chuva` : "-" },
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
      <div className="space-y-4 pb-28">
        {renderMinuteStatus()}
        {mode === "edit" && editorStep === "preview" ? (
          renderPrintPreview()
        ) : (
          <>
            <Card>
              <CardHeader className="flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle>{mode === "new" ? "Nova ata sacramental" : "Editar ata sacramental"}</CardTitle>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mode === "edit" ? (
                    <Button onClick={() => setEditorStep("preview")} variant="secondary">
                      Prévia da impressão
                    </Button>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="section-grid">
                {renderMinuteField(({ disabled }) => (
                  <div>
                    <Label>Data</Label>
                    <DatePicker disabled={disabled} value={form.date} onChange={updateDate} />
                  </div>
                ))}
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Label>Clima</Label>
                      {form.form.weather ? (
                        <MinuteWeatherDisplay className="mt-2" weather={form.form.weather} />
                      ) : (
                        <p className="mt-1 text-muted-foreground">Informe latitude, longitude e horário da reunião no cadastro da ala para buscar o clima da ata.</p>
                      )}
                    </div>
                    <Button disabled={fieldsDisabled || isWeatherBusy} onClick={() => void refreshWeather()} type="button" variant="outline">
                      {isWeatherBusy ? <Loader2 className="size-4 animate-spin" /> : <CloudSun className="size-4" />}
                      Atualizar clima
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Saudações e boas-vindas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="section-grid">
                  {renderMinuteField(({ disabled }) => (
                    <HybridSelector
                      disabled={disabled}
                      label="Presidida por"
                      value={form.form.presiding}
                      options={memberOptions}
                      manualPlaceholder="Nome de quem presidiu"
                      manualOptionLabel="Temporário"
                      onChange={(value) => updateHybridField("presiding", value)}
                    />
                  ))}
                  {renderMinuteField(({ disabled }) => (
                    <HybridSelector
                      disabled={disabled}
                      label="Dirigida por"
                      value={form.form.conducting}
                      options={memberOptions}
                      manualPlaceholder="Nome de quem dirigiu"
                      manualOptionLabel="Temporário"
                      onChange={(value) => updateHybridField("conducting", value)}
                    />
                  ))}
                </div>
                <div className="section-grid">
                  {renderMinuteField(({ disabled }) => (
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
                  {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
                  <HybridSelector
                    disabled={disabled}
                    label="Hino inicial"
                    value={form.form.openingHymn}
                    options={hymnOptions}
                    manualPlaceholder="Digite o hino inicial"
                    onChange={(value) => updateHybridField("openingHymn", value)}
                  />
                ))}
                {renderMinuteField(({ disabled }) => (
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
                      {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
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
                    {renderMinuteField(({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Primeiro orador"
                        value={form.form.speaker1}
                        options={memberOptions}
                        manualPlaceholder="Primeiro orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker1", value)}
                      />
                    ))}
                    {renderMinuteField(({ disabled }) => (
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
                    {renderMinuteField(({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Segundo orador"
                        value={form.form.speaker2}
                        options={memberOptions}
                        manualPlaceholder="Segundo orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker2", value)}
                      />
                    ))}
                    {renderMinuteField(({ disabled }) => (
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

                  {renderMinuteField(({ disabled }) => (
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
                    {renderMinuteField(({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Terceiro orador"
                        value={form.form.speaker3}
                        options={memberOptions}
                        manualPlaceholder="Terceiro orador"
                        manualOptionLabel="Temporário"
                        onChange={(value) => updateHybridField("speaker3", value)}
                      />
                    ))}
                    {renderMinuteField(({ disabled }) => (
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
                    {renderMinuteField(({ disabled }) => (
                      <HybridSelector
                        disabled={disabled}
                        label="Hino final"
                        value={form.form.closingHymn}
                        options={hymnOptions}
                        manualPlaceholder="Digite o hino final"
                        onChange={(value) => updateHybridField("closingHymn", value)}
                      />
                    ))}
                    {renderMinuteField(({ disabled }) => (
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
                {renderMinuteField(({ disabled }) => (
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

          </>
        )}
      </div>
      {renderActionBar()}
    </>
  );
}

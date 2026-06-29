"use client";

import { Camera, Loader2, Plus, Upload } from "lucide-react";
import { type PointerEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { detectPeopleWithYolov8sFromPhotos, type DetectedFace, type FaceDetectionPhotoResult } from "@/lib/browser-face-detection";
import type { AttendancePhotoEstimate, SacramentMinute } from "@/types/domain";

type FrequencyPhotoCountDrawerProps = {
  currentUserId?: string;
  minutes: SacramentMinute[];
  onOpenChange: (open: boolean) => void;
  onSave: (minute: SacramentMinute, estimate: AttendancePhotoEstimate) => Promise<void> | void;
  open: boolean;
};

type DragState = {
  faceId: string;
  moved: boolean;
  originX: number;
  originY: number;
  photoId: string;
  pointerId: number;
  startX: number;
  startY: number;
};

function faceCountLabel(count: number) {
  return `${count} ${count === 1 ? "pessoa" : "pessoas"}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function boxToPercentStyle(face: DetectedFace, result: FaceDetectionPhotoResult) {
  const imageWidth = result.imageWidth || 1;
  const imageHeight = result.imageHeight || 1;

  return {
    height: `${(face.box.height / imageHeight) * 100}%`,
    left: `${(face.box.x / imageWidth) * 100}%`,
    top: `${(face.box.y / imageHeight) * 100}%`,
    width: `${(face.box.width / imageWidth) * 100}%`,
  };
}

function normalizedBox(face: DetectedFace, result: FaceDetectionPhotoResult) {
  const imageWidth = result.imageWidth || 1;
  const imageHeight = result.imageHeight || 1;

  return {
    height: Number((face.box.height / imageHeight).toFixed(6)),
    source: face.source,
    width: Number((face.box.width / imageWidth).toFixed(6)),
    x: Number((face.box.x / imageWidth).toFixed(6)),
    y: Number((face.box.y / imageHeight).toFixed(6)),
  };
}

function markerClassName(source: DetectedFace["source"]) {
  if (source === "manual") return "border-amber-400 bg-amber-400/10";
  if (source === "face") return "border-sky-400 bg-sky-400/10";
  return "border-emerald-400 bg-emerald-400/10";
}

function markerLabel(face: DetectedFace) {
  if (face.source === "manual") return <Plus className="size-3" />;
  if (face.source === "face") return "R";
  return Math.round((face.score ?? 0) * 100);
}

export function FrequencyPhotoCountDrawer({ currentUserId, minutes, onOpenChange, onSave, open }: FrequencyPhotoCountDrawerProps) {
  const sortedMinutes = useMemo(() => [...minutes].sort((a, b) => b.date.localeCompare(a.date)), [minutes]);
  const [selectedMinuteId, setSelectedMinuteId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FaceDetectionPhotoResult[]>([]);
  const [adjustedTotal, setAdjustedTotal] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const manualIdRef = useRef(0);

  const selectedMinute = sortedMinutes.find((minute) => minute.id === selectedMinuteId) ?? sortedMinutes[0];
  const detectedTotal = results.reduce((total, result) => total + result.faces.length, 0);
  const isBusy = isDetecting || isSaving;

  function reset() {
    setSelectedMinuteId("");
    setFiles([]);
    setResults([]);
    setAdjustedTotal("");
    setIsDetecting(false);
    setIsSaving(false);
    setProgressMessage("");
    dragRef.current = null;
  }

  function closeDrawer() {
    if (isBusy) return;
    reset();
    onOpenChange(false);
  }

  function selectFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 6);
    setFiles(nextFiles);
    setResults([]);
    setAdjustedTotal("");
    setProgressMessage("");

    if ((fileList?.length ?? 0) > 6) {
      toast.info("Foram selecionadas apenas as 6 primeiras fotos.");
    }
  }

  async function detectFaces() {
    if (!files.length) {
      toast.error("Selecione pelo menos uma foto.");
      return;
    }

    setIsDetecting(true);
    setProgressMessage("Carregando YOLOv8s...");
    try {
      const nextResults = await detectPeopleWithYolov8sFromPhotos(files, setProgressMessage);
      const total = nextResults.reduce((sum, result) => sum + result.faces.length, 0);

      setResults(nextResults);
      setAdjustedTotal(total.toString());
      toast.success(`${faceCountLabel(total)} detectadas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel detectar pessoas nas fotos.");
    } finally {
      setIsDetecting(false);
      setProgressMessage("");
    }
  }

  function updateResult(photoId: string, updater: (result: FaceDetectionPhotoResult) => FaceDetectionPhotoResult) {
    setResults((currentResults) => currentResults.map((result) => (result.photoId === photoId ? updater(result) : result)));
  }

  function syncAdjustedTotal(nextResults: FaceDetectionPhotoResult[]) {
    const total = nextResults.reduce((sum, result) => sum + result.faces.length, 0);
    setAdjustedTotal(total.toString());
  }

  function setResultsAndTotal(updater: (currentResults: FaceDetectionPhotoResult[]) => FaceDetectionPhotoResult[]) {
    setResults((currentResults) => {
      const nextResults = updater(currentResults);
      syncAdjustedTotal(nextResults);
      return nextResults;
    });
  }

  function addPersonMark(result: FaceDetectionPhotoResult, event: PointerEvent<HTMLDivElement>) {
    if (isBusy || !result.imageWidth || !result.imageHeight || !event.currentTarget) return;
    if ((event.target as HTMLElement).closest("[data-person-box]")) return;

    const imageWidth = result.imageWidth;
    const imageHeight = result.imageHeight;
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const yRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const boxWidth = imageWidth * 0.12;
    const boxHeight = imageHeight * 0.24;
    manualIdRef.current += 1;
    const face: DetectedFace = {
      box: {
        height: boxHeight,
        width: boxWidth,
        x: clamp(xRatio * imageWidth - boxWidth / 2, 0, imageWidth - boxWidth),
        y: clamp(yRatio * imageHeight - boxHeight / 2, 0, imageHeight - boxHeight),
      },
      id: `${result.photoId}-manual-${manualIdRef.current}`,
      imageUrl: "",
      source: "manual",
    };

    setResultsAndTotal((currentResults) =>
      currentResults.map((currentResult) => (currentResult.photoId === result.photoId ? { ...currentResult, faces: [...currentResult.faces, face] } : currentResult)),
    );
  }

  function removePersonMark(photoId: string, faceId: string) {
    if (isBusy || dragRef.current?.moved) return;

    setResultsAndTotal((currentResults) =>
      currentResults.map((result) => (result.photoId === photoId ? { ...result, faces: result.faces.filter((face) => face.id !== faceId) } : result)),
    );
  }

  function startDrag(result: FaceDetectionPhotoResult, face: DetectedFace, event: PointerEvent<HTMLButtonElement>) {
    if (isBusy) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      faceId: face.id,
      moved: false,
      originX: face.box.x,
      originY: face.box.y,
      photoId: result.photoId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function moveDrag(result: FaceDetectionPhotoResult, face: DetectedFace, event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.faceId !== face.id || drag.photoId !== result.photoId) return;

    const preview = event.currentTarget.parentElement;
    if (!preview || !result.imageWidth || !result.imageHeight) return;

    const imageWidth = result.imageWidth;
    const imageHeight = result.imageHeight;
    const rect = preview.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / rect.width) * imageWidth;
    const deltaY = ((event.clientY - drag.startY) / rect.height) * imageHeight;
    const moved = Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3;

    dragRef.current = { ...drag, moved: drag.moved || moved };

    updateResult(result.photoId, (currentResult) => ({
      ...currentResult,
      faces: currentResult.faces.map((currentFace) =>
        currentFace.id === face.id
          ? {
              ...currentFace,
              box: {
                ...currentFace.box,
                x: clamp(drag.originX + deltaX, 0, Math.max(0, imageWidth - currentFace.box.width)),
                y: clamp(drag.originY + deltaY, 0, Math.max(0, imageHeight - currentFace.box.height)),
              },
            }
          : currentFace,
      ),
    }));
  }

  function endDrag(photoId: string, faceId: string, event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.faceId !== faceId || drag.photoId !== photoId) return;

    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }

    window.setTimeout(() => {
      dragRef.current = null;
    }, 0);
  }

  async function saveEstimate() {
    if (!selectedMinute) {
      toast.error("Selecione uma ata para salvar a frequência.");
      return;
    }

    const parsedAdjustedTotal = Number(adjustedTotal);
    const finalTotal = Math.max(0, Math.round(parsedAdjustedTotal));

    if (!adjustedTotal.trim() || !Number.isFinite(parsedAdjustedTotal)) {
      toast.error("Informe o total ajustado.");
      return;
    }

    setIsSaving(true);
    setProgressMessage("Salvando frequência...");
    try {
      await onSave(selectedMinute, {
        adjustedTotal: finalTotal,
        detectedTotal,
        finalTotal,
        meetingDate: selectedMinute.date,
        model: results.find((result) => result.model)?.model,
        photoResults: results.map((result) => ({
          boxes: result.faces.map((face) => normalizedBox(face, result)),
          detectedFaces: result.faces.length,
          fileName: result.fileName,
          imageHeight: result.imageHeight,
          imageWidth: result.imageWidth,
        })),
        registeredAt: new Date().toISOString(),
        registeredByUserId: currentUserId,
      });
      toast.success("Frequência salva a partir da estimativa por foto.");
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar a frequência.");
    } finally {
      setIsSaving(false);
      setProgressMessage("");
    }
  }

  return (
    <Drawer onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeDrawer())} open={open}>
      <DrawerContent className="sm:max-w-5xl" direction="right">
        <DrawerHeader className="border-b">
          <DrawerTitle>Calcular frequência por foto</DrawerTitle>
          <DrawerDescription>YOLOv8s em alta sensibilidade detecta pessoas na foto inteira, em cortes, e usa rostos como fallback. Ajuste as marcações antes de salvar.</DrawerDescription>
        </DrawerHeader>

        <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {isBusy ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/75 backdrop-blur-[1px]">
              <div className="flex min-w-56 items-center gap-3 rounded-lg bg-background px-4 py-3 shadow-lg ring-1 ring-black/10 dark:ring-white/10">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="text-sm font-medium">{progressMessage || "Processando..."}</span>
              </div>
            </div>
          ) : null}

          <div className="space-y-5">
            <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
              <div className="space-y-2">
                <Label>Ata da reunião</Label>
                <Select disabled={isBusy} value={selectedMinute?.id ?? ""} onValueChange={setSelectedMinuteId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione uma ata" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedMinutes.map((minute) => (
                      <SelectItem key={minute.id} value={minute.id}>
                        {minute.date} · {minute.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fotos da reunião</Label>
                <label
                  className={cn(
                    "flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center transition-colors",
                    isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50",
                  )}
                >
                  <Upload className="mb-2 size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Selecionar de 1 a 6 fotos</span>
                  <span className="mt-1 text-xs text-muted-foreground">As fotos originais nao sao salvas; as marcações ficam no registro da ata.</span>
                  <Input accept="image/*" className="sr-only" disabled={isBusy} multiple onChange={(event) => selectFiles(event.target.files)} type="file" />
                </label>
                {files.length ? <p className="text-xs text-muted-foreground">{files.map((file) => file.name).join(", ")}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!files.length || isBusy} onClick={detectFaces} type="button">
                {isDetecting ? <Loader2 className="animate-spin" /> : <Camera />}
                Detectar com YOLOv8s
              </Button>
              {results.length ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">{faceCountLabel(detectedTotal)}</span> marcadas
                </p>
              ) : null}
            </div>

            {results.length ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {results.map((result, index) => (
                  <div className="rounded-lg bg-card p-3 shadow-sm ring-1 ring-black/10 dark:ring-white/10" key={result.photoId}>
                    <div className="flex items-center justify-between gap-3 pb-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{result.fileName}</p>
                        <p className="text-xs text-muted-foreground">Clique na foto para adicionar. Clique na caixa para remover. Arraste para mover.</p>
                      </div>
                      <Badge className="shrink-0 tabular-nums" variant="secondary">
                        {faceCountLabel(result.faces.length)}
                      </Badge>
                    </div>

                    {result.imageUrl ? (
                      <div
                        className="relative overflow-hidden rounded-md bg-muted outline outline-1 outline-black/10 dark:outline-white/10"
                        onPointerDown={(event) => addPersonMark(result, event)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={`Foto ${index + 1}`} className="block w-full select-none object-contain" draggable={false} src={result.imageUrl} />
                        {result.faces.map((face) => (
                          <button
                            aria-label="Remover ou arrastar marcação"
                            className={cn(
                              "absolute touch-none rounded-[4px] border-2 shadow-sm transition-[border-color,box-shadow]",
                              markerClassName(face.source),
                              "hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            )}
                            data-person-box
                            key={face.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              removePersonMark(result.photoId, face.id);
                            }}
                            onPointerDown={(event) => startDrag(result, face, event)}
                            onPointerMove={(event) => moveDrag(result, face, event)}
                            onPointerUp={(event) => endDrag(result.photoId, face.id, event)}
                            style={boxToPercentStyle(face, result)}
                            title="Arraste para mover. Clique para remover."
                            type="button"
                          >
                            <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-background text-[10px] font-semibold tabular-nums shadow-sm ring-1 ring-black/10 dark:ring-white/10">
                              {markerLabel(face)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-56 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">Sem visualizacao</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-card p-4 text-sm text-muted-foreground shadow-sm ring-1 ring-black/10 dark:ring-white/10">
                Depois da detecção, cada foto aparecerá com marcações editáveis. As caixas salvas ficam prontas para exportação de dataset no futuro.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label>Total final</Label>
                <Input disabled={isBusy} inputMode="numeric" min={0} onChange={(event) => setAdjustedTotal(event.target.value)} placeholder="Total final" type="number" value={adjustedTotal} />
              </div>
              <div className="flex items-end text-xs text-muted-foreground">
                O total acompanha as marcações, mas pode ser ajustado manualmente quando a mesma pessoa aparecer em mais de uma foto.
              </div>
            </div>
          </div>
        </div>

        <DrawerFooter className="border-t bg-background sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">Modelo atual: YOLOv8s COCO em cortes + fallback facial. As caixas são salvas normalizadas para dataset futuro.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button disabled={isBusy} onClick={closeDrawer} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button disabled={!results.length || !adjustedTotal.trim() || isBusy} onClick={saveEstimate} type="button">
              {isSaving ? <Loader2 className="animate-spin" /> : null}
              Salvar frequência
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

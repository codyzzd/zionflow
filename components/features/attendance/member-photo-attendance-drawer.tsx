"use client";

import { Camera, Loader2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { detectFacesFromPhotos, type DetectedFace } from "@/lib/browser-face-detection";
import { localTodayDate } from "@/lib/utils";
import type { Member, MemberAttendanceRecord } from "@/types/domain";

type FaceStatus = "unidentified" | "confirmed" | "ignored" | "visitor" | "unknown" | "duplicate";

type FaceAssignment = DetectedFace & {
  fileName: string;
  memberId: string;
  status: FaceStatus;
};

type MemberPhotoAttendanceDrawerProps = {
  currentUserId?: string;
  members: Member[];
  onImportRecords: (records: Array<Omit<MemberAttendanceRecord, "id" | "source"> & { id?: string; source?: MemberAttendanceRecord["source"] }>) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const statusLabels: Record<FaceStatus, string> = {
  confirmed: "Confirmado",
  duplicate: "Duplicado",
  ignored: "Ignorado",
  unidentified: "Nao identificado",
  unknown: "Nao sei quem e",
  visitor: "Visitante",
};

export function MemberPhotoAttendanceDrawer({ currentUserId, members, onImportRecords, onOpenChange, open }: MemberPhotoAttendanceDrawerProps) {
  const sortedMembers = useMemo(() => [...members].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [members]);
  const [attendanceDate, setAttendanceDate] = useState(localTodayDate());
  const [files, setFiles] = useState<File[]>([]);
  const [faces, setFaces] = useState<FaceAssignment[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  const confirmedMemberIds = useMemo(
    () => Array.from(new Set(faces.filter((face) => face.status === "confirmed" && face.memberId).map((face) => face.memberId))),
    [faces],
  );
  const duplicateConfirmedCount = faces.filter((face) => face.status === "confirmed" && face.memberId).length - confirmedMemberIds.length;

  function reset() {
    setAttendanceDate(localTodayDate());
    setFiles([]);
    setFaces([]);
    setIsDetecting(false);
  }

  function closeDrawer() {
    reset();
    onOpenChange(false);
  }

  function selectFiles(fileList: FileList | null) {
    const nextFiles = Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 6);
    setFiles(nextFiles);
    setFaces([]);

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
    try {
      const results = await detectFacesFromPhotos(files);
      const nextFaces = results.flatMap((result) =>
        result.faces.map((face) => ({
          ...face,
          fileName: result.fileName,
          memberId: "",
          status: "unidentified" as const,
        })),
      );

      setFaces(nextFaces);
      toast.success(`${nextFaces.length} ${nextFaces.length === 1 ? "rosto detectado" : "rostos detectados"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel detectar rostos nas fotos.");
    } finally {
      setIsDetecting(false);
    }
  }

  function updateFace(faceId: string, patch: Partial<FaceAssignment>) {
    setFaces((currentFaces) =>
      currentFaces.map((face) => {
        if (face.id !== faceId) return face;
        const nextFace = { ...face, ...patch };

        if (patch.memberId) nextFace.status = "confirmed";
        if (patch.status && patch.status !== "confirmed") nextFace.memberId = "";

        return nextFace;
      }),
    );
  }

  function confirmAttendance() {
    if (!attendanceDate) {
      toast.error("Informe a data da frequência.");
      return;
    }

    if (!confirmedMemberIds.length) {
      toast.error("Selecione pelo menos um membro confirmado.");
      return;
    }

    const confirmedAt = new Date().toISOString();
    onImportRecords(
      confirmedMemberIds.map((memberId) => ({
        confirmedAt,
        confirmedByUserId: currentUserId,
        date: attendanceDate,
        memberId,
        present: true,
        source: "photo",
        wardId: "",
      })),
    );
    toast.success(`${confirmedMemberIds.length} ${confirmedMemberIds.length === 1 ? "presenca confirmada" : "presencas confirmadas"} por foto.`);
    closeDrawer();
  }

  return (
    <Drawer onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : closeDrawer())} open={open}>
      <DrawerContent className="sm:max-w-4xl" direction="right">
        <DrawerHeader>
          <DrawerTitle>Atualizar frequência por foto</DrawerTitle>
          <DrawerDescription>Detecta rostos, mas a identificação é manual. Apenas membros confirmados serão marcados como presentes.</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label>Data da frequência</Label>
                <Input onChange={(event) => setAttendanceDate(event.target.value)} type="date" value={attendanceDate} />
              </div>

              <div className="space-y-2">
                <Label>Fotos</Label>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 px-4 py-5 text-center transition-colors hover:bg-muted/50">
                  <Upload className="mb-2 size-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Selecionar fotos</span>
                  <span className="mt-1 text-xs text-muted-foreground">As fotos originais nao sao salvas.</span>
                  <Input accept="image/*" className="sr-only" multiple onChange={(event) => selectFiles(event.target.files)} type="file" />
                </label>
                {files.length ? <p className="text-xs text-muted-foreground">{files.map((file) => file.name).join(", ")}</p> : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!files.length || isDetecting} onClick={detectFaces} type="button">
                {isDetecting ? <Loader2 className="animate-spin" /> : <Camera />}
                Detectar rostos
              </Button>
              {faces.length ? (
                <p className="text-sm text-muted-foreground">
                  {confirmedMemberIds.length} confirmados · {faces.length} rostos detectados
                </p>
              ) : null}
            </div>

            {duplicateConfirmedCount > 0 ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                Existem rostos confirmados para membros repetidos. O salvamento registra cada membro uma vez.
              </div>
            ) : null}

            {faces.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {faces.map((face, index) => (
                  <div className="rounded-lg border bg-card p-3" key={face.id}>
                    <div className="flex items-start gap-3">
                      {face.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`Rosto ${index + 1}`} className="size-20 rounded-md border object-cover" src={face.imageUrl} />
                      ) : (
                        <div className="flex size-20 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">Rosto</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">Rosto {index + 1}</p>
                        <p className="truncate text-xs text-muted-foreground">{face.fileName}</p>
                        <Badge className="mt-2" variant={face.status === "confirmed" ? "secondary" : "outline"}>
                          {statusLabels[face.status]}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Label>Quem é essa pessoa?</Label>
                      <Select value={face.memberId} onValueChange={(memberId) => updateFace(face.id, { memberId })}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecionar membro" />
                        </SelectTrigger>
                        <SelectContent>
                          {sortedMembers.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button onClick={() => updateFace(face.id, { status: "ignored" })} size="sm" type="button" variant="outline">
                        Ignorar
                      </Button>
                      <Button onClick={() => updateFace(face.id, { status: "visitor" })} size="sm" type="button" variant="outline">
                        Visitante
                      </Button>
                      <Button onClick={() => updateFace(face.id, { status: "unknown" })} size="sm" type="button" variant="outline">
                        Nao sei
                      </Button>
                      <Button onClick={() => updateFace(face.id, { status: "duplicate" })} size="sm" type="button" variant="outline">
                        Duplicado
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Depois da detecção, cada rosto aparecerá aqui para associação manual, visitante, ignorado ou duplicado.
              </div>
            )}
          </div>
        </div>

        <DrawerFooter className="border-t sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">A IA ajuda a separar rostos; a confirmação humana decide o que será salvo.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={closeDrawer} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={!confirmedMemberIds.length} onClick={confirmAttendance} type="button">
              Confirmar atualização
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

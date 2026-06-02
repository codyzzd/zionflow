"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { parseCoordinateInput } from "@/lib/coordinates";
import { TALK_DURATION_OPTIONS, talkDurationLabels } from "@/lib/member-talk-duration";
import { buildMemberTalkHistory } from "@/lib/member-talk-history";
import { normalizeDateInput } from "@/lib/utils";
import type { Member } from "@/types/domain";

const sexLabels: Record<Member["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

const churchActivityStatusLabels: Record<Member["churchActivityStatus"], string> = {
  away: "Afastado",
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

type MemberForm = Omit<Member, "id" | "wardId">;

function calculateAge(birthDate: string) {
  const normalizedDate = normalizeDateInput(birthDate);
  if (!normalizedDate) return null;

  const today = new Date();
  const birth = new Date(`${normalizedDate}T12:00:00`);
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function memberToForm(member: Member): MemberForm {
  return {
    name: member.name,
    phone: member.phone,
    address: member.address,
    latitude: member.latitude,
    longitude: member.longitude,
    churchActivityStatus: member.churchActivityStatus,
    birthDate: member.birthDate,
    organization: member.organization,
    sex: member.sex,
    sacramentTalkDuration: member.sacramentTalkDuration,
    canSpeak: member.canSpeak,
    canPreside: member.canPreside,
    canConduct: member.canConduct,
  };
}

export default function MemberDetailPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = use(params);
  const { currentWard, hasPermission, membersByWard, minutesByWard, saveMember } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManage = hasPermission("members.manage");

  const memberData = membersByWard.find((item) => item.id === memberId);
  if (!memberData) notFound();
  const member = memberData;

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<MemberForm>(memberToForm(member));

  const talkHistoryByMemberId = useMemo(() => buildMemberTalkHistory(minutesByWard), [minutesByWard]);
  const talkHistory = talkHistoryByMemberId.get(member.id);
  const memberAge = calculateAge(member.birthDate);

  function handleEdit() {
    setForm(memberToForm(member));
    setIsEditing(true);
  }

  function handleCancel() {
    setForm(memberToForm(member));
    setIsEditing(false);
  }

  function handleSave() {
    if (!currentWard || !form.name.trim()) return;
    saveMember({
      id: member.id,
      wardId: currentWard.id,
      ...form,
      address: form.address.trim(),
      birthDate: form.birthDate.trim(),
      name: form.name.trim(),
      organization: form.organization.trim(),
      phone: form.phone.trim(),
    });
    setIsEditing(false);
  }

  return (
    <div className="mx-auto max-w-[800px]">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link className="text-muted-foreground transition hover:text-foreground" href="/members">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Perfil do Membro</p>
          </div>
          <h1 className="mt-1 text-3xl font-semibold">{isEditing ? form.name || member.name : member.name}</h1>
        </div>

        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button onClick={handleCancel} variant="outline">
                Cancelar
              </Button>
              <Button disabled={!currentWard || !form.name.trim()} onClick={handleSave}>
                Salvar alterações
              </Button>
            </>
          ) : canManage ? (
            <Button onClick={handleEdit}>Editar membro</Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Dados principais</CardTitle>
            <CardDescription>Informações usadas no cadastro de membros e na ata sacramental.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Nome completo</Label>
                    <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      inputMode="tel"
                      placeholder="ex: (00) 00000-0000"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Condição na igreja</Label>
                    <Select
                      value={form.churchActivityStatus}
                      onValueChange={(v) => v && setForm((f) => ({ ...f, churchActivityStatus: v as Member["churchActivityStatus"] }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="attending">Frequentando</SelectItem>
                        <SelectItem value="not_attending">Não frequentando</SelectItem>
                        <SelectItem value="away">Afastado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Endereço</Label>
                    <Input
                      placeholder="ex: Rua, número, bairro, cidade"
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Latitude</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="ex: -3.7319"
                      value={form.latitude ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, latitude: parseCoordinateInput(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input
                      inputMode="decimal"
                      placeholder="ex: -38.5267"
                      value={form.longitude ?? ""}
                      onChange={(e) => setForm((f) => ({ ...f, longitude: parseCoordinateInput(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Data de nascimento</Label>
                    <DatePicker value={form.birthDate} onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))} />
                  </div>
                  <div>
                    <Label>Sexo</Label>
                    <Select value={form.sex} onValueChange={(v) => v && setForm((f) => ({ ...f, sex: v as Member["sex"] }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nível de discurso</Label>
                    <Select
                      value={form.sacramentTalkDuration}
                      onValueChange={(v) => v && setForm((f) => ({ ...f, sacramentTalkDuration: v as Member["sacramentTalkDuration"] }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TALK_DURATION_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Condição na igreja</p>
                    <p className="font-medium">{churchActivityStatusLabels[member.churchActivityStatus]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Telefone</p>
                    <p className="font-medium">{member.phone || "Não informado"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Endereço</p>
                    <p className="font-medium">{member.address || "Não informado"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Coordenadas</p>
                    <p className="font-medium">
                      {member.latitude !== undefined && member.longitude !== undefined ? `${member.latitude}, ${member.longitude}` : "Não mapeado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sexo</p>
                    <p className="font-medium">{sexLabels[member.sex]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nascimento</p>
                    <p className="text-lg font-semibold tabular-nums">{memberAge === null ? "Idade não informada" : `${memberAge} anos`}</p>
                    <p className="text-xs text-muted-foreground">{member.birthDate ? formatDate(member.birthDate) : "Data não informada"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nível de discurso</p>
                    <p className="font-medium">{talkDurationLabels[member.sacramentTalkDuration]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Último discurso</p>
                    {talkHistory ? (
                      <>
                        <p className="font-medium">{talkHistory.summary}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(talkHistory.lastTalkDate)}</p>
                      </>
                    ) : (
                      <p className="font-medium text-muted-foreground">Sem discurso registrado</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

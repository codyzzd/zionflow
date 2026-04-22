"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use, useState } from "react";

import { MemberOrganizationLabel } from "@/components/features/members/member-organization";
import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cn } from "@/lib/utils";
import { MEMBER_ORGANIZATION_OPTIONS, type Member } from "@/types/domain";

const sexLabels: Record<Member["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

const talkDurationLabels: Record<Member["sacramentTalkDuration"], string> = {
  "5": "5 minutos",
  "10": "10 minutos",
  "15": "15 minutos",
};

type MemberForm = Omit<Member, "id" | "wardId">;

function memberToForm(member: Member): MemberForm {
  return {
    name: member.name,
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
  const { currentWard, hasPermission, membersByWard, saveMember, usersByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManage = hasPermission("members.manage");

  const memberData = membersByWard.find((item) => item.id === memberId);
  if (!memberData) notFound();
  const member = memberData;

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<MemberForm>(memberToForm(member));

  const linkedUser = usersByWard.find((user) => user.memberId === member.id);

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
      birthDate: form.birthDate.trim(),
      name: form.name.trim(),
      organization: form.organization.trim(),
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
        <div className="flex flex-wrap gap-2">
          {member.canSpeak ? <Badge>Orador</Badge> : null}
          {member.canPreside ? <Badge variant="outline">Preside reunião</Badge> : null}
          {member.canConduct ? <Badge variant="outline">Dirige reunião</Badge> : null}
          {linkedUser ? <Badge variant="outline">Usuário vinculado: {linkedUser.email}</Badge> : <Badge variant="secondary">Sem usuário vinculado</Badge>}
        </div>

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
                    <Label>Data de nascimento</Label>
                    <Input type="date" value={form.birthDate} onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))} />
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
                    <Label>Organização</Label>
                    <Select value={form.organization} onValueChange={(v) => v && setForm((f) => ({ ...f, organization: v }))}>
                      <SelectTrigger className="w-full">
                        <MemberOrganizationLabel organization={form.organization} placeholder="Selecione a organização" />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBER_ORGANIZATION_OPTIONS.map((organization) => (
                          <SelectItem key={organization} value={organization}>
                            <MemberOrganizationLabel organization={organization} />
                          </SelectItem>
                        ))}
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
                        <SelectItem value="5">5 minutos</SelectItem>
                        <SelectItem value="10">10 minutos</SelectItem>
                        <SelectItem value="15">15 minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2 rounded-lg border bg-secondary/35 p-4 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={form.canSpeak}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, canSpeak: checked === true }))}
                    />
                    Pode ser orador
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={form.canPreside}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, canPreside: checked === true }))}
                    />
                    Pode presidir reunião
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={form.canConduct}
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, canConduct: checked === true }))}
                    />
                    Pode dirigir reunião
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Sexo</p>
                    <p className="font-medium">{sexLabels[member.sex]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data de nascimento</p>
                    <p className="font-medium">{member.birthDate ? formatDate(member.birthDate) : "Não informada"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Nível de discurso</p>
                    <p className="font-medium">{talkDurationLabels[member.sacramentTalkDuration]}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Organização</p>
                    <MemberOrganizationLabel className="mt-1 font-medium" organization={member.organization} placeholder="Não informada" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Ata sacramental</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {member.canSpeak ? <Badge>Orador</Badge> : null}
                      {member.canPreside ? <Badge variant="outline">Preside</Badge> : null}
                      {member.canConduct ? <Badge variant="outline">Dirige</Badge> : null}
                      {!member.canSpeak && !member.canPreside && !member.canConduct ? <Badge variant="secondary">Sem permissões</Badge> : null}
                    </div>
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

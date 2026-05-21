"use client";

import { Check, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { normalizeDateInput } from "@/lib/utils";
import type { CaravanPerson, CaravanRegistration } from "@/types/domain";

function getOccupiedSeats(registrations: CaravanRegistration[], caravanId: string) {
  return registrations.filter((registration) => registration.caravanId === caravanId && registration.consumesSeat !== false).length;
}

function getSeatOccupancyPercentage(occupiedSeats: number, availableSeats: number) {
  if (availableSeats <= 0) return 0;

  return Math.min(100, Math.max(0, Math.round((occupiedSeats / availableSeats) * 100)));
}

function getAgeLabel(birthDate: string) {
  const normalizedBirthDate = normalizeDateInput(birthDate);
  if (!normalizedBirthDate) return "idade não informada";

  const birth = new Date(`${normalizedBirthDate}T12:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayThisYear = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());

  if (today < birthdayThisYear) {
    age -= 1;
  }

  if (age < 0) return "idade não informada";

  return age === 1 ? "1 ano" : `${age} anos`;
}

function BooleanStatusIcon({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span
      aria-label={label}
      className={
        checked
          ? "inline-flex size-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60"
          : "inline-flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border"
      }
      title={label}
    >
      {checked ? <Check className="size-4" /> : <X className="size-4" />}
    </span>
  );
}

function RegisteredPeopleTable({
  peopleById,
  registrations,
}: {
  peopleById: Map<string, CaravanPerson>;
  registrations: CaravanRegistration[];
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pessoa</TableHead>
            <TableHead className="w-[112px] text-center">Ocupa banco</TableHead>
            <TableHead className="w-[96px] text-center">Aprovado</TableHead>
            <TableHead className="w-[80px] text-center">Pago</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {registrations.map((registration) => {
            const person = peopleById.get(registration.personId);
            if (!person) return null;

            return (
              <TableRow key={registration.id}>
                <TableCell>
                  <div className="min-w-[160px]">
                    <p className="truncate font-medium">{person.name}</p>
                    <p className="text-sm text-muted-foreground">{getAgeLabel(person.birthDate)}</p>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <BooleanStatusIcon
                    checked={registration.consumesSeat}
                    label={registration.consumesSeat ? "Ocupa banco" : "Não ocupa banco"}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <BooleanStatusIcon checked={registration.isApproved} label={registration.isApproved ? "Aprovado" : "Não aprovado"} />
                </TableCell>
                <TableCell className="text-center">
                  <BooleanStatusIcon checked={registration.isPaid} label={registration.isPaid ? "Pago" : "Não pago"} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CaravanDetailPage() {
  const params = useParams<{ caravanId: string }>();
  const { caravanPeopleByWard, caravanRegistrationsByWard, caravansByWard, db, hasPermission, saveCaravanRegistration } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageRegistration = hasPermission("caravan.register.manage");
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [isLapChild, setIsLapChild] = useState(false);
  const caravan = caravansByWard.find((item) => item.id === params.caravanId && !item.archivedAt);
  const registrations = useMemo(
    () => caravanRegistrationsByWard.filter((registration) => registration.caravanId === params.caravanId),
    [caravanRegistrationsByWard, params.caravanId],
  );
  const registeredPersonIds = useMemo(() => new Set(registrations.map((registration) => registration.personId)), [registrations]);
  const peopleById = useMemo(() => new Map(db.caravanPeople.map((person) => [person.id, person])), [db.caravanPeople]);
  const availablePeople = useMemo(
    () =>
      caravanPeopleByWard
        .filter((person) => !registeredPersonIds.has(person.id))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
    [caravanPeopleByWard, registeredPersonIds],
  );
  const sortedRegistrations = useMemo(
    () =>
      registrations
        .filter((registration) => peopleById.has(registration.personId))
        .sort((a, b) => {
          const personA = peopleById.get(a.personId)?.name ?? "";
          const personB = peopleById.get(b.personId)?.name ?? "";

          return personA.localeCompare(personB, "pt-BR", { sensitivity: "base" });
        }),
    [peopleById, registrations],
  );

  if (!caravan) {
    return (
      <PermissionGuard permission="caravan.register.view">
        <div className="mx-auto max-w-[800px]">
          <PageHeader
            backHref="/caravans"
            title="Caravana não encontrada"
            description="A caravana pode ter sido removida ou não pertence à ala atual."
          />
        </div>
      </PermissionGuard>
    );
  }

  const currentCaravan = caravan;
  const occupiedSeats = getOccupiedSeats(caravanRegistrationsByWard, currentCaravan.id);
  const remainingSeats = Math.max(0, currentCaravan.availableSeats - occupiedSeats);
  const seatOccupancyPercentage = getSeatOccupancyPercentage(occupiedSeats, currentCaravan.availableSeats);
  const seatsAreAlmostFull = remainingSeats <= 10;
  const canRegister = Boolean(selectedPersonId) && (isLapChild || remainingSeats > 0);

  function registerPerson() {
    if (!selectedPersonId || !canRegister) return;

    saveCaravanRegistration({
      wardId: currentCaravan.wardId,
      caravanId: currentCaravan.id,
      personId: selectedPersonId,
      consumesSeat: !isLapChild,
      isApproved: false,
      isPaid: false,
    });
    setSelectedPersonId("");
    setIsLapChild(false);
  }

  return (
    <PermissionGuard permission="caravan.register.view">
      <div className="mx-auto max-w-[800px]">
        <PageHeader
          backHref="/caravans"
          eyebrow="Caravana"
          title={currentCaravan.destination}
          description="Detalhes da caravana e área de inscrição de pessoas."
        />

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações da caravana</CardTitle>
              <CardDescription>Partida, retorno e disponibilidade atual de bancos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Partida</p>
                  <p className="font-medium">{formatDate(currentCaravan.departureDate)}</p>
                  <p className="text-sm text-muted-foreground">{currentCaravan.departureTime}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Retorno</p>
                  <p className="font-medium">{formatDate(currentCaravan.returnDate)}</p>
                  <p className="text-sm text-muted-foreground">{currentCaravan.returnTime}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Bancos</p>
                  <Badge variant="secondary">{`${occupiedSeats}/${currentCaravan.availableSeats}`}</Badge>
                  <div
                    aria-label={`${seatOccupancyPercentage}% dos bancos ocupados`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={seatOccupancyPercentage}
                    className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                  >
                    <div
                      className={
                        seatsAreAlmostFull
                          ? "h-full rounded-full bg-destructive transition-[width,background-color] duration-300"
                          : "h-full rounded-full bg-emerald-600 transition-[width,background-color] duration-300 dark:bg-emerald-500"
                      }
                      style={{ width: `${seatOccupancyPercentage}%` }}
                    />
                  </div>
                  <p className={seatsAreAlmostFull ? "text-sm font-medium text-destructive" : "text-sm text-muted-foreground"}>
                    {remainingSeats} disponíveis
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {canManageRegistration ? (
          <Card>
            <CardHeader>
              <CardTitle>Inscrição de pessoas</CardTitle>
              <CardDescription>Selecione uma pessoa cadastrada para vincular a esta caravana.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-2">
                  <Label>Pessoa</Label>
                  <Select
                    disabled={!availablePeople.length}
                    value={selectedPersonId}
                    onValueChange={(value) => value && setSelectedPersonId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={availablePeople.length ? "Selecione uma pessoa" : "Nenhuma pessoa disponível"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeople.map((person) => (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name} - {getAgeLabel(person.birthDate)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <Checkbox
                    checked={isLapChild}
                    id="lap-child"
                    onCheckedChange={(checked) => setIsLapChild(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label className="mb-0" htmlFor="lap-child">
                      Criança de colo
                    </Label>
                    <p className="text-sm text-muted-foreground">Não ocupa banco na caravana.</p>
                  </div>
                </div>
              </div>

              {!isLapChild && remainingSeats === 0 ? (
                <p className="text-sm text-destructive">Não há bancos disponíveis para uma inscrição que ocupa banco.</p>
              ) : null}

              <Button disabled={!canRegister} onClick={registerPerson}>
                Inserir pessoa
              </Button>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">Pessoas inscritas</h3>
                  <Badge variant="outline">{sortedRegistrations.length}</Badge>
                </div>
                {sortedRegistrations.length ? (
                  <RegisteredPeopleTable peopleById={peopleById} registrations={sortedRegistrations} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma pessoa inscrita nesta caravana.</p>
                )}
              </div>
            </CardContent>
          </Card>
          ) : null}

          {!canManageRegistration ? (
            <Card>
              <CardHeader>
                <CardTitle>Pessoas inscritas</CardTitle>
                <CardDescription>Consulta das pessoas já vinculadas a esta caravana.</CardDescription>
              </CardHeader>
              <CardContent>
                {sortedRegistrations.length ? (
                  <RegisteredPeopleTable peopleById={peopleById} registrations={sortedRegistrations} />
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma pessoa inscrita nesta caravana.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </PermissionGuard>
  );
}

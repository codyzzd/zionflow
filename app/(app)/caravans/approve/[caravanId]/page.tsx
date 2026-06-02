"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DollarSign, ThumbsUp } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { DeleteTableActionButton } from "@/components/ui/delete-confirmation-dialog";
import { TableActionButton } from "@/components/ui/table-action-button";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { normalizeDateInput } from "@/lib/utils";
import type { CaravanPerson, CaravanRegistration } from "@/types/domain";

type PassengerRow = {
  registration: CaravanRegistration;
  person: CaravanPerson;
};

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

export default function CaravanApprovalDetailPage() {
  const params = useParams<{ caravanId: string }>();
  const {
    caravanRegistrationsByWard,
    caravansByWard,
    db,
    deleteCaravanRegistration,
    hasPermission,
    saveCaravanRegistration,
  } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManageApprovals = hasPermission("caravan.approve.manage");
  const caravan = caravansByWard.find((item) => item.id === params.caravanId && !item.archivedAt);
  const peopleById = useMemo(() => new Map(db.caravanPeople.map((person) => [person.id, person])), [db.caravanPeople]);
  const passengerRows = useMemo<PassengerRow[]>(
    () =>
      caravanRegistrationsByWard
        .filter((registration) => registration.caravanId === params.caravanId)
        .map((registration) => {
          const person = peopleById.get(registration.personId);

          return person ? { registration, person } : null;
        })
        .filter((row): row is PassengerRow => Boolean(row))
        .sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR", { sensitivity: "base" })),
    [caravanRegistrationsByWard, params.caravanId, peopleById],
  );

  const updateRegistration = useCallback(
    (registration: CaravanRegistration, updates: Partial<Pick<CaravanRegistration, "isApproved" | "isPaid">>) => {
      saveCaravanRegistration({
        ...registration,
        ...updates,
      });
    },
    [saveCaravanRegistration],
  );

  const approvedCount = passengerRows.filter((row) => row.registration.isApproved).length;
  const paidCount = passengerRows.filter((row) => row.registration.isPaid).length;

  const columns = useMemo<ColumnDef<PassengerRow>[]>(
    () => [
      {
        id: "person",
        header: "Passageiro",
        cell: ({ row }) => (
          <div className="min-w-0 space-y-1">
            <p className="truncate font-medium">{row.original.person.name}</p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{getAgeLabel(row.original.person.birthDate)}</span>
              <span>{row.original.registration.consumesSeat ? "Ocupa banco" : "Criança de colo"}</span>
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => {
          const { person, registration } = row.original;

          return (
            <div className="flex flex-wrap justify-end gap-1">
              <TableActionButton
                aria-label={registration.isApproved ? `Remover ok de ${person.name}` : `Marcar ${person.name} como ok`}
                className={
                  registration.isApproved
                    ? "size-10 border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                    : "size-10 border-border text-muted-foreground hover:text-foreground"
                }
                disabled={!canManageApprovals}
                label={registration.isApproved ? "Remover ok" : "Marcar como ok"}
                onClick={() => updateRegistration(registration, { isApproved: !registration.isApproved })}
                size="icon"
                tooltip={canManageApprovals ? (registration.isApproved ? "Remover ok" : "Marcar como ok") : "Somente leitura"}
                variant={registration.isApproved ? "default" : "outline"}
              >
                <ThumbsUp />
              </TableActionButton>

              <TableActionButton
                aria-label={registration.isPaid ? `Remover pagamento de ${person.name}` : `Marcar ${person.name} como pago`}
                className={registration.isPaid ? "size-10" : "size-10 border-border text-muted-foreground hover:text-foreground"}
                disabled={!canManageApprovals}
                label={registration.isPaid ? "Remover pagamento" : "Marcar como pago"}
                onClick={() => updateRegistration(registration, { isPaid: !registration.isPaid })}
                size="icon"
                tooltip={canManageApprovals ? (registration.isPaid ? "Remover pagamento" : "Marcar como pago") : "Somente leitura"}
                variant={registration.isPaid ? "default" : "outline"}
              >
                <DollarSign />
              </TableActionButton>

              <DeleteTableActionButton
                aria-label={`Excluir ${person.name}`}
                className="size-10"
                confirmLabel="Excluir passageiro"
                description={`Excluir ${person.name} desta caravana? Essa ação remove a inscrição do passageiro.`}
                disabled={!canManageApprovals}
                label="Excluir passageiro"
                onConfirm={() => deleteCaravanRegistration(registration.id)}
                size="icon"
                tooltip={canManageApprovals ? "Excluir passageiro" : "Somente leitura"}
              />
            </div>
          );
        },
      },
    ],
    [canManageApprovals, deleteCaravanRegistration, updateRegistration],
  );

  if (!caravan) {
    return (
      <PermissionGuard permission="caravan.approve.view">
        <div className="mx-auto max-w-[800px]">
          <PageHeader
            backHref="/caravans/approve"
            title="Caravana não encontrada"
            description="A caravana pode ter sido removida ou não pertence à ala atual."
          />
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="caravan.approve.view">
      <div>
        <PageHeader
          backHref="/caravans/approve"
          eyebrow="Aprovar"
          title={caravan.destination}
          description={`${formatDate(caravan.departureDate)} às ${caravan.departureTime}. Confira os passageiros inscritos nesta caravana.`}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="tabular-nums">
            {passengerRows.length} passageiro(s)
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            {approvedCount}/{passengerRows.length} ok
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            {paidCount}/{passengerRows.length} pago
          </Badge>
        </div>

        <DataTable
          columns={columns}
          data={passengerRows}
          emptyMessage="Nenhum passageiro inscrito nesta caravana."
          getRowId={(row) => row.registration.id}
        />
      </div>
    </PermissionGuard>
  );
}

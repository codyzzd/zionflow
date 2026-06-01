"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Archive, Eye } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/date-picker";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TablePrimaryAction } from "@/components/ui/table-primary-action";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { findBlockingCaravanForPersonArchive } from "@/lib/caravan-rules";
import type { CaravanPerson, CaravanPersonType, DocumentType, Ward } from "@/types/domain";

type CaravanPersonForm = Omit<CaravanPerson, "id" | "wardId">;
type DrawerMode = "create" | "view" | "edit";
type PersonStatusFilter = "active" | "archived";

const personTypeLabels: Record<CaravanPersonType, string> = {
  family: "Família",
  friends: "Amigos",
};

const personTypeBadgeClasses: Record<CaravanPersonType, string> = {
  family: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200",
  friends: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200",
};

const sexLabels: Record<CaravanPerson["sex"], string> = {
  M: "Masculino",
  F: "Feminino",
};

function calculateAge(birthDate: string) {
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;

  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function createEmptyForm(currentWard?: Ward, documentTypes: DocumentType[] = []): CaravanPersonForm {
  return {
    homeWardId: currentWard?.id ?? "",
    type: "family",
    name: "",
    birthDate: "",
    sex: "M",
    documentTypeId: documentTypes[0]?.id ?? "",
    documentValue: "",
    phone: "",
    notes: "",
  };
}

function personToForm(person: CaravanPerson): CaravanPersonForm {
  return {
    homeWardId: person.homeWardId,
    type: person.type,
    name: person.name,
    birthDate: person.birthDate,
    sex: person.sex,
    documentTypeId: person.documentTypeId,
    documentValue: person.documentValue,
    phone: person.phone,
    notes: person.notes,
  };
}

export default function CaravanPeoplePage() {
  const {
    activeDocumentTypes,
    archiveCaravanPerson,
    currentWard,
    db,
    hasPermission,
    saveCaravanPerson,
    unarchiveCaravanPerson,
    wards,
  } = useAppContext();
  const { formatDate } = useDateFormatter();
  const canManagePeople = hasPermission("caravan.manage.manage");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PersonStatusFilter>("active");
  const [form, setForm] = useState<CaravanPersonForm>(() => createEmptyForm(currentWard, activeDocumentTypes));
  const [selectedPerson, setSelectedPerson] = useState<CaravanPerson | null>(null);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isReadOnly = drawerMode === "view";
  const selectedPersonIsArchived = Boolean(selectedPerson?.archivedAt);

  const wardsById = useMemo(() => new Map(wards.map((ward) => [ward.id, ward])), [wards]);
  const documentTypesById = useMemo(() => new Map(db.documentTypes.map((documentType) => [documentType.id, documentType])), [db.documentTypes]);
  const peopleByWard = useMemo(
    () => (currentWard ? db.caravanPeople.filter((person) => person.wardId === currentWard.id) : []),
    [currentWard, db.caravanPeople],
  );
  const activePeopleCount = useMemo(() => peopleByWard.filter((person) => !person.archivedAt).length, [peopleByWard]);
  const archivedPeopleCount = useMemo(() => peopleByWard.filter((person) => person.archivedAt).length, [peopleByWard]);
  const blockingArchiveCaravan = useMemo(
    () =>
      selectedPerson
        ? findBlockingCaravanForPersonArchive({
            caravans: db.caravans,
            personId: selectedPerson.id,
            registrations: db.caravanRegistrations,
          })
        : undefined,
    [db.caravanRegistrations, db.caravans, selectedPerson],
  );
  const availableWards = useMemo(() => {
    if (!currentWard) return wards;
    return wards.filter((ward) => ward.stakeId === currentWard.stakeId);
  }, [currentWard, wards]);
  const documentTypeOptions = useMemo(() => {
    if (!form.documentTypeId || activeDocumentTypes.some((documentType) => documentType.id === form.documentTypeId)) {
      return activeDocumentTypes;
    }

    const selectedDocumentType = documentTypesById.get(form.documentTypeId);
    return selectedDocumentType ? [selectedDocumentType, ...activeDocumentTypes] : activeDocumentTypes;
  }, [activeDocumentTypes, documentTypesById, form.documentTypeId]);

  const filteredPeople = useMemo(
    () =>
      peopleByWard
        .filter((person) => {
          const normalizedSearch = search.trim().toLowerCase();
          const matchesStatus = statusFilter === "archived" ? Boolean(person.archivedAt) : !person.archivedAt;
          if (!matchesStatus) return false;
          if (!normalizedSearch) return true;

          const homeWardName = wardsById.get(person.homeWardId)?.name ?? "";
          const documentTypeName = documentTypesById.get(person.documentTypeId)?.name ?? "";

          return (
            person.name.toLowerCase().includes(normalizedSearch) ||
            person.documentValue.toLowerCase().includes(normalizedSearch) ||
            person.phone.toLowerCase().includes(normalizedSearch) ||
            homeWardName.toLowerCase().includes(normalizedSearch) ||
            documentTypeName.toLowerCase().includes(normalizedSearch)
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [documentTypesById, peopleByWard, search, statusFilter, wardsById],
  );

  function resetDrawerState() {
    setForm(createEmptyForm(currentWard, activeDocumentTypes));
    setSelectedPerson(null);
    setDrawerMode("create");
  }

  function handleDrawerOpenChange(open: boolean) {
    setDrawerOpen(open);

    if (!open) {
      resetDrawerState();
    }
  }

  function openCreateDrawer() {
    setForm(createEmptyForm(currentWard, activeDocumentTypes));
    setSelectedPerson(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }

  function openViewDrawer(person: CaravanPerson) {
    setSelectedPerson(person);
    setForm(personToForm(person));
    setDrawerMode("view");
    setDrawerOpen(true);
  }

  function openEditDrawer(person: CaravanPerson) {
    setSelectedPerson(person);
    setForm(personToForm(person));
    setDrawerMode("edit");
    setDrawerOpen(true);
  }

  function closeDrawer() {
    handleDrawerOpenChange(false);
  }

  const canSave =
    Boolean(currentWard) &&
    Boolean(form.name.trim()) &&
    Boolean(form.type) &&
    Boolean(form.sex) &&
    Boolean(form.homeWardId) &&
    Boolean(form.documentTypeId);

  function saveCurrentPerson() {
    if (!currentWard || !canSave) return;

    saveCaravanPerson({
      id: selectedPerson?.id,
      wardId: currentWard.id,
      homeWardId: form.homeWardId,
      type: form.type,
      name: form.name.trim(),
      birthDate: form.birthDate.trim(),
      sex: form.sex,
      documentTypeId: form.documentTypeId,
      documentValue: form.documentValue.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim(),
    });

    closeDrawer();
  }

  function archiveSelectedPerson() {
    if (!selectedPerson || blockingArchiveCaravan) return;

    archiveCaravanPerson(selectedPerson.id);
    closeDrawer();
  }

  function unarchiveSelectedPerson() {
    if (!selectedPerson) return;

    unarchiveCaravanPerson(selectedPerson.id);
    closeDrawer();
  }

  const drawerTitle = drawerMode === "create" ? "Nova pessoa" : drawerMode === "edit" ? "Editar pessoa" : selectedPerson?.name ?? "Pessoa";
  const drawerDescription =
    drawerMode === "view"
      ? selectedPersonIsArchived
        ? "Esta pessoa está arquivada e fica oculta nas demais áreas de caravana."
        : "Visualização dos dados cadastrados da pessoa."
      : "Informe os dados usados para organização da caravana.";

  const columns = useMemo<ColumnDef<CaravanPerson>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { label: "Nome" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nome {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const person = row.original;

          return (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <TablePrimaryAction onClick={() => openViewDrawer(person)}>{person.name}</TablePrimaryAction>
                {person.archivedAt ? <Badge variant="destructive">Arquivada</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">{sexLabels[person.sex]}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "type",
        meta: { label: "Tipo" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Tipo {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        sortingFn: (rowA, rowB) =>
          personTypeLabels[rowA.original.type].localeCompare(personTypeLabels[rowB.original.type], "pt-BR"),
        cell: ({ row }) => (
          <Badge className={personTypeBadgeClasses[row.original.type]} variant="outline">
            {personTypeLabels[row.original.type]}
          </Badge>
        ),
      },
      {
        accessorKey: "homeWardId",
        meta: { label: "Ala" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Ala {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        sortingFn: (rowA, rowB) => {
          const wardA = wardsById.get(rowA.original.homeWardId)?.name ?? "";
          const wardB = wardsById.get(rowB.original.homeWardId)?.name ?? "";

          return wardA.localeCompare(wardB, "pt-BR");
        },
        cell: ({ row }) => wardsById.get(row.original.homeWardId)?.name ?? "Ala não encontrada",
      },
      {
        accessorKey: "documentValue",
        meta: { label: "Documento" },
        header: "Documento",
        cell: ({ row }) => {
          const person = row.original;
          const documentTypeName = documentTypesById.get(person.documentTypeId)?.name ?? "Documento arquivado";

          return (
            <div className="space-y-1">
              <p>{documentTypeName}</p>
              <p className="text-xs text-muted-foreground">{person.documentValue || "Não informado"}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "phone",
        meta: { label: "Telefone" },
        header: "Telefone",
        cell: ({ row }) => row.original.phone || "Não informado",
      },
      {
        accessorKey: "birthDate",
        meta: { label: "Nascimento" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nascimento {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => {
          const birthDate = row.original.birthDate;
          const age = birthDate ? calculateAge(birthDate) : null;
          const ageLabel = age === null ? "Idade não informada" : age === 1 ? "1 ano" : `${age} anos`;

          return (
            <div className="space-y-1">
              <p className="text-sm font-medium">{ageLabel}</p>
              <p className="text-xs text-muted-foreground">{birthDate ? formatDate(birthDate) : "Data não informada"}</p>
            </div>
          );
        },
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <div className="text-right">Ações</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <TableActionButton label="Visualizar" onClick={() => openViewDrawer(row.original)}>
              <Eye />
            </TableActionButton>
          </div>
        ),
      },
    ],
    [documentTypesById, formatDate, wardsById],
  );

  return (
    <div>
        <PageHeader
          eyebrow="Caravana"
          title="Pessoas"
          description="Cadastro de familiares e amigos usados na organização de caravanas."
          actions={
            <Button onClick={openCreateDrawer} size="lg">
              Nova pessoa
            </Button>
          }
        />

        <DataTable
          columns={columns}
          data={filteredPeople}
          emptyMessage="Nenhuma pessoa encontrada com os filtros atuais."
          enableColumnVisibility
          getRowId={(person) => person.id}
          toolbar={
            <div className="flex flex-col gap-3 md:flex-row">
              <Input
                className="md:max-w-lg"
                placeholder="Buscar por nome, documento, telefone ou ala"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter((value as PersonStatusFilter) ?? "active")}>
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue placeholder="Filtrar pessoas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Normais ({activePeopleCount})</SelectItem>
                  <SelectItem value="archived">Arquivadas ({archivedPeopleCount})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Drawer direction="right" open={drawerOpen} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="sm:max-w-3xl" direction="right">
            <DrawerHeader className="border-b">
              <DrawerTitle>{drawerTitle}</DrawerTitle>
              <DrawerDescription>{drawerDescription}</DrawerDescription>
            </DrawerHeader>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-4">
                <div className="section-grid">
                  <div>
                    <Label>Nome</Label>
                    <Input disabled={isReadOnly} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                  </div>
                  <div>
                    <Label>Data de nascimento</Label>
                    <DatePicker
                      disabled={isReadOnly}
                      value={form.birthDate}
                      onChange={(value) => setForm((current) => ({ ...current, birthDate: value }))}
                    />
                  </div>
                  <div>
                    <Label>Gênero</Label>
                    <Select disabled={isReadOnly} value={form.sex} onValueChange={(value) => value && setForm((current) => ({ ...current, sex: value as CaravanPerson["sex"] }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o gênero" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculino</SelectItem>
                        <SelectItem value="F">Feminino</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select disabled={isReadOnly} value={form.type} onValueChange={(value) => value && setForm((current) => ({ ...current, type: value as CaravanPersonType }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="family">Família</SelectItem>
                        <SelectItem value="friends">Amigos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ala a qual pertence</Label>
                    <Select disabled={isReadOnly} value={form.homeWardId} onValueChange={(value) => value && setForm((current) => ({ ...current, homeWardId: value }))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a ala" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWards.map((ward) => (
                          <SelectItem key={ward.id} value={ward.id}>
                            {ward.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tipo de documento</Label>
                    <Select
                      disabled={isReadOnly || !documentTypeOptions.length}
                      value={form.documentTypeId}
                      onValueChange={(value) => value && setForm((current) => ({ ...current, documentTypeId: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTypeOptions.map((documentType) => (
                          <SelectItem key={documentType.id} value={documentType.id}>
                            {documentType.name}
                            {documentType.active ? "" : " (arquivado)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Documento</Label>
                    <Input
                      disabled={isReadOnly}
                      value={form.documentValue}
                      onChange={(event) => setForm((current) => ({ ...current, documentValue: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Telefone</Label>
                    <Input
                      disabled={isReadOnly}
                      value={form.phone}
                      onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <Label>Observação</Label>
                  <Textarea disabled={isReadOnly} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
              </div>
            </div>

            <DrawerFooter className="border-t bg-background">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button onClick={closeDrawer} variant="ghost">
                  {isReadOnly ? "Fechar" : "Cancelar"}
                </Button>
                {isReadOnly && canManagePeople && selectedPerson ? (
                  selectedPersonIsArchived ? (
                    <Button onClick={unarchiveSelectedPerson} variant="secondary">
                      Desarquivar
                    </Button>
                  ) : (
                    <Button disabled={Boolean(blockingArchiveCaravan)} onClick={archiveSelectedPerson} variant="destructive">
                      <Archive />
                      Arquivar
                    </Button>
                  )
                ) : null}
                {isReadOnly && canManagePeople && selectedPerson ? <Button onClick={() => openEditDrawer(selectedPerson)}>Editar pessoa</Button> : null}
                {!isReadOnly ? (
                  <Button disabled={!canSave} onClick={saveCurrentPerson}>
                    {drawerMode === "edit" ? "Salvar alterações" : "Cadastrar pessoa"}
                  </Button>
                ) : null}
              </div>
              {isReadOnly && canManagePeople && selectedPerson && !selectedPersonIsArchived && blockingArchiveCaravan ? (
                <p className="text-sm text-destructive">
                  Não é possível arquivar enquanto a pessoa estiver inscrita na caravana ativa {blockingArchiveCaravan.destination}.
                </p>
              ) : null}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
    </div>
  );
}

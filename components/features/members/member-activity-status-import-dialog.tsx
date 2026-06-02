"use client";

import { AlertTriangle, FileUp, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { cellValue, columnValue, formatImportedName, ignoredColumn, memberNameKey, parseCsv, type CsvData, type NameFormatMode } from "@/lib/member-csv";
import { normalizeDateInput } from "@/lib/utils";
import type { Member } from "@/types/domain";

type ParsedActivityName = {
  key: string;
  line: number;
  name: string;
  rawName: string;
};
type ActivityMatchGroup = {
  key: string;
  line: number;
  matches: Member[];
  name: string;
  rawName: string;
};
type DuplicateResolution = "ignore" | string;

const nameHeaderAliases = ["nome", "nome-completo", "membro", "member", "name", "full-name"];
const ignoreDuplicateValue = "__ignore__";
const exampleCsv = ["nome", '"Bruno da Silva Gonçalves"', '"Gonçalves, Bruno da Silva"', '"Nome Ainda Não Cadastrado"'].join("\n");

const churchActivityStatusLabels: Record<Member["churchActivityStatus"], string> = {
  attending: "Frequentando",
  not_attending: "Não frequentando",
};

function buildInitialNameColumn(headers: string[]) {
  const normalizedHeaders = headers.map((header) => memberNameKey(header));
  const matchIndex = normalizedHeaders.findIndex((header) => nameHeaderAliases.includes(header));

  return matchIndex >= 0 ? columnValue(matchIndex) : headers.length ? columnValue(0) : ignoredColumn;
}

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

function parseActivityNames(csv: CsvData, nameColumn: string, nameFormatMode: NameFormatMode) {
  const byKey = new Map<string, ParsedActivityName>();

  if (!nameColumn || nameColumn === ignoredColumn) return [];

  csv.rows.forEach((row, index) => {
    const rawName = cellValue(row, nameColumn);
    const name = formatImportedName(rawName, nameFormatMode);
    const key = memberNameKey(name);

    if (!key || byKey.has(key)) return;

    byKey.set(key, {
      key,
      line: index + 2,
      name,
      rawName,
    });
  });

  return Array.from(byKey.values());
}

function analyzeActivityMatches(parsedNames: ParsedActivityName[], members: Member[]) {
  const membersByName = new Map<string, Member[]>();

  members.forEach((member) => {
    const key = memberNameKey(member.name);
    membersByName.set(key, [...(membersByName.get(key) ?? []), member]);
  });

  return parsedNames.reduce(
    (analysis, parsedName) => {
      const matches = membersByName.get(parsedName.key) ?? [];
      const group: ActivityMatchGroup = { ...parsedName, matches };

      if (matches.length === 1) analysis.uniqueMatches.push(group);
      else if (matches.length > 1) analysis.duplicates.push(group);
      else analysis.notFound.push(group);

      return analysis;
    },
    {
      duplicates: [] as ActivityMatchGroup[],
      notFound: [] as ActivityMatchGroup[],
      uniqueMatches: [] as ActivityMatchGroup[],
    },
  );
}

export function MemberActivityStatusImportDialog() {
  const { currentWard, membersByWard, saveMember } = useAppContext();
  const { formatDate } = useDateFormatter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<CsvData>({ headers: [], rows: [] });
  const [fileName, setFileName] = useState("");
  const [nameColumn, setNameColumn] = useState(ignoredColumn);
  const [nameFormatMode, setNameFormatMode] = useState<NameFormatMode>("preserve");
  const [markMissingAsNotAttending, setMarkMissingAsNotAttending] = useState(false);
  const [duplicateResolutions, setDuplicateResolutions] = useState<Record<string, DuplicateResolution>>({});

  const parsedNames = useMemo(() => parseActivityNames(csv, nameColumn, nameFormatMode), [csv, nameColumn, nameFormatMode]);
  const matchAnalysis = useMemo(() => analyzeActivityMatches(parsedNames, membersByWard), [membersByWard, parsedNames]);
  const duplicatesResolved = matchAnalysis.duplicates.every((group) => Boolean(duplicateResolutions[group.key]));
  const resolvedDuplicateMemberIds = useMemo(
    () =>
      matchAnalysis.duplicates.flatMap((group) => {
        const resolution = duplicateResolutions[group.key];

        return resolution && resolution !== ignoreDuplicateValue ? [resolution] : [];
      }),
    [duplicateResolutions, matchAnalysis.duplicates],
  );
  const ignoredDuplicateMemberIds = useMemo(
    () =>
      matchAnalysis.duplicates.flatMap((group) => {
        const resolution = duplicateResolutions[group.key];

        return resolution === ignoreDuplicateValue ? group.matches.map((member) => member.id) : [];
      }),
    [duplicateResolutions, matchAnalysis.duplicates],
  );
  const attendingMemberIds = useMemo(
    () => new Set([...matchAnalysis.uniqueMatches.map((group) => group.matches[0]?.id).filter(Boolean), ...resolvedDuplicateMemberIds]),
    [matchAnalysis.uniqueMatches, resolvedDuplicateMemberIds],
  );
  const protectedMemberIds = useMemo(() => new Set([...attendingMemberIds, ...ignoredDuplicateMemberIds]), [attendingMemberIds, ignoredDuplicateMemberIds]);
  const notAttendingMemberIds = useMemo(
    () => (markMissingAsNotAttending ? membersByWard.filter((member) => !protectedMemberIds.has(member.id)).map((member) => member.id) : []),
    [markMissingAsNotAttending, membersByWard, protectedMemberIds],
  );
  const canApply = Boolean(currentWard && parsedNames.length && nameColumn !== ignoredColumn && duplicatesResolved);

  function resetImport() {
    setCsv({ headers: [], rows: [] });
    setFileName("");
    setNameColumn(ignoredColumn);
    setNameFormatMode("preserve");
    setMarkMissingAsNotAttending(false);
    setDuplicateResolutions({});
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetImport();
    }
  }

  async function handleFileChange(file?: File) {
    if (!file) return;

    const text = await file.text();
    const nextCsv = parseCsv(text);

    setCsv(nextCsv);
    setFileName(file.name);
    setNameColumn(buildInitialNameColumn(nextCsv.headers));
    setDuplicateResolutions({});
  }

  function applyActivityStatusImport() {
    if (!canApply) return;

    let attendingUpdatedCount = 0;
    let notAttendingUpdatedCount = 0;
    const notAttendingSet = new Set(notAttendingMemberIds);

    membersByWard.forEach((member) => {
      const nextStatus = attendingMemberIds.has(member.id) ? "attending" : notAttendingSet.has(member.id) ? "not_attending" : undefined;
      if (!nextStatus || member.churchActivityStatus === nextStatus) return;

      saveMember(
        {
          ...member,
          churchActivityStatus: nextStatus,
        },
        { silent: true },
      );

      if (nextStatus === "attending") attendingUpdatedCount += 1;
      else notAttendingUpdatedCount += 1;
    });

    const ignoredCount = matchAnalysis.duplicates.filter((group) => duplicateResolutions[group.key] === ignoreDuplicateValue).length;
    toast.success(
      `Frequência atualizada: ${attendingUpdatedCount} frequentando, ${notAttendingUpdatedCount} não frequentando, ${ignoredCount} duplicado(s) ignorado(s), ${matchAnalysis.notFound.length} não encontrado(s).`,
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          <UserCheck />
          Atualizar frequência
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Atualizar frequência por CSV</DialogTitle>
          <DialogDescription>Envie uma lista de nomes para marcar membros encontrados como frequentando.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Modelo do CSV</p>
              <p className="text-muted-foreground">Use uma coluna de nome. O sistema compara o nome normalizado com os membros da ala atual.</p>
              <p className="text-muted-foreground">Quando houver mais de um membro com o mesmo nome, escolha manualmente qual cadastro atualizar.</p>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs leading-5 text-foreground">{exampleCsv}</pre>
          </div>

          <div>
            <Label htmlFor="members-activity-csv">Arquivo CSV</Label>
            <Input accept=".csv,text/csv" id="members-activity-csv" type="file" onChange={(event) => void handleFileChange(event.target.files?.[0])} />
            {fileName ? <p className="mt-2 text-sm text-muted-foreground">{fileName}</p> : null}
          </div>

          {csv.headers.length ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Coluna de nome</Label>
                  <Select
                    value={nameColumn}
                    onValueChange={(value) => {
                      setNameColumn(value);
                      setDuplicateResolutions({});
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Escolha uma coluna" />
                    </SelectTrigger>
                    <SelectContent>
                      {csv.headers.map((header, index) => (
                        <SelectItem key={`${header}-${index}`} value={columnValue(index)}>
                          {header || `Coluna ${index + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="member-activity-name-format">Formato do nome</Label>
                  <Select
                    value={nameFormatMode}
                    onValueChange={(value) => {
                      setNameFormatMode(value as NameFormatMode);
                      setDuplicateResolutions({});
                    }}
                  >
                    <SelectTrigger className="w-full" id="member-activity-name-format">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preserve">Manter como está</SelectItem>
                      <SelectItem value="surname_last">Converter &quot;Sobrenome, Nomes&quot; para &quot;Nomes Sobrenome&quot;</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-sm text-muted-foreground">Exemplo: Gonçalves, Bruno da Silva -&gt; Bruno da Silva Gonçalves.</p>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <label className="flex items-start gap-2">
                  <Checkbox checked={markMissingAsNotAttending} onCheckedChange={(checked) => setMarkMissingAsNotAttending(checked === true)} />
                  <span>CSV como fonte principal: membros que não estiverem no CSV serão marcados como Não frequentando.</span>
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{csv.rows.length} linhas lidas</span>
                  <span>{parsedNames.length} nomes válidos</span>
                  <span>{matchAnalysis.uniqueMatches.length} match(es) único(s)</span>
                  <span>{matchAnalysis.duplicates.length} duplicado(s)</span>
                  <span>{matchAnalysis.notFound.length} não encontrado(s)</span>
                  <span>{attendingMemberIds.size} serão marcados como frequentando</span>
                  {markMissingAsNotAttending ? <span>{notAttendingMemberIds.length} serão marcados como não frequentando</span> : null}
                </div>
              </div>

              {matchAnalysis.duplicates.length ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  <div className="flex items-start gap-2 font-medium">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>Resolva os nomes duplicados antes de aplicar.</span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {matchAnalysis.duplicates.map((group) => (
                      <div className="rounded-md border bg-background p-3 text-foreground" key={group.key}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{group.name}</p>
                            <p className="text-xs text-muted-foreground">Linha {group.line}</p>
                          </div>
                          <Select
                            value={duplicateResolutions[group.key] ?? ""}
                            onValueChange={(value) => setDuplicateResolutions((current) => ({ ...current, [group.key]: value }))}
                          >
                            <SelectTrigger className="w-full sm:w-72">
                              <SelectValue placeholder="Escolha o membro" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={ignoreDuplicateValue}>Ignorar</SelectItem>
                              {group.matches.map((member) => (
                                <SelectItem key={member.id} value={member.id}>
                                  {member.name} - {member.phone || "sem telefone"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {group.matches.map((member) => {
                            const age = calculateAge(member.birthDate);

                            return (
                              <div className="rounded-md border bg-muted/30 p-2" key={member.id}>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="truncate font-medium">{member.name}</p>
                                  <Badge variant="outline">{churchActivityStatusLabels[member.churchActivityStatus]}</Badge>
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{member.phone || "Telefone não informado"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {member.birthDate ? formatDate(member.birthDate) : "Nascimento não informado"}
                                  {age !== null ? `, ${age} anos` : ""}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">{member.address || "Endereço não informado"}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                <PreviewList
                  emptyMessage="Nenhum match único."
                  items={matchAnalysis.uniqueMatches.map((group) => `${group.name} -> ${group.matches[0]?.name}`)}
                  title="Matches únicos"
                />
                <PreviewList
                  emptyMessage="Todos os nomes foram encontrados."
                  items={matchAnalysis.notFound.map((group) => `Linha ${group.line}: ${group.name}`)}
                  title="Não encontrados"
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="ghost">
            Cancelar
          </Button>
          <Button disabled={!canApply} onClick={applyActivityStatusImport}>
            <FileUp />
            Aplicar atualização
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewList({ emptyMessage, items, title }: { emptyMessage: string; items: string[]; title: string }) {
  return (
    <div className="rounded-lg border">
      <div className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{title}</div>
      <div className="max-h-44 overflow-y-auto">
        {items.length ? (
          items.slice(0, 24).map((item) => (
            <p className="border-b px-3 py-2 text-sm last:border-b-0" key={item}>
              {item}
            </p>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
        )}
        {items.length > 24 ? <p className="px-3 py-2 text-xs text-muted-foreground">Mais {items.length - 24} item(ns).</p> : null}
      </div>
    </div>
  );
}

"use client";

import { AlertTriangle, CalendarDays, FileUp, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { memberAttendanceKey } from "@/lib/member-attendance";
import { cellValue, columnValue, formatImportedName, ignoredColumn, parseCsv, type CsvData, type NameFormatMode } from "@/lib/member-csv";
import { memberNameIdentityKey } from "@/lib/member-identity";
import { normalizeDateInput } from "@/lib/utils";
import type { Member, MemberAttendanceRecord } from "@/types/domain";

type AttendanceDateColumn = {
  column: string;
  date: string;
  header: string;
};
type ParsedAttendanceRow = {
  key: string;
  line: number;
  name: string;
  rawName: string;
  row: string[];
};
type AttendanceMatchGroup = ParsedAttendanceRow & {
  matches: Member[];
};
type DuplicateResolution = "ignore" | string;
type MemberActivityStatusImportDialogProps = {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  trigger?: ReactNode;
};

const nameHeaderAliases = ["nome", "nome-completo", "membro", "member", "name", "full-name"];
const ignoreDuplicateValue = "__ignore__";
const exampleCsv = [
  "nome,sexo,03/05/2026,10/05/2026,17/05/2026",
  '"Abreu, Edjane Alves da Silva",F,0,0,1',
  '"Gonçalves, Bruno da Silva",M,1,0,0',
].join("\n");

function buildInitialNameColumn(headers: string[]) {
  const normalizedHeaders = headers.map((header) => memberNameIdentityKey(header));
  const matchIndex = normalizedHeaders.findIndex((header) => nameHeaderAliases.includes(header));

  return matchIndex >= 0 ? columnValue(matchIndex) : headers.length ? columnValue(0) : ignoredColumn;
}

function parseAttendanceDateColumns(headers: string[]) {
  return headers.flatMap((header, index) => {
    const date = normalizeDateInput(header);

    return date ? [{ column: columnValue(index), date, header }] : [];
  });
}

function parsePresenceValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("pt-BR");

  if (!normalized) return null;
  if (normalized === "1" || normalized === "sim" || normalized === "s" || normalized === "presente") return true;
  if (normalized === "0" || normalized === "nao" || normalized === "não" || normalized === "n" || normalized === "ausente") return false;

  return null;
}

function parseAttendanceRows(csv: CsvData, nameColumn: string, nameFormatMode: NameFormatMode) {
  const byKey = new Map<string, ParsedAttendanceRow>();

  if (!nameColumn || nameColumn === ignoredColumn) return [];

  csv.rows.forEach((row, index) => {
    const rawName = cellValue(row, nameColumn);
    const name = formatImportedName(rawName, nameFormatMode);
    const key = memberNameIdentityKey(name);

    if (!key || byKey.has(key)) return;

    byKey.set(key, {
      key,
      line: index + 2,
      name,
      rawName,
      row,
    });
  });

  return Array.from(byKey.values());
}

function analyzeAttendanceMatches(parsedRows: ParsedAttendanceRow[], members: Member[]) {
  const membersByName = new Map<string, Member[]>();

  members.forEach((member) => {
    const key = memberNameIdentityKey(member.name);
    membersByName.set(key, [...(membersByName.get(key) ?? []), member]);
  });

  return parsedRows.reduce(
    (analysis, parsedRow) => {
      const matches = membersByName.get(parsedRow.key) ?? [];
      const group: AttendanceMatchGroup = { ...parsedRow, matches };

      if (matches.length === 1) analysis.uniqueMatches.push(group);
      else if (matches.length > 1) analysis.duplicates.push(group);
      else analysis.notFound.push(group);

      return analysis;
    },
    {
      duplicates: [] as AttendanceMatchGroup[],
      notFound: [] as AttendanceMatchGroup[],
      uniqueMatches: [] as AttendanceMatchGroup[],
    },
  );
}

function buildAttendanceRecords(
  groups: AttendanceMatchGroup[],
  dateColumns: AttendanceDateColumn[],
  existingRecordsByKey: Map<string, MemberAttendanceRecord>,
) {
  return groups.flatMap((group) => {
    const member = group.matches[0];
    if (!member) return [];

    return dateColumns.flatMap((dateColumn) => {
      const present = parsePresenceValue(cellValue(group.row, dateColumn.column));
      if (present === null) return [];

      const record = {
        date: dateColumn.date,
        importedName: group.rawName || group.name,
        memberId: member.id,
        present,
        wardId: member.wardId,
      };
      const existing = existingRecordsByKey.get(memberAttendanceKey(record));

      return [
        {
          ...record,
          id: existing?.id,
        },
      ];
    });
  });
}

export function MemberActivityStatusImportDialog({ onOpenChange, open: controlledOpen, trigger }: MemberActivityStatusImportDialogProps) {
  const { currentWard, importMemberAttendanceRecords, memberAttendanceRecordsByWard, membersByWard } = useAppContext();
  const { formatDate } = useDateFormatter();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [csv, setCsv] = useState<CsvData>({ headers: [], rows: [] });
  const [fileName, setFileName] = useState("");
  const [nameColumn, setNameColumn] = useState(ignoredColumn);
  const [nameFormatMode, setNameFormatMode] = useState<NameFormatMode>("surname_last");
  const [duplicateResolutions, setDuplicateResolutions] = useState<Record<string, DuplicateResolution>>({});
  const open = controlledOpen ?? uncontrolledOpen;

  function setDialogOpen(nextOpen: boolean) {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }

  const dateColumns = useMemo(() => parseAttendanceDateColumns(csv.headers), [csv.headers]);
  const existingRecordsByKey = useMemo(() => {
    const recordsByKey = new Map<string, MemberAttendanceRecord>();
    memberAttendanceRecordsByWard.forEach((record) => recordsByKey.set(memberAttendanceKey(record), record));

    return recordsByKey;
  }, [memberAttendanceRecordsByWard]);
  const parsedRows = useMemo(() => parseAttendanceRows(csv, nameColumn, nameFormatMode), [csv, nameColumn, nameFormatMode]);
  const matchAnalysis = useMemo(() => analyzeAttendanceMatches(parsedRows, membersByWard), [membersByWard, parsedRows]);
  const duplicatesResolved = matchAnalysis.duplicates.every((group) => Boolean(duplicateResolutions[group.key]));
  const resolvedDuplicateGroups = useMemo(
    () =>
      matchAnalysis.duplicates.flatMap((group) => {
        const resolution = duplicateResolutions[group.key];
        const member = group.matches.find((match) => match.id === resolution);

        return member ? [{ ...group, matches: [member] }] : [];
      }),
    [duplicateResolutions, matchAnalysis.duplicates],
  );
  const recordsToImport = useMemo(
    () => buildAttendanceRecords([...matchAnalysis.uniqueMatches, ...resolvedDuplicateGroups], dateColumns, existingRecordsByKey),
    [dateColumns, existingRecordsByKey, matchAnalysis.uniqueMatches, resolvedDuplicateGroups],
  );
  const overwriteCount = useMemo(
    () => recordsToImport.filter((record) => existingRecordsByKey.has(memberAttendanceKey(record))).length,
    [existingRecordsByKey, recordsToImport],
  );
  const presentCount = recordsToImport.filter((record) => record.present).length;
  const absentCount = recordsToImport.length - presentCount;
  const ignoredDuplicateCount = matchAnalysis.duplicates.filter((group) => duplicateResolutions[group.key] === ignoreDuplicateValue).length;
  const canApply = Boolean(currentWard && parsedRows.length && nameColumn !== ignoredColumn && dateColumns.length && recordsToImport.length && duplicatesResolved);

  function resetImport() {
    setCsv({ headers: [], rows: [] });
    setFileName("");
    setNameColumn(ignoredColumn);
    setNameFormatMode("surname_last");
    setDuplicateResolutions({});
  }

  function handleOpenChange(nextOpen: boolean) {
    setDialogOpen(nextOpen);

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

  function applyAttendanceImport() {
    if (!canApply) return;

    importMemberAttendanceRecords({ records: recordsToImport });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== null ? (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="lg" variant="outline">
              <UserCheck />
              Atualizar frequência
            </Button>
          )}
        </DialogTrigger>
      ) : null}
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Atualizar frequência por CSV</DialogTitle>
          <DialogDescription>Envie o CSV com nomes e colunas de datas para gravar o histórico de presença por domingo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Modelo do CSV</p>
              <p className="text-muted-foreground">Use uma coluna de nome e colunas de data. Valor 1 registra presença; valor 0 registra ausência.</p>
              <p className="text-muted-foreground">O importador grava o histórico e atualiza o status de frequência no cadastro do membro neste momento.</p>
              <p className="text-muted-foreground">Datas futuras são gravadas no histórico, mas não participam do cálculo de status deste upload.</p>
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
                      <SelectItem value="surname_last">Converter &quot;Sobrenome, Nomes&quot; para &quot;Nomes Sobrenome&quot;</SelectItem>
                      <SelectItem value="preserve">Manter como está</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="space-y-2">
                    <p className="font-medium">Datas detectadas</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dateColumns.length ? (
                        dateColumns.map((dateColumn) => (
                          <Badge key={dateColumn.column} variant="outline">
                            {formatDate(dateColumn.date)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">Nenhuma coluna de data detectada.</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{csv.rows.length} linhas lidas</span>
                  <span>{parsedRows.length} nomes válidos</span>
                  <span>{matchAnalysis.uniqueMatches.length} match(es) único(s)</span>
                  <span>{matchAnalysis.duplicates.length} duplicado(s)</span>
                  <span>{matchAnalysis.notFound.length} não encontrado(s)</span>
                  <span>{recordsToImport.length} registros para importar</span>
                  <span>{presentCount} presença(s)</span>
                  <span>{absentCount} ausência(s)</span>
                  {overwriteCount ? <span>{overwriteCount} registro(s) serão sobrescritos</span> : null}
                  {ignoredDuplicateCount ? <span>{ignoredDuplicateCount} duplicado(s) ignorado(s)</span> : null}
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
                                  {member.name} - {member.birthDate ? formatDate(member.birthDate) : "sem nascimento"}
                                  {member.archivedAt ? " - arquivado" : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
          <Button disabled={!canApply} onClick={applyAttendanceImport}>
            <FileUp />
            Importar histórico
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

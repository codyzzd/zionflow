"use client";

import { AlertTriangle, FileUp } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { normalizeDateInput, slugify } from "@/lib/utils";
import type { Member, RecordMetadataKey } from "@/types/domain";

type ImportFieldKey = keyof Omit<
  Member,
  "id" | "wardId" | "geocodingAttemptedAt" | "geocodingError" | "geocodingQuery" | "geocodingStatus" | RecordMetadataKey
>;
type ImportMember = Omit<Member, "id" | "wardId" | "geocodingAttemptedAt" | "geocodingError" | "geocodingQuery" | "geocodingStatus" | RecordMetadataKey>;
type ImportConflict = {
  index: number;
  member: ImportMember;
  reason: string;
};
type CsvData = {
  headers: string[];
  rows: string[][];
};

const ignoredColumn = "__ignore__";
const columnPrefix = "__column__";

const fieldLabels: Array<{ key: ImportFieldKey; label: string; required?: boolean }> = [
  { key: "name", label: "Nome", required: true },
  { key: "phone", label: "Telefone" },
  { key: "birthDate", label: "Data de nascimento" },
  { key: "address", label: "Endereço" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
  { key: "sex", label: "Sexo" },
  { key: "sacramentTalkDuration", label: "Nível de discurso" },
];

const headerAliases: Record<ImportFieldKey, string[]> = {
  name: ["nome", "nome-completo", "membro", "member", "name", "full-name"],
  phone: ["telefone", "celular", "phone", "mobile", "whatsapp", "whats-app"],
  birthDate: ["data-de-nascimento", "nascimento", "birthdate", "birth-date", "birthday", "data-nascimento"],
  address: ["endereco", "endereço", "address", "logradouro", "moradia"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "long"],
  churchActivityStatus: ["condicao-na-igreja", "condição-na-igreja", "frequencia", "frequência", "atividade", "activity-status"],
  organization: ["organizacao", "organization", "org"],
  sex: ["sexo", "sex", "genero", "gender"],
  sacramentTalkDuration: ["nivel-de-discurso", "tempo-de-discurso", "discurso", "talk-duration", "speech-duration"],
  canSpeak: [],
  canPreside: [],
  canConduct: [],
};

const emptyImportMember: ImportMember = {
  name: "",
  phone: "",
  address: "",
  latitude: undefined,
  longitude: undefined,
  churchActivityStatus: "not_attending",
  birthDate: "",
  organization: "",
  sex: "M",
  sacramentTalkDuration: "5",
  canSpeak: true,
  canPreside: false,
  canConduct: false,
};

const exampleCsv = [
  "nome,telefone,data-de-nascimento,endereco,sexo,nivel-de-discurso",
  '"Ana Souza","(85) 99999-0001",1990-05-12,"Rua das Flores, 100",F,10',
  '"Carlos Lima","(85) 99999-0002",15/08/1984,"Av. Central, 250",M,15',
  '"Marina Alves","(85) 99999-0003",,,"F",5',
].join("\n");

function splitCsvLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && quoted && nextChar === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function detectDelimiter(headerLine: string) {
  const candidates = [",", ";", "\t"];

  return candidates.reduce((selected, delimiter) => {
    const selectedCount = splitCsvLine(headerLine, selected).length;
    const delimiterCount = splitCsvLine(headerLine, delimiter).length;

    return delimiterCount > selectedCount ? delimiter : selected;
  }, ",");
}

function parseCsv(text: string): CsvData {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length);

  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));

  return { headers, rows };
}

function buildInitialMapping(headers: string[]) {
  const normalizedHeaders = headers.map((header) => slugify(header));

  return fieldLabels.reduce(
    (mapping, field) => {
      const aliases = headerAliases[field.key];
      const matchIndex = normalizedHeaders.findIndex((header) => aliases.includes(header));

      return {
        ...mapping,
        [field.key]: matchIndex >= 0 ? columnValue(matchIndex) : ignoredColumn,
      };
    },
    {} as Record<ImportFieldKey, string>,
  );
}

function columnValue(index: number) {
  return `${columnPrefix}${index}`;
}

function columnIndex(value: string) {
  if (!value.startsWith(columnPrefix)) return -1;

  return Number(value.replace(columnPrefix, ""));
}

function cellValue(row: string[], column: string) {
  const index = columnIndex(column);

  return index >= 0 ? (row[index] ?? "").trim() : "";
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = slugify(value);
  if (!normalized) return fallback;

  if (["1", "sim", "s", "true", "yes", "y", "x"].includes(normalized)) return true;
  if (["0", "nao", "n", "false", "no"].includes(normalized)) return false;

  return fallback;
}

function parseSex(value: string): Member["sex"] {
  const normalized = slugify(value);
  if (["f", "feminino", "female", "mulher"].includes(normalized)) return "F";

  return "M";
}

function parseTalkDuration(value: string): Member["sacramentTalkDuration"] {
  const normalized = slugify(value);

  if (["10", "10-min", "10-minutos"].includes(normalized)) return "10";
  if (["15", "15-min", "15-minutos"].includes(normalized)) return "15";

  return "5";
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? parsed : undefined;
}

function countInvalidDates(csv: CsvData, mapping: Record<ImportFieldKey, string>) {
  const dateColumn = mapping.birthDate;
  if (!dateColumn || dateColumn === ignoredColumn) return 0;

  return csv.rows.reduce((count, row) => {
    const rawName = cellValue(row, mapping.name);
    const rawDate = cellValue(row, dateColumn);

    return rawName.trim() && rawDate && !normalizeDateInput(rawDate) ? count + 1 : count;
  }, 0);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

function memberNameKey(member: Pick<Member, "name"> | Pick<ImportMember, "name">) {
  return slugify(member.name);
}

function memberIdentityKey(member: Pick<Member, "name" | "birthDate"> | Pick<ImportMember, "name" | "birthDate">) {
  const birthDate = normalizeDateInput(member.birthDate);

  return birthDate ? `${memberNameKey(member)}::${birthDate}` : "";
}

function analyzeMemberImport(importMembers: ImportMember[], currentMembers: Member[]) {
  const currentMembersByName = new Map<string, Member[]>();
  const currentMembersByIdentity = new Map<string, Member[]>();
  const importedNameCounts = countBy(importMembers, memberNameKey);
  const importedIdentityCounts = countBy(
    importMembers.filter((member) => member.birthDate),
    memberIdentityKey,
  );
  const conflicts: ImportConflict[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  currentMembers.forEach((member) => {
    const nameKey = memberNameKey(member);
    currentMembersByName.set(nameKey, [...(currentMembersByName.get(nameKey) ?? []), member]);

    const identityKey = memberIdentityKey(member);
    if (identityKey) {
      currentMembersByIdentity.set(identityKey, [...(currentMembersByIdentity.get(identityKey) ?? []), member]);
    }
  });

  importMembers.forEach((member, index) => {
    const nameKey = memberNameKey(member);
    const identityKey = memberIdentityKey(member);

    if (!identityKey) {
      if ((importedNameCounts.get(nameKey) ?? 0) > 1) {
        conflicts.push({ index, member, reason: "Nome repetido no CSV sem data de nascimento." });
        return;
      }

      if ((currentMembersByName.get(nameKey) ?? []).length > 0) {
        conflicts.push({ index, member, reason: "Ja existe membro com este nome. Informe a data de nascimento para atualizar com segurança." });
        return;
      }

      createdCount += 1;
      return;
    }

    if ((importedIdentityCounts.get(identityKey) ?? 0) > 1) {
      conflicts.push({ index, member, reason: "Nome e data de nascimento repetidos no CSV." });
      return;
    }

    const identityMatches = currentMembersByIdentity.get(identityKey) ?? [];
    if (identityMatches.length > 1) {
      conflicts.push({ index, member, reason: "Mais de um membro existente tem este mesmo nome e nascimento." });
      return;
    }

    if (identityMatches.length === 1) {
      updatedCount += 1;
      return;
    }

    createdCount += 1;
  });

  return { conflicts, createdCount, updatedCount };
}

function buildImportedFields(mapping: Record<ImportFieldKey, string>) {
  return fieldLabels
    .filter((field) => {
      const column = mapping[field.key];

      return Boolean(column && column !== ignoredColumn);
    })
    .map((field) => field.key);
}

function toImportMembers(csv: CsvData, mapping: Record<ImportFieldKey, string>) {
  const members: ImportMember[] = [];

  csv.rows.forEach((row) => {
    const read = (field: ImportFieldKey) => {
      const column = mapping[field];

      return column && column !== ignoredColumn ? cellValue(row, column) : "";
    };
    const name = read("name");

    if (!name.trim()) return;

    const member: ImportMember = {
      ...emptyImportMember,
      name: name.trim(),
      phone: read("phone").trim(),
      address: read("address").trim(),
      latitude: parseOptionalNumber(read("latitude")),
      longitude: parseOptionalNumber(read("longitude")),
      churchActivityStatus: "not_attending",
      birthDate: normalizeDateInput(read("birthDate")),
      organization: "",
      sex: parseSex(read("sex")),
      sacramentTalkDuration: parseTalkDuration(read("sacramentTalkDuration")),
      canSpeak: parseBoolean(read("canSpeak"), emptyImportMember.canSpeak),
      canPreside: parseBoolean(read("canPreside"), emptyImportMember.canPreside),
      canConduct: parseBoolean(read("canConduct"), emptyImportMember.canConduct),
    };

    members.push(member);
  });

  return members;
}

export function MemberImportDialog() {
  const { currentWard, db, importMembers } = useAppContext();
  const { formatDate } = useDateFormatter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState<CsvData>({ headers: [], rows: [] });
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<ImportFieldKey, string>>(buildInitialMapping([]));
  const [removeMissing, setRemoveMissing] = useState(false);

  const parsedMembers = useMemo(() => toImportMembers(csv, mapping), [csv, mapping]);
  const importedFields = useMemo(() => buildImportedFields(mapping), [mapping]);
  const invalidDateCount = useMemo(() => countInvalidDates(csv, mapping), [csv, mapping]);
  const currentWardMembers = useMemo(() => (currentWard ? db.members.filter((member) => member.wardId === currentWard.id) : []), [currentWard, db.members]);
  const importAnalysis = useMemo(() => analyzeMemberImport(parsedMembers, currentWardMembers), [currentWardMembers, parsedMembers]);
  const canImport = Boolean(currentWard && mapping.name !== ignoredColumn && parsedMembers.length && !importAnalysis.conflicts.length);

  function resetImport() {
    setCsv({ headers: [], rows: [] });
    setFileName("");
    setMapping(buildInitialMapping([]));
    setRemoveMissing(false);
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
    setMapping(buildInitialMapping(nextCsv.headers));
  }

  function applyImport() {
    if (!currentWard || !canImport) return;

    importMembers({
      wardId: currentWard.id,
      members: parsedMembers,
      importedFields,
      removeMissing,
    });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" variant="outline">
          <FileUp />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar membros</DialogTitle>
          <DialogDescription>Escolha um CSV, relacione as colunas e aplique a importação na ala atual.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Modelo do CSV</p>
              <p className="text-muted-foreground">
                Obrigatório: <span className="font-medium text-foreground">nome</span>. A importação cria ou atualiza membros da ala atual usando o nome como referência.
              </p>
              <p className="text-muted-foreground">
                Opcionais: telefone, data-de-nascimento, endereco, latitude, longitude, sexo e nivel-de-discurso.
              </p>
              <p className="text-muted-foreground">Datas podem vir como AAAA-MM-DD, DD/MM/AAAA ou DD mmm AAAA, como 5 abr 1975.</p>
              <p className="text-muted-foreground">
                Ao atualizar, somente colunas importadas alteram o cadastro; colunas ausentes ou marcadas como Ignorar ficam intactas.
              </p>
              <p className="text-muted-foreground">Novos membros importados entram como Não frequentando. Colunas opcionais marcadas como Ignorar entram com o padrão do cadastro.</p>
            </div>
            <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs leading-5 text-foreground">{exampleCsv}</pre>
          </div>

          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <div className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>Atualização usa nome e nascimento.</span>
            </div>
            <p className="mt-1 pl-6">
              O importador só atualiza um cadastro quando encontra exatamente um membro com o mesmo nome e a mesma data de nascimento.
            </p>
            {importAnalysis.conflicts.length ? (
              <div className="mt-2 space-y-1 pl-6">
                <p className="font-medium">Corrija os conflitos no CSV antes de importar.</p>
                {importAnalysis.conflicts.slice(0, 4).map((conflict) => (
                  <p className="text-xs" key={`${conflict.index}-${conflict.member.name}`}>
                    Linha {conflict.index + 2}: {conflict.member.name} - {conflict.reason}
                  </p>
                ))}
                {importAnalysis.conflicts.length > 4 ? <p className="text-xs">Mais {importAnalysis.conflicts.length - 4} conflito(s).</p> : null}
              </div>
            ) : null}
          </div>

          <div>
            <Label htmlFor="members-csv">Arquivo CSV</Label>
            <Input accept=".csv,text/csv" id="members-csv" type="file" onChange={(event) => void handleFileChange(event.target.files?.[0])} />
            {fileName ? <p className="mt-2 text-sm text-muted-foreground">{fileName}</p> : null}
          </div>

          {csv.headers.length ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {fieldLabels.map((field) => (
                  <div key={field.key}>
                    <Label>
                      {field.label}
                      {field.required ? <span className="text-destructive">*</span> : null}
                    </Label>
                    <Select
                      value={mapping[field.key] ?? ignoredColumn}
                      onValueChange={(value) => setMapping((current) => ({ ...current, [field.key]: value }))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha uma coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {!field.required ? <SelectItem value={ignoredColumn}>Ignorar</SelectItem> : null}
                        {csv.headers.map((header, index) => (
                          <SelectItem key={`${field.key}-${index}`} value={columnValue(index)}>
                            {header || `Coluna ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                <label className="flex items-start gap-2">
                  <Checkbox checked={removeMissing} onCheckedChange={(checked) => setRemoveMissing(checked === true)} />
                  <span>Apagar membros atuais que não estiverem no CSV</span>
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{csv.rows.length} linhas lidas</span>
                  <span>{parsedMembers.length} membros válidos</span>
                  <span>{importAnalysis.createdCount} serão criados</span>
                  <span>{importAnalysis.updatedCount} serão atualizados</span>
                  <span>{importAnalysis.conflicts.length} conflitos</span>
                  {invalidDateCount ? <span>{invalidDateCount} datas ignoradas</span> : null}
                  <span>{removeMissing ? "CSV como fonte principal" : "Atualização parcial"}</span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[560px]">
                  <div className="grid grid-cols-[minmax(0,1fr)_140px_130px_90px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Nome</span>
                    <span>Telefone</span>
                    <span>Nascimento</span>
                    <span>Discurso</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {parsedMembers.slice(0, 8).map((member, index) => (
                      <div className="grid grid-cols-[minmax(0,1fr)_140px_130px_90px] gap-2 border-b px-3 py-2 text-sm last:border-b-0" key={`${member.name}-${index}`}>
                        <span className="truncate font-medium">{member.name}</span>
                        <span className="truncate text-muted-foreground">{member.phone || "Não informado"}</span>
                        <span className="truncate text-muted-foreground">{member.birthDate ? formatDate(member.birthDate) : "Não informada"}</span>
                        <span className="truncate text-muted-foreground">{member.sacramentTalkDuration} min</span>
                      </div>
                    ))}
                    {!parsedMembers.length ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum membro válido para importar.</div> : null}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="ghost">
            Cancelar
          </Button>
          <Button disabled={!canImport} onClick={applyImport}>
            Incluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

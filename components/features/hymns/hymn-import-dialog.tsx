"use client";

import { FileUp } from "lucide-react";
import { useMemo, useState } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slugify } from "@/lib/utils";

type ImportFieldKey = "number" | "title";
type ImportHymn = {
  number: number;
  title: string;
  active: boolean;
};
type CsvData = {
  headers: string[];
  rows: string[][];
};

const ignoredColumn = "__ignore__";
const columnPrefix = "__column__";

const fieldLabels: Array<{ key: ImportFieldKey; label: string; required?: boolean }> = [
  { key: "number", label: "Número", required: true },
  { key: "title", label: "Título", required: true },
];

const headerAliases: Record<ImportFieldKey, string[]> = {
  number: ["numero", "number", "num", "n"],
  title: ["titulo", "title", "nome", "hino", "hymn"],
};

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

function parseHymnNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;

  return Number(digits);
}

function toImportHymns(csv: CsvData, mapping: Record<ImportFieldKey, string>) {
  const hymnsByNumber = new Map<number, ImportHymn>();

  csv.rows.forEach((row) => {
    const number = parseHymnNumber(cellValue(row, mapping.number));
    const title = cellValue(row, mapping.title);

    if (!number || !title.trim()) return;

    hymnsByNumber.set(number, {
      number,
      title: title.trim(),
      active: true,
    });
  });

  return Array.from(hymnsByNumber.values()).sort((a, b) => a.number - b.number || a.title.localeCompare(b.title, "pt-BR"));
}

function countInvalidRows(csv: CsvData, mapping: Record<ImportFieldKey, string>) {
  if (mapping.number === ignoredColumn || mapping.title === ignoredColumn) return csv.rows.length;

  return csv.rows.reduce((count, row) => {
    const number = parseHymnNumber(cellValue(row, mapping.number));
    const title = cellValue(row, mapping.title);

    return number && title.trim() ? count : count + 1;
  }, 0);
}

export function HymnImportDialog() {
  const { db, importHymns } = useAppContext();
  const hymnBookOptions = useMemo(() => db.hymnBooks.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [db.hymnBooks]);
  const [open, setOpen] = useState(false);
  const [hymnBookId, setHymnBookId] = useState("");
  const [csv, setCsv] = useState<CsvData>({ headers: [], rows: [] });
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<ImportFieldKey, string>>(buildInitialMapping([]));
  const [removeMissing, setRemoveMissing] = useState(false);

  const parsedHymns = useMemo(() => toImportHymns(csv, mapping), [csv, mapping]);
  const invalidRowCount = useMemo(() => countInvalidRows(csv, mapping), [csv, mapping]);
  const selectedHymnBook = hymnBookOptions.find((hymnBook) => hymnBook.id === hymnBookId);
  const canImport = Boolean(hymnBookId && mapping.number !== ignoredColumn && mapping.title !== ignoredColumn && parsedHymns.length);

  function resetImport() {
    setHymnBookId("");
    setCsv({ headers: [], rows: [] });
    setFileName("");
    setMapping(buildInitialMapping([]));
    setRemoveMissing(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (nextOpen) {
      setHymnBookId((current) => current || hymnBookOptions[0]?.id || "");
    } else {
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
    if (!canImport) return;

    importHymns({
      hymnBookId,
      hymns: parsedHymns,
      removeMissing,
    });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={!hymnBookOptions.length} size="lg" variant="outline">
          <FileUp />
          Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Importar hinos</DialogTitle>
          <DialogDescription>Escolha um hinário, relacione as colunas do CSV e aplique a importação nesse catálogo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>Hinário</Label>
            <Select value={hymnBookId} onValueChange={setHymnBookId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolha o hinário" />
              </SelectTrigger>
              <SelectContent>
                {hymnBookOptions.map((hymnBook) => (
                  <SelectItem key={hymnBook.id} value={hymnBook.id}>
                    {hymnBook.emoji} {hymnBook.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="hymns-csv">Arquivo CSV</Label>
            <Input accept=".csv,text/csv" id="hymns-csv" type="file" onChange={(event) => void handleFileChange(event.target.files?.[0])} />
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
                  <span>Apagar hinos atuais deste hinário que não estiverem no CSV</span>
                </label>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  <span>{csv.rows.length} linhas lidas</span>
                  <span>{parsedHymns.length} hinos válidos</span>
                  {invalidRowCount ? <span>{invalidRowCount} linhas ignoradas</span> : null}
                  <span>{removeMissing ? "CSV como fonte principal" : "Atualização parcial"}</span>
                  {selectedHymnBook ? <span>{selectedHymnBook.emoji} {selectedHymnBook.name}</span> : null}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[480px]">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Número</span>
                    <span>Título</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {parsedHymns.slice(0, 8).map((hymn) => (
                      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 border-b px-3 py-2 text-sm last:border-b-0" key={hymn.number}>
                        <span className="font-medium tabular-nums">{hymn.number}</span>
                        <span className="truncate text-muted-foreground">{hymn.title}</span>
                      </div>
                    ))}
                    {!parsedHymns.length ? <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum hino válido para importar.</div> : null}
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

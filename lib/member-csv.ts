import { slugify } from "@/lib/utils";

export type CsvData = {
  headers: string[];
  rows: string[][];
};

export type NameFormatMode = "preserve" | "surname_last";

export const ignoredColumn = "__ignore__";

const columnPrefix = "__column__";

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

export function parseCsv(text: string): CsvData {
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

export function columnValue(index: number) {
  return `${columnPrefix}${index}`;
}

function columnIndex(value: string) {
  if (!value.startsWith(columnPrefix)) return -1;

  return Number(value.replace(columnPrefix, ""));
}

export function cellValue(row: string[], column: string) {
  const index = columnIndex(column);

  return index >= 0 ? (row[index] ?? "").trim() : "";
}

export function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function formatImportedName(value: string, mode: NameFormatMode) {
  const trimmedName = compactWhitespace(value);
  if (mode === "preserve") return trimmedName;

  const commaIndex = trimmedName.indexOf(",");
  if (commaIndex < 0) return trimmedName;

  const surname = compactWhitespace(trimmedName.slice(0, commaIndex));
  const givenNames = compactWhitespace(trimmedName.slice(commaIndex + 1));

  if (!surname || !givenNames) return trimmedName;

  return compactWhitespace(`${givenNames} ${surname}`);
}

export function memberNameKey(name: string) {
  return slugify(name);
}

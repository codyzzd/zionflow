"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { useAppContext } from "@/components/providers/app-provider";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionGuard } from "@/components/shared/permission-guard";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDateFormatter } from "@/hooks/use-date-formatter";
import { normalizeDateInput, slugify } from "@/lib/utils";
import type { CaravanPerson, CaravanRegistration } from "@/types/domain";

type PassengerListRow = {
  position: number;
  registration: CaravanRegistration;
  person: CaravanPerson;
  age: string;
  wardName: string;
  documentTypeName: string;
};

type ExportMode = "complete" | "simple";
type ExportFormat = "xlsx" | "pdf";
type ExportColumn = {
  header: string;
  getValue: (row: PassengerListRow) => string;
  align?: "left" | "center" | "right";
  pdfWidth?: number;
};

type PdfDocumentOptions = {
  columns: ExportColumn[];
  generatedAt: string;
  modeLabel: string;
  rows: PassengerListRow[];
  subtitle: string;
  summary: string;
  title: string;
};

function calculateAge(birthDate: string) {
  const normalizedBirthDate = normalizeDateInput(birthDate);
  if (!normalizedBirthDate) return "";

  const [year, month, day] = normalizedBirthDate.split("-").map(Number);
  if (!year || !month || !day) return "";

  const today = new Date();
  let age = today.getFullYear() - year;
  const birthdayPassed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);

  if (!birthdayPassed) age -= 1;

  return age >= 0 ? String(age) : "";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function columnName(index: number) {
  let value = "";
  let current = index + 1;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - remainder) / 26);
  }

  return value;
}

function createXlsxCell(reference: string, value: string, styleId?: number) {
  const style = styleId ? ` s="${styleId}"` : "";
  return `<c r="${reference}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
}

function buildWorksheet(rows: PassengerListRow[], columns: ExportColumn[]) {
  const rowValues = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => column.getValue(row) || ""))];
  const columnWidths = columns
    .map((column, index) => {
      const maxLength = Math.max(column.header.length, ...rows.map((row) => (column.getValue(row) || "").length));
      const width = Math.min(42, Math.max(10, maxLength + 2));

      return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");
  const sheetRows = rowValues
    .map((values, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = rowIndex === 0 ? ` ht="22" customHeight="1"` : "";
      const cells = values
        .map((value, columnIndex) => createXlsxCell(`${columnName(columnIndex)}${rowNumber}`, value, rowIndex === 0 ? 1 : undefined))
        .join("");

      return `<row r="${rowNumber}"${height}>${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${columnName(columns.length - 1)}${rowValues.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnWidths}</cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

const crcTable = Array.from({ length: 256 }, (_, tableIndex) => {
  let crc = tableIndex;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function createZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0x0800);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, checksum);
    writeUint32(localHeader, 18, contentBytes.length);
    writeUint32(localHeader, 22, contentBytes.length);
    writeUint16(localHeader, 26, nameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0x0800);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, checksum);
    writeUint32(centralHeader, 20, contentBytes.length);
    writeUint32(centralHeader, 24, contentBytes.length);
    writeUint16(centralHeader, 28, nameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const endOfCentralDirectory = new Uint8Array(22);

  writeUint32(endOfCentralDirectory, 0, 0x06054b50);
  writeUint16(endOfCentralDirectory, 8, files.length);
  writeUint16(endOfCentralDirectory, 10, files.length);
  writeUint32(endOfCentralDirectory, 12, centralDirectory.length);
  writeUint32(endOfCentralDirectory, 16, offset);

  return concatBytes([...localParts, centralDirectory, endOfCentralDirectory]);
}

function buildXlsxContent(rows: PassengerListRow[], columns: ExportColumn[]) {
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Lista" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildWorksheet(rows, columns),
    },
  ]);
}

function toPdfText(value: string) {
  const winAnsiFallbacks: Record<string, number> = {
    "€": 0x80,
    "‚": 0x82,
    "ƒ": 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    "ˆ": 0x88,
    "‰": 0x89,
    "Š": 0x8a,
    "‹": 0x8b,
    "Œ": 0x8c,
    "Ž": 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "˜": 0x98,
    "™": 0x99,
    "š": 0x9a,
    "›": 0x9b,
    "œ": 0x9c,
    "ž": 0x9e,
    "Ÿ": 0x9f,
  };
  const hex = Array.from(value.normalize("NFC"))
    .map((char) => {
      const fallback = winAnsiFallbacks[char];
      if (fallback) return fallback.toString(16).padStart(2, "0");

      const code = char.charCodeAt(0);
      if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) return code.toString(16).padStart(2, "0");

      return "3f";
    })
    .join("");

  return `<${hex}>`;
}

function createPdfObject(id: number, body: string) {
  return `${id} 0 obj\n${body}\nendobj\n`;
}

function rgb(hex: string) {
  const normalized = hex.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  return `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)}`;
}

function drawRect(x: number, y: number, width: number, height: number, color: string) {
  return `q\n${rgb(color)} rg\n${x} ${y} ${width} ${height} re f\nQ`;
}

function drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width = 0.6) {
  return `q\n${width} w\n${rgb(color)} RG\n${x1} ${y1} m ${x2} ${y2} l S\nQ`;
}

function estimateTextWidth(value: string, fontSize: number) {
  return Array.from(value).reduce((total, char) => {
    if (char === " ") return total + fontSize * 0.28;
    if (/[ilI.,:;|]/.test(char)) return total + fontSize * 0.26;
    if (/[mwMW]/.test(char)) return total + fontSize * 0.82;
    return total + fontSize * 0.52;
  }, 0);
}

function fitText(value: string, maxWidth: number, fontSize: number) {
  const trimmed = value.trim();
  if (estimateTextWidth(trimmed, fontSize) <= maxWidth) return trimmed;

  let fitted = trimmed;
  while (fitted.length > 1 && estimateTextWidth(`${fitted}...`, fontSize) > maxWidth) {
    fitted = fitted.slice(0, -1);
  }

  return `${fitted.trim()}...`;
}

function drawText({
  align = "left",
  color,
  font = "F1",
  fontSize,
  maxWidth,
  text,
  x,
  y,
}: {
  align?: ExportColumn["align"];
  color: string;
  font?: "F1" | "F2";
  fontSize: number;
  maxWidth: number;
  text: string;
  x: number;
  y: number;
}) {
  const fittedText = fitText(text, maxWidth, fontSize);
  const textWidth = estimateTextWidth(fittedText, fontSize);
  const alignedX = align === "right" ? x + maxWidth - textWidth : align === "center" ? x + (maxWidth - textWidth) / 2 : x;

  return `BT\n${rgb(color)} rg\n/${font} ${fontSize} Tf\n${alignedX.toFixed(2)} ${y.toFixed(2)} Td\n${toPdfText(fittedText)} Tj\nET`;
}

function chunkRows(rows: PassengerListRow[], rowsPerPage: number) {
  const chunks: PassengerListRow[][] = [];

  for (let index = 0; index < rows.length; index += rowsPerPage) {
    chunks.push(rows.slice(index, index + rowsPerPage));
  }

  return chunks.length ? chunks : [[]];
}

function buildPdfContent({ columns, generatedAt, modeLabel, rows, subtitle, summary, title }: PdfDocumentOptions) {
  const pageWidth = 842;
  const pageHeight = 595;
  const marginX = 34;
  const marginY = 30;
  const tableTop = 468;
  const tableWidth = pageWidth - marginX * 2;
  const headerHeight = 30;
  const rowHeight = 23;
  const rowsPerPage = Math.floor((tableTop - marginY - 28 - headerHeight) / rowHeight);
  const columnWidthUnits = columns.reduce((total, column) => total + (column.pdfWidth ?? 1), 0);
  const columnWidths = columns.map((column) => ((column.pdfWidth ?? 1) / columnWidthUnits) * tableWidth);
  const objects = new Map<number, string>();
  const pages: number[] = [];
  const chunks = chunkRows(rows, rowsPerPage);
  const regularFontObjectId = 3;
  const boldFontObjectId = 4;
  let nextObjectId = 5;

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(regularFontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.set(boldFontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  chunks.forEach((chunk, pageIndex) => {
    const contentId = nextObjectId++;
    const pageId = nextObjectId++;
    const pageNumber = pageIndex + 1;
    const commands = [
      drawRect(0, 0, pageWidth, pageHeight, "#ffffff"),
      drawRect(0, pageHeight - 14, pageWidth, 14, "#0f766e"),
      drawText({ color: "#64748b", font: "F2", fontSize: 8, maxWidth: 180, text: "CARAVANA", x: marginX, y: 548 }),
      drawText({ color: "#0f172a", font: "F2", fontSize: 18, maxWidth: 430, text: title, x: marginX, y: 526 }),
      drawText({ color: "#475569", fontSize: 9, maxWidth: 440, text: subtitle, x: marginX, y: 510 }),
      drawRect(pageWidth - marginX - 210, 504, 210, 45, "#f8fafc"),
      drawLine(pageWidth - marginX - 210, 504, pageWidth - marginX, 504, "#dbe3ea"),
      drawText({ color: "#0f172a", font: "F2", fontSize: 10, maxWidth: 178, text: modeLabel, x: pageWidth - marginX - 194, y: 530 }),
      drawText({ color: "#64748b", fontSize: 8, maxWidth: 178, text: summary, x: pageWidth - marginX - 194, y: 516 }),
      drawText({ color: "#64748b", fontSize: 8, maxWidth: 178, text: `Gerado em ${generatedAt}`, x: pageWidth - marginX - 194, y: 507 }),
      drawRect(marginX, tableTop - headerHeight, tableWidth, headerHeight, "#0f766e"),
    ];

    let currentX = marginX;
    columns.forEach((column, columnIndex) => {
      const width = columnWidths[columnIndex];
      commands.push(
        drawText({
          align: column.align,
          color: "#ffffff",
          font: "F2",
          fontSize: 8.8,
          maxWidth: width - 16,
          text: column.header.toUpperCase(),
          x: currentX + 8,
          y: tableTop - 19,
        }),
      );

      if (columnIndex > 0) {
        commands.push(drawLine(currentX, tableTop - headerHeight, currentX, tableTop, "#2dd4bf", 0.35));
      }

      currentX += width;
    });

    chunk.forEach((row, rowIndex) => {
      const rowTop = tableTop - headerHeight - rowIndex * rowHeight;
      const rowBottom = rowTop - rowHeight;
      const rowBackground = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";

      commands.push(drawRect(marginX, rowBottom, tableWidth, rowHeight, rowBackground));
      commands.push(drawLine(marginX, rowBottom, marginX + tableWidth, rowBottom, "#dbe3ea", 0.45));

      let cellX = marginX;
      columns.forEach((column, columnIndex) => {
        const width = columnWidths[columnIndex];
        const value = column.getValue(row) || "-";

        if (columnIndex > 0) {
          commands.push(drawLine(cellX, rowBottom, cellX, rowTop, "#e5e7eb", 0.35));
        }

        commands.push(
          drawText({
            align: column.align,
            color: column.header === "Nome" ? "#111827" : "#475569",
            font: column.header === "Nome" ? "F2" : "F1",
            fontSize: 8.8,
            maxWidth: width - 16,
            text: value,
            x: cellX + 8,
            y: rowBottom + 8.2,
          }),
        );

        cellX += width;
      });
    });

    if (!chunk.length) {
      const emptyRowHeight = 48;
      const emptyRowBottom = tableTop - headerHeight - emptyRowHeight;
      commands.push(drawRect(marginX, emptyRowBottom, tableWidth, emptyRowHeight, "#f8fafc"));
      commands.push(drawLine(marginX, emptyRowBottom, marginX + tableWidth, emptyRowBottom, "#dbe3ea", 0.45));
      commands.push(
        drawText({
          align: "center",
          color: "#64748b",
          fontSize: 9,
          maxWidth: tableWidth - 24,
          text: "Nenhum passageiro inscrito nesta caravana.",
          x: marginX + 12,
          y: emptyRowBottom + 20,
        }),
      );
    }

    const tableBottom = tableTop - headerHeight - (chunk.length ? chunk.length * rowHeight : 48);
    commands.push(drawLine(marginX, tableTop, marginX + tableWidth, tableTop, "#0f766e", 0.8));
    commands.push(drawLine(marginX, tableBottom, marginX + tableWidth, tableBottom, "#cbd5e1", 0.8));
    commands.push(drawLine(marginX, tableBottom, marginX, tableTop, "#cbd5e1", 0.6));
    commands.push(drawLine(marginX + tableWidth, tableBottom, marginX + tableWidth, tableTop, "#cbd5e1", 0.6));
    commands.push(drawText({ color: "#94a3b8", fontSize: 7.5, maxWidth: 260, text: `${rows.length} passageiro(s)`, x: marginX, y: 20 }));
    commands.push(
      drawText({
        align: "right",
        color: "#94a3b8",
        fontSize: 7.5,
        maxWidth: 260,
        text: `Página ${pageNumber} de ${chunks.length}`,
        x: pageWidth - marginX - 260,
        y: 20,
      }),
    );

    const stream = commands.join("\n");
    objects.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    pages.push(pageId);
  });

  objects.set(2, `<< /Type /Pages /Kids [${pages.map((pageId) => `${pageId} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  const orderedObjects = Array.from({ length: Math.max(...objects.keys()) }, (_, index) => {
    const id = index + 1;
    const body = objects.get(id);
    if (!body) throw new Error(`PDF object ${id} was not created.`);

    return createPdfObject(id, body);
  });

  orderedObjects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${orderedObjects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${orderedObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

const completeExportColumns: ExportColumn[] = [
  { header: "#", getValue: (row) => String(row.position), align: "right", pdfWidth: 0.45 },
  { header: "Nome", getValue: (row) => row.person.name, pdfWidth: 2.15 },
  { header: "Idade", getValue: (row) => row.age, align: "right", pdfWidth: 0.62 },
  { header: "Ala", getValue: (row) => row.wardName, pdfWidth: 1.45 },
  { header: "Tipo doc.", getValue: (row) => row.documentTypeName, pdfWidth: 0.9 },
  { header: "Doc.", getValue: (row) => row.person.documentValue, pdfWidth: 1.35 },
  { header: "Tel.", getValue: (row) => row.person.phone, pdfWidth: 1.1 },
];

const simpleExportColumns: ExportColumn[] = [
  { header: "Nome", getValue: (row) => row.person.name, pdfWidth: 2.8 },
  { header: "Idade", getValue: (row) => row.age, align: "right", pdfWidth: 0.7 },
  { header: "Ala", getValue: (row) => row.wardName, pdfWidth: 1.55 },
];

export default function CaravanPassengerListPage() {
  const params = useParams<{ caravanId: string }>();
  const { caravanRegistrationsByWard, caravansByWard, db, wards } = useAppContext();
  const { formatDate } = useDateFormatter();
  const caravan = caravansByWard.find((item) => item.id === params.caravanId);
  const peopleById = useMemo(() => new Map(db.caravanPeople.map((person) => [person.id, person])), [db.caravanPeople]);
  const wardsById = useMemo(() => new Map(wards.map((ward) => [ward.id, ward])), [wards]);
  const documentTypesById = useMemo(() => new Map(db.documentTypes.map((documentType) => [documentType.id, documentType])), [db.documentTypes]);

  const passengerRows = useMemo<PassengerListRow[]>(
    () =>
      caravanRegistrationsByWard
        .filter((registration) => registration.caravanId === params.caravanId)
        .map((registration) => {
          const person = peopleById.get(registration.personId);
          if (!person) return null;

          return {
            position: 0,
            registration,
            person,
            age: calculateAge(person.birthDate),
            wardName: wardsById.get(person.homeWardId)?.name ?? "Ala não encontrada",
            documentTypeName: documentTypesById.get(person.documentTypeId)?.name ?? "Documento arquivado",
          };
        })
        .filter((row): row is PassengerListRow => Boolean(row))
        .sort((a, b) => a.person.name.localeCompare(b.person.name, "pt-BR", { sensitivity: "base" }))
        .map((row, index) => ({ ...row, position: index + 1 })),
    [caravanRegistrationsByWard, documentTypesById, params.caravanId, peopleById, wardsById],
  );

  const columns = useMemo<ColumnDef<PassengerListRow>[]>(
    () => [
      {
        accessorKey: "position",
        meta: { label: "#" },
        header: "#",
        cell: ({ row }) => <span className="tabular-nums">{row.original.position}</span>,
      },
      {
        accessorKey: "person.name",
        meta: { label: "Nome" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Nome {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <span className="font-medium">{row.original.person.name}</span>,
      },
      {
        accessorKey: "age",
        meta: { label: "Idade" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Idade {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.age || "Não informada"}</span>,
      },
      {
        accessorKey: "wardName",
        meta: { label: "Ala" },
        header: ({ column }) => (
          <Button className="-ml-2 px-2" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")} size="sm" variant="ghost">
            Ala {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </Button>
        ),
      },
      {
        accessorKey: "documentTypeName",
        meta: { label: "Tipo doc." },
        header: "Tipo doc.",
      },
      {
        id: "documentValue",
        meta: { label: "Doc." },
        header: "Doc.",
        cell: ({ row }) => row.original.person.documentValue || "Não informado",
      },
      {
        id: "phone",
        meta: { label: "Tel." },
        header: "Tel.",
        cell: ({ row }) => row.original.person.phone || "Não informado",
      },
    ],
    [],
  );

  function downloadPassengerList(mode: ExportMode, format: ExportFormat) {
    if (!caravan) return;

    const exportColumns = mode === "complete" ? completeExportColumns : simpleExportColumns;
    const baseFileName = `${slugify(caravan.destination || "caravana")}-lista-${mode === "complete" ? "completa" : "simples"}`;

    if (format === "xlsx") {
      downloadBlob(buildXlsxContent(passengerRows, exportColumns), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${baseFileName}.xlsx`);
      return;
    }

    downloadBlob(
      buildPdfContent({
        columns: exportColumns,
        generatedAt: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()),
        modeLabel: mode === "complete" ? "Lista completa" : "Lista simples",
        rows: passengerRows,
        subtitle: `${formatDate(caravan.departureDate)} às ${caravan.departureTime}`,
        summary: `${caravan.availableSeats} bancos • ${passengerRows.length} passageiro(s)`,
        title: caravan.destination,
      }),
      "application/pdf",
      `${baseFileName}.pdf`,
    );
  }

  if (!caravan) {
    return (
      <PermissionGuard permission="caravan.manage.view">
        <div className="mx-auto max-w-[800px]">
          <PageHeader
            backHref="/caravans/manage"
            title="Caravana não encontrada"
            description="A caravana pode ter sido removida ou não pertence à ala atual."
          />
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="caravan.manage.view">
      <div>
        <PageHeader
          backHref="/caravans/manage"
          eyebrow="Caravana"
          title={caravan.destination}
          description={`${formatDate(caravan.departureDate)} às ${caravan.departureTime}. Lista de passageiros inscritos.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="lg">
                      <Download />
                      Baixar
                      <ChevronDown />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Formato da lista</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Completo</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-32">
                        <DropdownMenuItem onClick={() => downloadPassengerList("complete", "xlsx")}>
                          <FileSpreadsheet />
                          XLSX
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadPassengerList("complete", "pdf")}>
                          <FileText />
                          PDF
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Simples</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-32">
                        <DropdownMenuItem onClick={() => downloadPassengerList("simple", "xlsx")}>
                          <FileSpreadsheet />
                          XLSX
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadPassengerList("simple", "pdf")}>
                          <FileText />
                          PDF
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap gap-3 text-sm font-medium text-muted-foreground">
          <span className="tabular-nums">Lista: {caravan.availableSeats} bancos</span>
          <span className="tabular-nums">{passengerRows.length} passageiro(s)</span>
        </div>

        <DataTable
          columns={columns}
          data={passengerRows}
          emptyMessage="Nenhum passageiro inscrito nesta caravana."
          getRowId={(row) => row.registration.id}
          pageSize={50}
        />
      </div>
    </PermissionGuard>
  );
}

import * as XLSX from "xlsx";
import Papa from "papaparse";
import type { FileKind, ParsedFile } from "./schema";

const INVENTORY_HINTS = ["beginning", "received", "distributed", "transferred", "loss", "commodity", "lot", "physical", "count"];
const VISIT_HINTS = ["household id", "householdid", "visit", "poundslb", "pounds", "program", "tefap", "site"];
const HOUSEHOLD_HINTS = ["name", "address", "household size", "size"];

function guessKind(headers: string[]): FileKind {
  const joined = headers.join(" | ").toLowerCase();
  const score = (hints: string[]) => hints.reduce((n, h) => (joined.includes(h) ? n + 1 : n), 0);
  const inv = score(INVENTORY_HINTS);
  const vis = score(VISIT_HINTS);
  const hh = score(HOUSEHOLD_HINTS);
  if (inv === 0 && vis === 0 && hh === 0) return "unknown";
  if (inv >= vis && inv >= hh) return "inventory";
  if (vis >= hh) return "visits";
  return "households";
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i].filter((c) => c !== undefined && c !== null && String(c).trim() !== "");
    if (nonEmpty.length >= 2) return i;
  }
  return 0;
}

function toStringRows(rows: unknown[][]): string[][] {
  return rows.map((r) => r.map((c) => (c === undefined || c === null ? "" : String(c))));
}

async function parseXlsx(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
  const rows = toStringRows(raw);
  const headerIdx = findHeaderRow(rows);
  const headers = rows[headerIdx] ?? [];
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows: dataRows };
}

function parseCsv(file: File): Promise<{ headers: string[]; rows: string[][] }> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = toStringRows(result.data as unknown[][]);
        const headerIdx = findHeaderRow(rows);
        const headers = rows[headerIdx] ?? [];
        const dataRows = rows.slice(headerIdx + 1);
        resolve({ headers, rows: dataRows });
      },
      error: (err: Error) => reject(err),
    });
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  let headers: string[];
  let rows: string[][];

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    ({ headers, rows } = await parseXlsx(file));
  } else if (lower.endsWith(".csv")) {
    ({ headers, rows } = await parseCsv(file));
  } else {
    throw new Error(`Unsupported file type: ${file.name}. Please upload .xlsx or .csv files.`);
  }

  return {
    name: file.name,
    headers,
    rows,
    kind: guessKind(headers),
    rowCount: rows.length,
  };
}

export async function parseFiles(files: File[]): Promise<ParsedFile[]> {
  return Promise.all(files.map(parseFile));
}

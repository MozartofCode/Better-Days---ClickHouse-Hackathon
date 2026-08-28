import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedFile {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
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
    throw new Error(`Unsupported file type: ${file.name}. Please upload an .xlsx or .csv file.`);
  }

  return { name: file.name, headers, rows, rowCount: rows.length };
}

export function rowsToRecords(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? "";
    });
    return record;
  });
}

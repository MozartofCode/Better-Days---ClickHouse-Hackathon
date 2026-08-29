import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";
import { INVENTORY_FIELDS, mapInventoryColumns } from "./inventory-schema";

interface ParsedSheet {
  columns: string[];
  rows: Record<string, string>[];
}

// Finds the first row that looks like a header row (at least 2 non-empty
// cells) instead of always assuming row 1 — real-world spreadsheets often
// have a title row, a blank row, or a leading blank column above the data.
function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i].filter((c) => c.trim() !== "");
    if (nonEmpty.length >= 2) return i;
  }
  return 0;
}

function parseWorkbook(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new HttpError(400, "Spreadsheet has no sheets");
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const rows = raw.map((r) => r.map((c) => (c === undefined || c === null ? "" : String(c))));

  const headerIdx = findHeaderRowIndex(rows);
  const columns = rows[headerIdx] ?? [];
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim() !== ""));

  if (columns.length === 0 || dataRows.length === 0) {
    throw new HttpError(400, "Spreadsheet has no data rows");
  }

  const stringRows = dataRows.map((row) => {
    const stringRow: Record<string, string> = {};
    columns.forEach((col, i) => {
      if (col) stringRow[col] = row[i] ?? "";
    });
    return stringRow;
  });

  return { columns: columns.filter((c) => c !== ""), rows: stringRows };
}

interface CreateUploadInput {
  foodBankId: string;
  uploadedByUserId: string;
  filename: string;
  buffer: Buffer;
  tag?: string;
}

export async function createUpload(input: CreateUploadInput) {
  const { columns, rows } = parseWorkbook(input.buffer);
  const uploadId = randomUUID();

  await clickhouse.insert({
    table: "uploads",
    values: [
      {
        id: uploadId,
        food_bank_id: input.foodBankId,
        uploaded_by_user_id: input.uploadedByUserId,
        filename: input.filename,
        columns,
        row_count: rows.length,
        tag: input.tag ?? "",
      },
    ],
    format: "JSONEachRow",
  });

  const rowValues = rows.map((row, index) => ({
    upload_id: uploadId,
    food_bank_id: input.foodBankId,
    row_number: index + 1,
    data: row,
  }));

  await clickhouse.insert({
    table: "upload_rows",
    values: rowValues,
    format: "JSONEachRow",
  });

  const mapping = mapInventoryColumns(columns);
  const matchedFields = INVENTORY_FIELDS.filter((f) => mapping[f.key]).map((f) => f.label);
  const unmatchedFields = INVENTORY_FIELDS.filter((f) => !mapping[f.key]).map((f) => f.label);

  return {
    id: uploadId,
    filename: input.filename,
    columns,
    rowCount: rows.length,
    matchedFields,
    unmatchedFields,
    tag: input.tag ?? "",
  };
}

export async function listUploads(foodBankId: string) {
  const result = await clickhouse.query({
    query: `
      SELECT id, filename, columns, row_count, uploaded_at, tag
      FROM uploads
      WHERE food_bank_id = {foodBankId:UUID}
      ORDER BY uploaded_at DESC
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  return result.json();
}

import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";

interface ParsedSheet {
  columns: string[];
  rows: Record<string, string>[];
}

function parseWorkbook(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new HttpError(400, "Spreadsheet has no sheets");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (rows.length === 0) {
    throw new HttpError(400, "Spreadsheet has no data rows");
  }

  const columns = Object.keys(rows[0]);
  const stringRows = rows.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const col of columns) {
      const value = row[col];
      stringRow[col] = value === null || value === undefined ? "" : String(value);
    }
    return stringRow;
  });

  return { columns, rows: stringRows };
}

interface CreateUploadInput {
  foodBankId: string;
  uploadedByUserId: string;
  filename: string;
  buffer: Buffer;
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

  return {
    id: uploadId,
    filename: input.filename,
    columns,
    rowCount: rows.length,
  };
}

export async function listUploads(foodBankId: string) {
  const result = await clickhouse.query({
    query: `
      SELECT id, filename, columns, row_count, uploaded_at
      FROM uploads
      WHERE food_bank_id = {foodBankId:UUID}
      ORDER BY uploaded_at DESC
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  return result.json();
}

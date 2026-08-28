import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";
import { mapDemandColumns, normalizeDemandRow } from "./demand-schema";

// --- Ingestion --------------------------------------------------------------

interface ParsedSheet {
  columns: string[];
  rows: Record<string, string>[];
}

function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const nonEmpty = rows[i].filter((c) => c.trim() !== "");
    if (nonEmpty.length >= 2) return i;
  }
  return 0;
}

// Handles both .xlsx and .csv — SheetJS auto-detects CSV text passed as a buffer.
function parseSpreadsheet(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new HttpError(400, "File has no sheets");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  const rows = raw.map((r) => r.map((c) => (c === undefined || c === null ? "" : String(c))));

  const headerIdx = findHeaderRowIndex(rows);
  const columns = rows[headerIdx] ?? [];
  const dataRows = rows.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim() !== ""));

  if (columns.length === 0 || dataRows.length === 0) {
    throw new HttpError(400, "File has no data rows");
  }

  const stringRows = dataRows.map((row) => {
    const record: Record<string, string> = {};
    columns.forEach((col, i) => {
      if (col) record[col] = row[i] ?? "";
    });
    return record;
  });

  return { columns: columns.filter((c) => c !== ""), rows: stringRows };
}

export interface IngestSummary {
  uploadId: string;
  filename: string;
  source: "csv" | "xlsx" | "json" | "api";
  columns: string[];
  rowCount: number;
  normalizedCount: number;
  errorCount: number;
}

async function storeIngestedRows(input: {
  foodBankId: string;
  uploadedByUserId: string;
  filename: string;
  source: "csv" | "xlsx" | "json" | "api";
  columns: string[];
  rows: Record<string, string>[];
}): Promise<IngestSummary> {
  const { foodBankId, uploadedByUserId, filename, source, columns, rows } = input;
  const uploadId = randomUUID();
  const mapping = mapDemandColumns(columns);

  const normalized = rows.map((row, index) => ({
    rowNumber: index + 1,
    raw: row,
    record: normalizeDemandRow(row, mapping),
  }));
  const normalizedCount = normalized.filter((r) => r.record.valid).length;
  const errorCount = rows.length - normalizedCount;

  // Raw layer: every row, verbatim, regardless of validity — nothing is ever
  // rejected outright, matching the rest of this app's "show data as-is"
  // philosophy while still keeping a normalized layer for the query engine.
  await clickhouse.insert({
    table: "demand_uploads",
    values: [
      {
        id: uploadId,
        food_bank_id: foodBankId,
        uploaded_by_user_id: uploadedByUserId,
        filename,
        source,
        columns,
        row_count: rows.length,
        normalized_count: normalizedCount,
        error_count: errorCount,
      },
    ],
    format: "JSONEachRow",
  });

  await clickhouse.insert({
    table: "demand_raw_rows",
    values: normalized.map((r) => ({
      upload_id: uploadId,
      food_bank_id: foodBankId,
      row_number: r.rowNumber,
      data: r.raw,
    })),
    format: "JSONEachRow",
  });

  const validRecords = normalized.filter((r) => r.record.valid);
  if (validRecords.length > 0) {
    await clickhouse.insert({
      table: "demand_records",
      values: validRecords.map((r) => ({
        id: randomUUID(),
        upload_id: uploadId,
        food_bank_id: foodBankId,
        site: r.record.site,
        record_date: r.record.date,
        commodity: r.record.commodity,
        visit_count: r.record.visitCount,
        household_count: r.record.householdCount,
        quantity: r.record.quantity,
        unit: r.record.unit,
        source_file: filename,
        source_row: r.rowNumber,
      })),
      format: "JSONEachRow",
    });
  }

  return { uploadId, filename, source, columns, rowCount: rows.length, normalizedCount, errorCount };
}

export interface IngestFileInput {
  foodBankId: string;
  uploadedByUserId: string;
  filename: string;
  buffer: Buffer;
}

export async function ingestDemandFile(input: IngestFileInput): Promise<IngestSummary> {
  const { columns, rows } = parseSpreadsheet(input.buffer);
  const source = input.filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
  return storeIngestedRows({
    foodBankId: input.foodBankId,
    uploadedByUserId: input.uploadedByUserId,
    filename: input.filename,
    source,
    columns,
    rows,
  });
}

export interface IngestJsonInput {
  foodBankId: string;
  uploadedByUserId: string;
  filename: string;
  records: Record<string, unknown>[];
}

// Accepts already-structured records (e.g. an API response) instead of a
// spreadsheet — same normalization/storage path as the file upload.
export async function ingestDemandJson(input: IngestJsonInput): Promise<IngestSummary> {
  if (input.records.length === 0) {
    throw new HttpError(400, "No records provided");
  }
  const columnSet = new Set<string>();
  for (const record of input.records) {
    for (const key of Object.keys(record)) columnSet.add(key);
  }
  const columns = [...columnSet];
  const rows = input.records.map((record) => {
    const row: Record<string, string> = {};
    for (const col of columns) {
      const value = record[col];
      row[col] = value === undefined || value === null ? "" : String(value);
    }
    return row;
  });

  return storeIngestedRows({
    foodBankId: input.foodBankId,
    uploadedByUserId: input.uploadedByUserId,
    filename: input.filename,
    source: "json",
    columns,
    rows,
  });
}

export async function listDemandUploads(foodBankId: string) {
  const result = await clickhouse.query({
    query: `
      SELECT id, filename, source, columns, row_count, normalized_count, error_count, uploaded_at
      FROM demand_uploads
      WHERE food_bank_id = {foodBankId:UUID}
      ORDER BY uploaded_at DESC
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  return result.json();
}

// --- Deterministic queries ---------------------------------------------------
// Every function here runs one fixed, parameterized, read-only SQL query (or
// a small number of them) against demand_records and returns the actual
// result. Nothing here is computed or guessed by an LLM — see ask.service.ts,
// which only narrates what these functions return.

export interface DemandQueryRow {
  [key: string]: string | number | null;
}

function monthFilterClause(month?: string): { clause: string; params: Record<string, unknown> } {
  if (!month) return { clause: "", params: {} };
  return { clause: "AND toYYYYMM(record_date) = {month:UInt32}", params: { month: Number(month.replace("-", "")) } };
}

export async function topSitesByDemand(foodBankId: string, month?: string): Promise<DemandQueryRow[]> {
  const { clause, params } = monthFilterClause(month);
  const result = await clickhouse.query({
    query: `
      SELECT
        site,
        sum(coalesce(visit_count, 0)) AS total_visits,
        sum(coalesce(household_count, 0)) AS total_households,
        sum(coalesce(quantity, 0)) AS total_quantity
      FROM demand_records
      WHERE food_bank_id = {foodBankId:UUID} AND site IS NOT NULL ${clause}
      GROUP BY site
      ORDER BY total_visits DESC, total_quantity DESC
      LIMIT 10
    `,
    query_params: { foodBankId, ...params },
    format: "JSONEachRow",
  });
  return result.json();
}

export async function demandTrend(foodBankId: string, months = 3): Promise<DemandQueryRow[]> {
  const result = await clickhouse.query({
    query: `
      SELECT
        toStartOfMonth(record_date) AS month,
        sum(coalesce(visit_count, 0)) AS total_visits,
        sum(coalesce(household_count, 0)) AS total_households,
        sum(coalesce(quantity, 0)) AS total_quantity
      FROM demand_records
      WHERE food_bank_id = {foodBankId:UUID}
        AND record_date >= subtractMonths(today(), {months:UInt8})
      GROUP BY month
      ORDER BY month ASC
    `,
    query_params: { foodBankId, months },
    format: "JSONEachRow",
  });
  return result.json();
}

export async function commoditiesByDemand(foodBankId: string, month?: string): Promise<DemandQueryRow[]> {
  const { clause, params } = monthFilterClause(month);
  const result = await clickhouse.query({
    query: `
      SELECT
        commodity,
        sum(coalesce(quantity, 0)) AS total_quantity,
        sum(coalesce(visit_count, 0)) AS total_visits
      FROM demand_records
      WHERE food_bank_id = {foodBankId:UUID} AND commodity IS NOT NULL ${clause}
      GROUP BY commodity
      ORDER BY total_quantity DESC, total_visits DESC
      LIMIT 10
    `,
    query_params: { foodBankId, ...params },
    format: "JSONEachRow",
  });
  return result.json();
}

interface SiteMonthRow extends DemandQueryRow {
  site: string;
  month: string;
  total_demand: number;
}

// "Increasing demand" and "month-over-month change" both need the last two
// full calendar months per site/overall — computed here in JS from one query
// result, not by the LLM.
async function lastTwoMonthsBySite(foodBankId: string): Promise<SiteMonthRow[]> {
  const result = await clickhouse.query({
    query: `
      SELECT
        site,
        toStartOfMonth(record_date) AS month,
        sum(coalesce(visit_count, 0)) + sum(coalesce(quantity, 0)) AS total_demand
      FROM demand_records
      WHERE food_bank_id = {foodBankId:UUID}
        AND site IS NOT NULL
        AND record_date >= subtractMonths(toStartOfMonth(today()), 1)
      GROUP BY site, month
      ORDER BY site, month
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  return result.json<SiteMonthRow>();
}

export interface SiteDelta {
  site: string;
  previousMonth: number;
  currentMonth: number;
  delta: number;
}

export async function sitesWithIncreasingDemand(foodBankId: string): Promise<SiteDelta[]> {
  const rows = await lastTwoMonthsBySite(foodBankId);
  const bySite = new Map<string, { previous: number; current: number }>();
  const thisMonth = new Date();
  const thisMonthKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;

  for (const row of rows) {
    const entry = bySite.get(row.site) ?? { previous: 0, current: 0 };
    if (row.month === thisMonthKey) entry.current += Number(row.total_demand);
    else entry.previous += Number(row.total_demand);
    bySite.set(row.site, entry);
  }

  return [...bySite.entries()]
    .map(([site, v]) => ({ site, previousMonth: v.previous, currentMonth: v.current, delta: v.current - v.previous }))
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta);
}

export interface MonthOverMonthResult {
  previousMonthTotal: number;
  currentMonthTotal: number;
  delta: number;
  deltaPct: number | null;
}

export async function monthOverMonthChange(foodBankId: string): Promise<MonthOverMonthResult> {
  const rows = await lastTwoMonthsBySite(foodBankId);
  const thisMonth = new Date();
  const thisMonthKey = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}-01`;

  let previousMonthTotal = 0;
  let currentMonthTotal = 0;
  for (const row of rows) {
    if (row.month === thisMonthKey) currentMonthTotal += Number(row.total_demand);
    else previousMonthTotal += Number(row.total_demand);
  }

  const delta = currentMonthTotal - previousMonthTotal;
  const deltaPct = previousMonthTotal === 0 ? null : Math.round((delta / previousMonthTotal) * 1000) / 10;
  return { previousMonthTotal, currentMonthTotal, delta, deltaPct };
}

export async function getRecordsForUpload(foodBankId: string, uploadId: string, page: number, pageSize: number) {
  const result = await clickhouse.query({
    query: `
      SELECT site, record_date, commodity, visit_count, household_count, quantity, unit, source_file, source_row
      FROM demand_records
      WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID}
      ORDER BY source_row ASC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
    query_params: { foodBankId, uploadId, limit: pageSize, offset: (page - 1) * pageSize },
    format: "JSONEachRow",
  });
  return result.json();
}

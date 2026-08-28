import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";
import { classifyStockStatus, mapInventoryColumns, normalizeInventoryRow } from "../uploads/inventory-schema";

export async function getSummary(foodBankId: string) {
  const uploadsResult = await clickhouse.query({
    query: `
      SELECT
        count() AS total_uploads,
        sum(row_count) AS total_rows,
        max(uploaded_at) AS last_upload_at
      FROM uploads
      WHERE food_bank_id = {foodBankId:UUID}
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  const [summary] = await uploadsResult.json<{
    total_uploads: string;
    total_rows: string | null;
    last_upload_at: string | null;
  }>();

  const recentResult = await clickhouse.query({
    query: `
      SELECT id, filename, columns, row_count, uploaded_at
      FROM uploads
      WHERE food_bank_id = {foodBankId:UUID}
      ORDER BY uploaded_at DESC
      LIMIT 5
    `,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  const recentUploads = await recentResult.json<{ id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string }>();

  // The most recent upload is treated as the current inventory snapshot.
  const latest = recentUploads[0] ?? null;
  const currentInventory = latest ? await getInventoryOverview(foodBankId, latest.id, latest) : null;

  return {
    totalUploads: Number(summary?.total_uploads ?? 0),
    totalRows: Number(summary?.total_rows ?? 0),
    lastUploadAt: summary?.last_upload_at ?? null,
    recentUploads,
    currentInventory,
  };
}

async function getInventoryOverview(
  foodBankId: string,
  uploadId: string,
  upload: { id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string }
) {
  const mapping = mapInventoryColumns(upload.columns);
  const rowsResult = await clickhouse.query({
    query: `
      SELECT data
      FROM upload_rows
      WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID}
    `,
    query_params: { foodBankId, uploadId },
    format: "JSONEachRow",
  });
  const rows = await rowsResult.json<{ data: Record<string, string> }>();

  const items = rows.map((r) => normalizeInventoryRow(r.data, mapping));
  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  let expiringSoon = 0;
  let expired = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const categoryCounts = new Map<string, number>();

  for (const item of items) {
    if (item.expirationDate) {
      const expiry = Date.parse(item.expirationDate);
      if (!Number.isNaN(expiry)) {
        if (expiry < now) expired++;
        else if (expiry - now <= THIRTY_DAYS_MS) expiringSoon++;
      }
    }
    const status = classifyStockStatus(item.restockingStatus);
    if (status === "low") lowStock++;
    if (status === "out") outOfStock++;

    const category = item.category ?? "Uncategorized";
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  const categories = [...categoryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    fromUpload: { id: upload.id, filename: upload.filename, uploadedAt: upload.uploaded_at },
    totalItems: items.length,
    expiringSoon,
    expired,
    lowStock,
    outOfStock,
    categories,
  };
}

export async function getUploadRows(
  foodBankId: string,
  uploadId: string,
  page: number,
  pageSize: number
) {
  const uploadResult = await clickhouse.query({
    query: `
      SELECT id, filename, columns, row_count, uploaded_at
      FROM uploads
      WHERE food_bank_id = {foodBankId:UUID} AND id = {uploadId:UUID}
      LIMIT 1
    `,
    query_params: { foodBankId, uploadId },
    format: "JSONEachRow",
  });
  const [upload] = await uploadResult.json<{ id: string; filename: string; columns: string[]; row_count: number; uploaded_at: string }>();
  if (!upload) {
    throw new HttpError(404, "Upload not found");
  }

  const rowsResult = await clickhouse.query({
    query: `
      SELECT row_number, data
      FROM upload_rows
      WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID}
      ORDER BY row_number ASC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `,
    query_params: { foodBankId, uploadId, limit: pageSize, offset: (page - 1) * pageSize },
    format: "JSONEachRow",
  });
  const rows = await rowsResult.json<{ row_number: number; data: Record<string, string> }>();

  const mapping = mapInventoryColumns(upload.columns);
  const items = rows.map((r) => ({ rowNumber: r.row_number, ...normalizeInventoryRow(r.data, mapping) }));

  return { upload, rows, items, page, pageSize };
}

/**
 * Corrects specific fields of one uploaded row. Merges `patch` into the
 * row's existing `data` map (via ClickHouse's mapUpdate) rather than
 * replacing it wholesale, so a caller only needs to send the fields being
 * corrected. ClickHouse ALTER TABLE ... UPDATE is an async mutation — the
 * change is queued, not applied synchronously.
 */
export async function correctUploadRow(
  foodBankId: string,
  uploadId: string,
  rowNumber: number,
  patch: Record<string, string>
) {
  const existing = await clickhouse.query({
    query: `
      SELECT row_number FROM upload_rows
      WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID} AND row_number = {rowNumber:UInt32}
      LIMIT 1
    `,
    query_params: { foodBankId, uploadId, rowNumber },
    format: "JSONEachRow",
  });
  const [row] = await existing.json<{ row_number: number }>();
  if (!row) {
    throw new HttpError(404, "Upload row not found");
  }

  await clickhouse.command({
    query: `
      ALTER TABLE upload_rows
      UPDATE data = mapUpdate(data, {patch:Map(String, String)})
      WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID} AND row_number = {rowNumber:UInt32}
    `,
    query_params: { foodBankId, uploadId, rowNumber, patch },
  });

  return { queued: true, uploadId, rowNumber };
}

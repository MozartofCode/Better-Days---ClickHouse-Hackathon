// Bridges the existing upload pipeline (ClickHouse `uploads`/`upload_rows`,
// flat Jotform-style inventory rows — see api/src/modules/uploads/) into the
// canonical operations schema (Postgres `items`/`inventory_lots`/`sites`).
//
// Honest limitation: the Jotform inventory template has no beginning/
// received/distributed/transaction history, just a point-in-time snapshot
// per item. So this ETL can only populate Item + InventoryLot — it cannot
// synthesize InventoryTransaction rows (that would mean inventing history
// that was never recorded), which is why monthly_operations_reconciliation
// legitimately reports "insufficient data" against real uploaded data while
// distribution_readiness_brief (which only needs the current snapshot) does
// not. This is the system doing exactly what the spec requires: never
// substitute invented data for what wasn't actually collected.

import { pgPool } from "../../db/postgres";
import { clickhouse } from "../../db/clickhouse";
import { mapInventoryColumns, normalizeInventoryRow } from "../uploads/inventory-schema";
import { getOrCreateSiteId, getOrCreateItemId } from "./operations.service";

const UPLOAD_SOURCE_TYPE = "upload";

interface UploadRow {
  id: string;
  filename: string;
  columns: string[];
  row_count: number;
  uploaded_at: string;
}

function parseDateOrNull(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

async function alreadySynced(foodBankId: string, uploadId: string): Promise<boolean> {
  const result = await pgPool.query(
    `SELECT 1 FROM data_sources
     WHERE organization_id = $1 AND source_type = $2 AND source_row_reference = $3
     LIMIT 1`,
    [foodBankId, UPLOAD_SOURCE_TYPE, uploadId]
  );
  return result.rows.length > 0;
}

async function syncOneUpload(foodBankId: string, upload: UploadRow): Promise<number> {
  const siteId = await getOrCreateSiteId(foodBankId);
  const mapping = mapInventoryColumns(upload.columns);

  const rowsResult = await clickhouse.query({
    query: `SELECT data FROM upload_rows WHERE food_bank_id = {foodBankId:UUID} AND upload_id = {uploadId:UUID}`,
    query_params: { foodBankId, uploadId: upload.id },
    format: "JSONEachRow",
  });
  const rows = await rowsResult.json<{ data: Record<string, string> }>();

  let lotsCreated = 0;
  let matchedFieldCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const item = normalizeInventoryRow(rows[i].data, mapping);
    if (!item.itemName) continue; // can't create a canonical item with no name

    const itemId = await getOrCreateItemId(foodBankId, item.itemName, item.unit);
    await pgPool.query(
      `INSERT INTO inventory_lots
         (item_id, site_id, source_type, storage_location, received_date, expiry_date,
          quantity_on_hand, unit_of_measure, reconciliation_status, last_verified_at, source_reference)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unreconciled', now(), $9)`,
      [
        itemId,
        siteId,
        UPLOAD_SOURCE_TYPE,
        item.storageLocation,
        parseDateOrNull(item.dateEntered),
        parseDateOrNull(item.expirationDate),
        item.quantity ?? 0,
        item.unit ?? "unit",
        `${upload.filename}:row${i + 1}`,
      ]
    );
    lotsCreated += 1;
    if (item.itemName) matchedFieldCount += 1;
  }

  const confidence = rows.length > 0 ? matchedFieldCount / rows.length : 0;
  await pgPool.query(
    `INSERT INTO data_sources
       (organization_id, source_type, source_name, file_name, import_timestamp,
        source_row_reference, extraction_confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [foodBankId, UPLOAD_SOURCE_TYPE, upload.filename, upload.filename, upload.uploaded_at, upload.id, confidence]
  );

  return lotsCreated;
}

export interface SyncResult {
  uploadsSynced: number;
  lotsCreated: number;
}

// Idempotent — safe to call on every dashboard read. Skips uploads already
// recorded in data_sources rather than re-inserting duplicate lots.
export async function syncUploadsIntoCanonicalSchema(foodBankId: string): Promise<SyncResult> {
  const uploadsResult = await clickhouse.query({
    query: `SELECT id, filename, columns, row_count, uploaded_at FROM uploads WHERE food_bank_id = {foodBankId:UUID}`,
    query_params: { foodBankId },
    format: "JSONEachRow",
  });
  const uploads = await uploadsResult.json<UploadRow>();

  let uploadsSynced = 0;
  let lotsCreated = 0;

  for (const upload of uploads) {
    if (await alreadySynced(foodBankId, upload.id)) continue;
    lotsCreated += await syncOneUpload(foodBankId, upload);
    uploadsSynced += 1;
  }

  return { uploadsSynced, lotsCreated };
}

import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";

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
  const recentUploads = await recentResult.json();

  return {
    totalUploads: Number(summary?.total_uploads ?? 0),
    totalRows: Number(summary?.total_rows ?? 0),
    lastUploadAt: summary?.last_upload_at ?? null,
    recentUploads,
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
  const [upload] = await uploadResult.json();
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
  const rows = await rowsResult.json();

  return { upload, rows, page, pageSize };
}

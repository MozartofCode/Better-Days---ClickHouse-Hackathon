// Metadata for generated PDFs (generated_reports table). This is the tenant
// boundary for downloads: a report row's organization_id is checked against
// the requesting user's foodBankId before a file is ever served — the
// filename/path alone is never trusted as an access check.

import { pgPool } from "../../db/postgres";
import { HttpError } from "../../utils/http-error";
import { ReportDocument } from "./reports/types";

export interface GeneratedReportRow {
  reportId: string;
  organizationId: string;
  templateId: string;
  version: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  filename: string;
  filePath: string;
  blocked: boolean;
  generatedAt: string;
}

function toRow(row: any): GeneratedReportRow {
  return {
    reportId: row.report_id,
    organizationId: row.organization_id,
    templateId: row.template_id,
    version: row.version,
    status: row.status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    filename: row.filename,
    filePath: row.file_path,
    blocked: row.blocked,
    generatedAt: row.generated_at,
  };
}

export async function recordGeneratedReport(params: {
  foodBankId: string;
  report: ReportDocument;
  periodStart: string;
  periodEnd: string;
  filename: string;
  filePath: string;
  blocked: boolean;
  generatedByUserId: string;
}): Promise<GeneratedReportRow> {
  const result = await pgPool.query(
    `INSERT INTO generated_reports
       (report_id, organization_id, template_id, version, status, period_start, period_end,
        filename, file_path, blocked, data_quality_summary, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      params.report.reportId,
      params.foodBankId,
      params.report.templateId,
      params.report.version,
      params.report.status,
      params.periodStart,
      params.periodEnd,
      params.filename,
      params.filePath,
      params.blocked,
      JSON.stringify(params.report.dataQuality),
      params.generatedByUserId,
    ]
  );
  return toRow(result.rows[0]);
}

export async function listGeneratedReports(foodBankId: string): Promise<GeneratedReportRow[]> {
  const result = await pgPool.query(
    `SELECT * FROM generated_reports WHERE organization_id = $1 ORDER BY generated_at DESC`,
    [foodBankId]
  );
  return result.rows.map(toRow);
}

export async function getGeneratedReportForDownload(
  foodBankId: string,
  reportId: string
): Promise<GeneratedReportRow> {
  const result = await pgPool.query(
    `SELECT * FROM generated_reports WHERE report_id = $1 AND organization_id = $2`,
    [reportId, foodBankId]
  );
  // Same 404 whether the report doesn't exist or belongs to another food
  // bank — this is the tenant check for downloads.
  if (result.rows.length === 0) throw new HttpError(404, "Report not found");
  return toRow(result.rows[0]);
}

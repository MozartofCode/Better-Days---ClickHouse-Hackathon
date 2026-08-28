// Orchestrates: gate -> render -> save. This is the one place PDF bytes
// touch disk. Callers (a future REST route) pass an already-built
// ReportDocument — building the document (querying Postgres, running
// calculations.ts) is deliberately kept out of this file so it stays
// testable without a DB (see verify-report-generation.ts).

import fs from "fs";
import path from "path";
import { renderReportPdf } from "./pdf/renderPdf";
import { reportFilename, slugify, ReportDocument } from "./types";

const REPORTS_DIR = path.join(__dirname, "..", "..", "..", "..", "generated-reports");

export interface GenerateReportResult {
  status: "generated" | "blocked";
  filePath: string | null;
  filename: string | null;
  report: ReportDocument;
}

export interface GenerateReportOptions {
  periodStart: string;
  periodEnd: string;
  // Per spec: blocking issues stop a normal generate; forceIncomplete allows
  // an explicitly-requested, clearly-watermarked incomplete draft anyway.
  forceIncomplete?: boolean;
}

export async function generateReport(
  report: ReportDocument,
  options: GenerateReportOptions
): Promise<GenerateReportResult> {
  if (report.dataQuality.hasBlockingIssues && !options.forceIncomplete) {
    return { status: "blocked", filePath: null, filename: null, report };
  }

  const finalReport: ReportDocument = report.dataQuality.hasBlockingIssues
    ? { ...report, watermark: "INCOMPLETE DRAFT — BLOCKING DATA ISSUES UNRESOLVED" }
    : report;

  const pdfBuffer = await renderReportPdf(finalReport);

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filename = reportFilename({
    organizationSlug: slugify(report.organizationName),
    templateId: report.templateId,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    version: report.version,
  });
  const filePath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filePath, pdfBuffer);

  return { status: "generated", filePath, filename, report: finalReport };
}

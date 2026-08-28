import { ReportTemplateId } from "../types";

export type DataQualitySeverity = "blocking" | "warning" | "informational";

export interface DataQualityIssue {
  severity: DataQualitySeverity;
  message: string;
}

export interface DataQualityGateResult {
  hasBlockingIssues: boolean;
  issues: DataQualityIssue[];
}

// Per spec: "For blocking issues: do not generate a finalized report.
// Generate only a clearly marked incomplete draft if user explicitly requests it."
export function evaluateDataQualityGate(issues: DataQualityIssue[]): DataQualityGateResult {
  return { hasBlockingIssues: issues.some((i) => i.severity === "blocking"), issues };
}

export type ReportSection =
  | { kind: "text"; sectionId: string; title: string; body: string }
  | { kind: "keyValue"; sectionId: string; title: string; rows: Array<[string, string]> }
  | { kind: "table"; sectionId: string; title: string; headers: string[]; rows: string[][] };

export type ReportStatus = "draft" | "reviewed" | "approved" | "finalized";

export interface ReportDocument {
  reportId: string;
  version: number;
  templateId: ReportTemplateId;
  title: string;
  organizationName: string;
  siteProgramLabel: string;
  periodLabel: string;
  generatedAt: string;
  dataAsOfTimestamp: string | null;
  status: ReportStatus;
  watermark: string | null;
  sections: ReportSection[];
  dataQuality: DataQualityGateResult;
}

export function reportFilename(params: {
  organizationSlug: string;
  templateId: ReportTemplateId;
  periodStart: string;
  periodEnd: string;
  version: number;
}): string {
  return `${params.organizationSlug}_${params.templateId}_${params.periodStart}_${params.periodEnd}_v${params.version}.pdf`;
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

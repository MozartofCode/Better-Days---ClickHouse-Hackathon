// template_id: distribution_readiness_brief
// Internal daily/weekly operational brief for the next distribution.
// Maximum length target: 2-4 pages (enforced by content scope, not truncation).

import { NearExpiryLot } from "../calculations";
import { DetectedException } from "../exceptions";
import { Recommendation } from "../recommendations";
import { DataQualityIssue, ReportDocument, ReportSection, evaluateDataQualityGate } from "./types";

export type ReadinessStatus = "green" | "yellow" | "red" | "unknown";

export interface DistributionReadinessBriefInput {
  reportId: string;
  version: number;
  organizationName: string;
  siteProgramLabel: string;
  generatedAt: string;
  dataAsOfTimestamp: string | null;
  status: "draft" | "reviewed" | "approved" | "finalized";

  nextDistributionDate: string | null;
  nextDistributionTime: string | null;
  plannedHouseholds: number | null;
  plannedBoxes: number | null;

  readinessStatus: ReadinessStatus;
  readinessExplanation: string;

  coverageByCategory: Map<string, number>;
  requirementByCategory: Map<string, number>;
  shortfallByCategory: Map<string, number>;

  nearExpiryLots: NearExpiryLot[];
  readinessAffectingExceptions: DetectedException[];
  volunteerGapCount: number | null;

  topThreeRecommendations: Recommendation[];
}

function classifyIssues(input: DistributionReadinessBriefInput): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (!input.organizationName) {
    issues.push({ severity: "blocking", message: "Organization identity is missing." });
  }
  if (!input.nextDistributionDate) {
    issues.push({ severity: "blocking", message: "Next distribution date is not recorded — report period is undefined." });
  }
  if (input.readinessStatus === "unknown") {
    issues.push({
      severity: "warning",
      message: "Overall readiness could not be determined from available data.",
    });
  }
  const highSeverityCount = input.readinessAffectingExceptions.filter(
    (e) => e.severity === "critical" || e.severity === "high"
  ).length;
  if (highSeverityCount > 0) {
    issues.push({
      severity: "warning",
      message: `${highSeverityCount} unresolved high-severity exception(s) may affect readiness.`,
    });
  }
  if (input.volunteerGapCount === null) {
    issues.push({ severity: "informational", message: "No volunteer shift data available for this period." });
  }
  if (input.nearExpiryLots.length === 0) {
    issues.push({ severity: "informational", message: "No near-expiry inventory in the current data." });
  }

  return issues;
}

export function buildDistributionReadinessBrief(input: DistributionReadinessBriefInput): ReportDocument {
  const issues = classifyIssues(input);
  const dataQuality = evaluateDataQualityGate(issues);

  const sections: ReportSection[] = [
    {
      kind: "keyValue",
      sectionId: "readiness",
      title: "Overall Readiness",
      rows: [
        ["Status", input.readinessStatus.toUpperCase()],
        ["Explanation", input.readinessExplanation],
        ["Next distribution", `${input.nextDistributionDate ?? "Not recorded"} ${input.nextDistributionTime ?? ""}`.trim()],
        ["Planned households", input.plannedHouseholds === null ? "Not recorded" : String(input.plannedHouseholds)],
        ["Planned boxes", input.plannedBoxes === null ? "Not recorded" : String(input.plannedBoxes)],
      ],
    },
    {
      kind: "table",
      sectionId: "top_three_recommendations",
      title: "Top Three Recommendations",
      headers: ["Rank", "Priority", "Title", "Owner", "Due"],
      rows: input.topThreeRecommendations.map((r) => [
        String(r.rank),
        r.priority,
        r.title,
        r.ownerRole,
        r.dueBy ?? "Not specified",
      ]),
    },
    {
      kind: "table",
      sectionId: "inventory_coverage",
      title: "Inventory Coverage by Category",
      headers: ["Category", "Confirmed coverage", "Planned requirement", "Shortfall/Surplus"],
      rows: [...input.requirementByCategory.entries()].map(([category, requirement]) => {
        const coverage = input.coverageByCategory.get(category) ?? 0;
        const delta = input.shortfallByCategory.get(category) ?? coverage - requirement;
        return [
          category,
          String(coverage),
          String(requirement),
          delta < 0 ? `${Math.abs(delta)} short` : `${delta} surplus`,
        ];
      }),
    },
    {
      kind: "table",
      sectionId: "near_expiry",
      title: "Near-Expiry Inventory",
      headers: ["Lot", "Quantity", "Unit", "Days to expiry"],
      rows: input.nearExpiryLots.map((n) => [
        n.lot.lotNumber ?? n.lot.inventoryLotId,
        String(n.lot.quantityOnHand),
        n.lot.unitOfMeasure,
        String(n.daysToExpiry),
      ]),
    },
    {
      kind: "table",
      sectionId: "reconciliation_exceptions",
      title: "Reconciliation Exceptions Affecting Readiness",
      headers: ["Severity", "Type", "Explanation"],
      rows: input.readinessAffectingExceptions.map((e) => [e.severity, e.exceptionType, e.explanation]),
    },
    {
      kind: "text",
      sectionId: "data_notes",
      title: "Data Notes and Limitations",
      body: issues.map((i) => `[${i.severity.toUpperCase()}] ${i.message}`).join("\n") || "No data quality issues detected.",
    },
    {
      kind: "text",
      sectionId: "methodology_appendix",
      title: "Source and Methodology Appendix",
      body:
        "Readiness, coverage, and shortfall figures are computed deterministically from reconciled inventory " +
        "and distribution records (see api/src/modules/operations/calculations.ts). Recommendation narrative " +
        "text is model-assisted and grounded only in the evidence shown above; it never introduces a number, " +
        "date, or cause not already present in the underlying data. This report is decision support only and " +
        "requires staff review before being acted on.",
    },
  ];

  return {
    reportId: input.reportId,
    version: input.version,
    templateId: "distribution_readiness_brief",
    title: "Distribution Readiness Brief",
    organizationName: input.organizationName,
    siteProgramLabel: input.siteProgramLabel,
    periodLabel: input.nextDistributionDate ?? "Period not recorded",
    generatedAt: input.generatedAt,
    dataAsOfTimestamp: input.dataAsOfTimestamp,
    status: input.status,
    watermark: input.status === "draft" ? "DRAFT — STAFF REVIEW REQUIRED" : null,
    sections,
    dataQuality,
  };
}

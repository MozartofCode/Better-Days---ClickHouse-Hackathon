// template_id: monthly_operations_reconciliation
// Internal operational and management report. Structurally modeled on the
// USDA/TEFAP monthly distribution report format (beginning inventory,
// received, distributed, ending balance by commodity) the user linked —
// see the "inventory_reconciliation" section, which maps 1:1 onto
// calculations.ts's inventoryBalanceCheck output per commodity.
// Maximum length target: 5-10 pages.

import { CalculatedMetric, InventoryBalanceCheck } from "../calculations";
import { ExceptionSeverity } from "../types";
import { Recommendation } from "../recommendations";
import { DataQualityIssue, ReportDocument, ReportSection, evaluateDataQualityGate } from "./types";

export interface CommodityBalance {
  category: string;
  balance: CalculatedMetric<InventoryBalanceCheck>;
}

export interface MonthlyOperationsReconciliationInput {
  reportId: string;
  version: number;
  organizationName: string;
  siteProgramLabel: string;
  generatedAt: string;
  dataAsOfTimestamp: string | null;
  status: "draft" | "reviewed" | "approved" | "finalized";

  periodStart: string;
  periodEnd: string;

  householdsServed: number | null;
  visits: number | null;
  poundsDistributed: number | null;

  commodityBalances: CommodityBalance[];
  reconciliationMatchRate: CalculatedMetric<number>;
  exceptionSeverityCounts: Record<ExceptionSeverity, number>;
  unresolvedExceptionCount: number;

  dataCompleteness: CalculatedMetric<number>;
  dataFreshnessAgeMinutes: number | null;

  monthOverMonthAvailable: boolean;
  topThreeRecommendations: Recommendation[];
}

function classifyIssues(input: MonthlyOperationsReconciliationInput): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];

  if (!input.organizationName) {
    issues.push({ severity: "blocking", message: "Organization identity is missing." });
  }
  if (!input.periodStart || !input.periodEnd) {
    issues.push({ severity: "blocking", message: "Reporting period start/end is missing." });
  }
  const allCommoditiesInsufficient =
    input.commodityBalances.length === 0 ||
    input.commodityBalances.every((c) => c.balance.status === "insufficient_data");
  if (allCommoditiesInsufficient) {
    issues.push({
      severity: "blocking",
      message: "Inventory reconciliation cannot be calculated for any commodity — no transaction data for this period.",
    });
  }

  if (input.reconciliationMatchRate.status === "insufficient_data") {
    issues.push({ severity: "warning", message: "Reconciliation match rate could not be calculated." });
  } else if ((input.reconciliationMatchRate.value ?? 0) < 0.9) {
    issues.push({
      severity: "warning",
      message: `Reconciliation match rate is ${((input.reconciliationMatchRate.value ?? 0) * 100).toFixed(1)}%, below the 90% guideline.`,
    });
  }
  const highSeverity = input.exceptionSeverityCounts.critical + input.exceptionSeverityCounts.high;
  if (highSeverity > 0) {
    issues.push({ severity: "warning", message: `${highSeverity} unresolved high-severity exception(s).` });
  }
  if (!input.monthOverMonthAvailable) {
    issues.push({ severity: "informational", message: "No prior-period data available for month-over-month comparison." });
  }
  if (input.dataCompleteness.status === "insufficient_data") {
    issues.push({ severity: "warning", message: "Data completeness could not be assessed." });
  }

  return issues;
}

export function buildMonthlyOperationsReconciliation(
  input: MonthlyOperationsReconciliationInput
): ReportDocument {
  const issues = classifyIssues(input);
  const dataQuality = evaluateDataQualityGate(issues);

  const sections: ReportSection[] = [
    {
      kind: "keyValue",
      sectionId: "executive_summary",
      title: "Executive Summary",
      rows: [
        ["Households served", input.householdsServed === null ? "Insufficient data" : String(input.householdsServed)],
        ["Distribution visits", input.visits === null ? "Insufficient data" : String(input.visits)],
        ["Pounds distributed", input.poundsDistributed === null ? "Insufficient data" : String(input.poundsDistributed)],
      ],
    },
    {
      kind: "table",
      sectionId: "inventory_reconciliation",
      title: "Inventory Reconciliation",
      headers: ["Commodity", "Beginning", "Received", "Distributed", "Waste", "Ending (expected)", "Ending (counted)", "Variance"],
      rows: input.commodityBalances.map(({ category, balance }) => {
        if (balance.status === "insufficient_data" || !balance.value) {
          return [category, "Insufficient data", "—", "—", "—", "—", "—", balance.missingDataReason ?? "—"];
        }
        const b = balance.value;
        return [
          category,
          String(b.beginningInventory),
          String(b.receipts),
          String(b.distributed),
          String(b.wasteOrSpoilage),
          String(b.expectedEndingInventory),
          String(b.actualEndingInventory),
          b.matched ? "Matched" : String(b.varianceQuantity),
        ];
      }),
    },
    {
      kind: "keyValue",
      sectionId: "reconciliation_summary",
      title: "Reconciliation Summary",
      rows: [
        [
          "Reconciliation match rate",
          input.reconciliationMatchRate.status === "ok"
            ? `${((input.reconciliationMatchRate.value ?? 0) * 100).toFixed(1)}%`
            : `Insufficient data — ${input.reconciliationMatchRate.missingDataReason}`,
        ],
        ["Unresolved exceptions", String(input.unresolvedExceptionCount)],
        [
          "By severity",
          `Critical: ${input.exceptionSeverityCounts.critical}, High: ${input.exceptionSeverityCounts.high}, Medium: ${input.exceptionSeverityCounts.medium}, Low: ${input.exceptionSeverityCounts.low}`,
        ],
        [
          "Data completeness",
          input.dataCompleteness.status === "ok"
            ? `${((input.dataCompleteness.value ?? 0) * 100).toFixed(1)}%`
            : `Insufficient data — ${input.dataCompleteness.missingDataReason}`,
        ],
        [
          "Data freshness",
          input.dataFreshnessAgeMinutes === null ? "Insufficient data" : `${input.dataFreshnessAgeMinutes} minutes old`,
        ],
      ],
    },
    {
      kind: "table",
      sectionId: "top_three_recommendations",
      title: "Top Three Operational Recommendations",
      headers: ["Rank", "Priority", "Title", "Owner"],
      rows: input.topThreeRecommendations.map((r) => [String(r.rank), r.priority, r.title, r.ownerRole]),
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
        "Inventory reconciliation follows: beginning + receipts + transfers_in - transfers_out - distributed - " +
        "waste_or_spoilage + approved_adjustments = ending_inventory (calculations.ts:inventoryBalanceCheck). " +
        "A commodity with no recorded transactions for this period is shown as insufficient data rather than " +
        "assumed zero. This report is decision support only and does not constitute a submission-ready " +
        "government or TEFAP filing — see the TEFAP Draft Review Packet template for that workflow.",
    },
  ];

  return {
    reportId: input.reportId,
    version: input.version,
    templateId: "monthly_operations_reconciliation",
    title: "Monthly Operations and Reconciliation Report",
    organizationName: input.organizationName,
    siteProgramLabel: input.siteProgramLabel,
    periodLabel: `${input.periodStart} to ${input.periodEnd}`,
    generatedAt: input.generatedAt,
    dataAsOfTimestamp: input.dataAsOfTimestamp,
    status: input.status,
    watermark: input.status === "draft" ? "DRAFT — STAFF REVIEW REQUIRED" : null,
    sections,
    dataQuality,
  };
}

// Template metadata for all 6 report types the spec defines. Only
// distribution_readiness_brief and monthly_operations_reconciliation have a
// full builder + PDF pipeline implemented (see distributionReadinessBrief.ts,
// monthlyOperationsReconciliation.ts) — the other four are registered here
// as a documented contract for whoever builds them next, per the "REPORT
// TEMPLATE MAPPING" spec section (required_fields/sections/etc. per template).

import { ReportTemplateId } from "../types";

export interface ReportTemplateMeta {
  templateId: ReportTemplateId;
  title: string;
  purpose: string;
  maxPages: string;
  implemented: boolean;
  requiredFields: string[];
}

export const REPORT_TEMPLATES: Record<ReportTemplateId, ReportTemplateMeta> = {
  distribution_readiness_brief: {
    templateId: "distribution_readiness_brief",
    title: "Distribution Readiness Brief",
    purpose: "Internal daily or weekly operational brief for the next distribution.",
    maxPages: "2-4",
    implemented: true,
    requiredFields: [
      "organization.organizationName",
      "distribution.nextDistributionDate",
      "readiness.status",
      "readiness.explanation",
      "recommendations.topThree",
    ],
  },
  monthly_operations_reconciliation: {
    templateId: "monthly_operations_reconciliation",
    title: "Monthly Operations and Reconciliation Report",
    purpose: "Internal operational and management report.",
    maxPages: "5-10",
    implemented: true,
    requiredFields: [
      "organization.organizationName",
      "reportingPeriod.start",
      "reportingPeriod.end",
      "inventory.commodityBalances",
      "reconciliation.matchRate",
    ],
  },
  board_impact_report: {
    templateId: "board_impact_report",
    title: "Board Impact Report",
    purpose: "Board, donor, partner, and leadership impact summary.",
    maxPages: "2-6",
    implemented: false,
    requiredFields: ["organization.organizationName", "reportingPeriod.start", "reportingPeriod.end"],
  },
  grant_progress_report: {
    templateId: "grant_progress_report",
    title: "Grant Progress Report",
    purpose: "Draft a funder-ready progress report based on a customer-provided prompt, template, or question set.",
    maxPages: "not specified",
    implemented: false,
    requiredFields: ["grant.funderName", "grant.reportingPeriod", "grant.goals", "grant.programOrSite"],
  },
  tefap_draft_review_packet: {
    templateId: "tefap_draft_review_packet",
    title: "TEFAP Draft Review Packet",
    purpose: "Staff-review and data-completeness packet for TEFAP-related reporting. Not submission-ready without an approved local template.",
    maxPages: "not specified",
    implemented: false,
    requiredFields: ["organization.organizationName", "reportingPeriod.start", "reportingPeriod.end"],
  },
  network_partner_allocation_report: {
    templateId: "network_partner_allocation_report",
    title: "Network Partner Allocation Report",
    purpose: "Operational report for food banks distributing inventory to partner agencies.",
    maxPages: "not specified",
    implemented: false,
    requiredFields: ["organization.organizationName", "reportingPeriod.start", "reportingPeriod.end"],
  },
};

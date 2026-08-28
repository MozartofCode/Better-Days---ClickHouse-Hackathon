// Deterministic recommendation ranking. Pure functions: candidates in,
// exactly-three ranked Recommendations out. No DB access, no LLM call.
//
// This is the hand-off boundary described in the spec: "Calculate these
// values deterministically in the backend before passing them to the AI."
// Every field here is built from real evidence (exceptions, near-expiry
// lots, volunteer gaps, category shortfalls) — nothing is invented. Text
// fields (title/recommendedAction/whyNow) are template-generated from that
// evidence now; a future LLM integration can replace the templating with
// generated prose, but must keep reading from the same candidate evidence
// and must never receive raw unreconciled data (per "AI INTELLIGENCE
// REQUIREMENTS": the AI receives only aggregated/reconciled summaries).

import { CalculatedMetric, NearExpiryLot } from "./calculations";
import { DetectedException } from "./exceptions";
import { ExceptionSeverity, VolunteerShift } from "./types";

export type RecommendationType =
  | "distribution_readiness"
  | "near_expiry_waste_prevention"
  | "reconciliation_data_quality"
  | "volunteer_execution_readiness"
  | "demand_allocation_procurement";

// Matches the spec's 5-tier priority order exactly:
// 1 food-safety/failure/severe-shortage, 2 near-expiry/waste,
// 3 material reconciliation problem, 4 volunteer/execution, 5 demand/procurement.
type PriorityOrderCategory = 1 | 2 | 3 | 4 | 5;

export type PriorityBadge = "Critical" | "High" | "Medium";
export type Confidence = "High" | "Medium" | "Low";

export interface RecommendationEvidenceItem {
  description: string;
  sourceReferences: string[];
}

export interface Recommendation {
  rank: 1 | 2 | 3;
  priority: PriorityBadge;
  recommendationType: RecommendationType;
  title: string;
  recommendedAction: string;
  ownerRole: string;
  dueBy: string | null;
  whyNow: string;
  evidence: RecommendationEvidenceItem[];
  estimatedImpact: string;
  confidence: Confidence;
  confidenceRationale: string;
  assumptionsAndLimits: string[];
  humanReviewRequired: true;
  suggestedFollowUpQuestion: string;
}

export interface RecommendationCandidate {
  priorityOrderCategory: PriorityOrderCategory;
  severity: ExceptionSeverity | null;
  recommendationType: RecommendationType;
  title: string;
  recommendedAction: string;
  ownerRole: string;
  dueBy: string | null;
  whyNow: string;
  evidence: RecommendationEvidenceItem[];
  estimatedImpact: string;
  confidence: Confidence;
  confidenceRationale: string;
  assumptionsAndLimits: string[];
  suggestedFollowUpQuestion: string;
}

function priorityBadge(candidate: RecommendationCandidate): PriorityBadge {
  if (candidate.severity === "critical" || candidate.priorityOrderCategory === 1) return "Critical";
  if (candidate.severity === "high" || candidate.priorityOrderCategory <= 3) return "High";
  return "Medium";
}

const SEVERITY_WEIGHT: Record<ExceptionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

// Exactly three, ranked by (priority order category asc, severity desc).
// If fewer than three real candidates exist, returns fewer — this module
// never invents a recommendation to pad the count to three.
export function rankTopRecommendations(candidates: RecommendationCandidate[]): Recommendation[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.priorityOrderCategory !== b.priorityOrderCategory) {
      return a.priorityOrderCategory - b.priorityOrderCategory;
    }
    const aWeight = a.severity ? SEVERITY_WEIGHT[a.severity] : 0;
    const bWeight = b.severity ? SEVERITY_WEIGHT[b.severity] : 0;
    return bWeight - aWeight;
  });

  return sorted.slice(0, 3).map((candidate, index) => ({
    rank: (index + 1) as 1 | 2 | 3,
    priority: priorityBadge(candidate),
    recommendationType: candidate.recommendationType,
    title: candidate.title,
    recommendedAction: candidate.recommendedAction,
    ownerRole: candidate.ownerRole,
    dueBy: candidate.dueBy,
    whyNow: candidate.whyNow,
    evidence: candidate.evidence,
    estimatedImpact: candidate.estimatedImpact,
    confidence: candidate.confidence,
    confidenceRationale: candidate.confidenceRationale,
    assumptionsAndLimits: candidate.assumptionsAndLimits,
    humanReviewRequired: true,
    suggestedFollowUpQuestion: candidate.suggestedFollowUpQuestion,
  }));
}

// ---- Candidate builders — one per recommendation_type ----

const CRITICAL_READINESS_TYPES = new Set(["negative_inventory", "missing_receiving_record"]);

export function buildDistributionReadinessCandidates(
  exceptions: DetectedException[],
  plannedHouseholds: number | null
): RecommendationCandidate[] {
  return exceptions
    .filter((e) => CRITICAL_READINESS_TYPES.has(e.exceptionType))
    .map((e) => ({
      priorityOrderCategory: 1 as const,
      severity: e.severity,
      recommendationType: "distribution_readiness" as const,
      title: `Resolve ${e.exceptionType.replace(/_/g, " ")} before the next distribution`,
      recommendedAction: e.explanation,
      ownerRole: "Warehouse Lead",
      dueBy: null,
      whyNow: e.explanation,
      evidence: [{ description: e.explanation, sourceReferences: e.sourceReferences ?? [] }],
      estimatedImpact: plannedHouseholds
        ? `May affect the planned allocation for ${plannedHouseholds} households.`
        : "Household impact not calculable — planned households not recorded for the next distribution.",
      confidence: e.severity === "critical" ? "High" : "Medium",
      confidenceRationale: `Based on ${(e.sourceReferences ?? []).length} source reference(s) and reconciliation exception severity "${e.severity}".`,
      assumptionsAndLimits: ["Assumes affected inventory quantity is accurate as of last import."],
      suggestedFollowUpQuestion: "Show the records behind this recommendation.",
    }));
}

export function buildNearExpiryCandidates(nearExpiryLots: NearExpiryLot[]): RecommendationCandidate[] {
  if (nearExpiryLots.length === 0) return [];
  const totalQty = nearExpiryLots.reduce((sum, n) => sum + n.lot.quantityOnHand, 0);
  const soonest = nearExpiryLots[0];

  return [
    {
      priorityOrderCategory: 2,
      severity: soonest.daysToExpiry <= 3 ? "high" : "medium",
      recommendationType: "near_expiry_waste_prevention",
      title: `Prioritize distribution of ${nearExpiryLots.length} near-expiry lot(s)`,
      recommendedAction: `Move ${totalQty} ${soonest.lot.unitOfMeasure} across ${nearExpiryLots.length} lot(s) to the front of the distribution plan; the soonest expires in ${soonest.daysToExpiry} day(s).`,
      ownerRole: "Warehouse Lead",
      dueBy: soonest.daysToExpiry <= 3 ? "Before next distribution" : null,
      whyNow: `${nearExpiryLots.length} lot(s) totaling ${totalQty} ${soonest.lot.unitOfMeasure} are within the near-expiry window.`,
      evidence: nearExpiryLots.map((n) => ({
        description: `Lot ${n.lot.lotNumber ?? n.lot.inventoryLotId}: ${n.lot.quantityOnHand} ${n.lot.unitOfMeasure}, expires in ${n.daysToExpiry} day(s).`,
        sourceReferences: n.lot.sourceReference ? [n.lot.sourceReference] : [],
      })),
      estimatedImpact: `Protects ${totalQty} ${soonest.lot.unitOfMeasure} from becoming waste.`,
      confidence: "High",
      confidenceRationale: "Directly computed from recorded expiry dates and on-hand quantities.",
      assumptionsAndLimits: ["Assumes expiry_date reflects the physical product's actual shelf life."],
      suggestedFollowUpQuestion: "Which sites hold the near-expiry inventory?",
    },
  ];
}

export function buildReconciliationCandidates(exceptions: DetectedException[]): RecommendationCandidate[] {
  const material = exceptions.filter((e) => e.severity === "critical" || e.severity === "high");
  if (material.length === 0) return [];

  return [
    {
      priorityOrderCategory: 3,
      severity: material.some((e) => e.severity === "critical") ? "critical" : "high",
      recommendationType: "reconciliation_data_quality",
      title: `Review ${material.length} unresolved reconciliation exception(s)`,
      recommendedAction: "Assign an owner to each unresolved high-severity exception and confirm affected quantities before they are reported.",
      ownerRole: "Data Coordinator",
      dueBy: null,
      whyNow: `${material.length} exception(s) at critical/high severity remain unresolved and may change a reported total.`,
      evidence: material.map((e) => ({ description: e.explanation, sourceReferences: e.sourceReferences ?? [] })),
      estimatedImpact: "May materially change reported inventory, distribution, or reconciliation figures.",
      confidence: "Medium",
      confidenceRationale: `Materiality not scored per-exception yet; ranked by severity across ${material.length} exception(s).`,
      assumptionsAndLimits: ["Materiality scoring is not yet implemented — severity is used as a proxy."],
      suggestedFollowUpQuestion: "Show the exception queue filtered to high severity.",
    },
  ];
}

export function buildVolunteerCandidates(
  shiftsWithGaps: Array<{ shift: VolunteerShift; gap: CalculatedMetric<number> }>
): RecommendationCandidate[] {
  const gapped = shiftsWithGaps.filter((s) => s.gap.status === "ok" && (s.gap.value ?? 0) > 0);
  if (gapped.length === 0) return [];

  const totalGap = gapped.reduce((sum, s) => sum + (s.gap.value ?? 0), 0);

  return [
    {
      priorityOrderCategory: 4,
      severity: "high",
      recommendationType: "volunteer_execution_readiness",
      title: `Fill ${totalGap} volunteer shift gap(s) before the next distribution`,
      recommendedAction: `Recruit or reassign ${totalGap} volunteer(s) across ${gapped.length} shift(s) with confirmed staffing below the required count.`,
      ownerRole: "Distribution Manager",
      dueBy: "Before shift start",
      whyNow: `${gapped.length} shift(s) are short a combined ${totalGap} volunteer(s) against the required count.`,
      evidence: gapped.map((s) => ({
        description: `Shift ${s.shift.shiftId} (${s.shift.role ?? "unspecified role"}): ${s.shift.confirmedCount}/${s.shift.requiredCount} confirmed.`,
        sourceReferences: s.shift.sourceReference ? [s.shift.sourceReference] : [],
      })),
      estimatedImpact: "Understaffed shifts risk slower service or reduced distribution capacity.",
      confidence: "High",
      confidenceRationale: "Directly computed from required vs. confirmed volunteer counts.",
      assumptionsAndLimits: ["Assumes confirmed_count reflects current sign-ups, not historical averages."],
      suggestedFollowUpQuestion: "Which shifts have the largest gaps?",
    },
  ];
}

export function buildDemandAllocationCandidates(
  shortfallByCategory: Map<string, number>
): RecommendationCandidate[] {
  const shortfalls = [...shortfallByCategory.entries()].filter(([, delta]) => delta < 0);
  if (shortfalls.length === 0) return [];

  shortfalls.sort((a, b) => a[1] - b[1]);
  const [worstCategory, worstDelta] = shortfalls[0];

  return [
    {
      priorityOrderCategory: 5,
      severity: "medium",
      recommendationType: "demand_allocation_procurement",
      title: `Address projected shortfall in ${worstCategory}`,
      recommendedAction: `Source or reallocate ${Math.abs(worstDelta)} additional unit(s) of ${worstCategory} to meet planned requirement.`,
      ownerRole: "Program Manager",
      dueBy: null,
      whyNow: `Confirmed coverage for ${worstCategory} is ${Math.abs(worstDelta)} unit(s) below the planned requirement.`,
      evidence: shortfalls.map(([category, delta]) => ({
        description: `${category}: ${delta < 0 ? `${Math.abs(delta)} short` : `${delta} surplus`}.`,
        sourceReferences: [],
      })),
      estimatedImpact: `Planned distribution for ${worstCategory} may need to be revised or substituted.`,
      confidence: "Medium",
      confidenceRationale: "Based on confirmed inventory coverage vs. planned requirement by category.",
      assumptionsAndLimits: ["Assumes planned requirement figures are current for the next distribution."],
      suggestedFollowUpQuestion: "What substitute items are available for this category?",
    },
  ];
}

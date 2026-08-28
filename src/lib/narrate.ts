// Narrative layer. Turns already-computed results into prose only.
// Receives computed numbers, never raw rows. Never asserts a cause as fact.
// No AI service is wired into this build, so every function here is the
// static-template fallback the spec requires — the app must stay fully
// usable with the AI layer unavailable, and here it always is.

import type { Variance, QualityException } from "./schema";

const CAUSE_HINTS: Record<string, string[]> = {
  short: [
    "unrecorded distributions",
    "a miscount during the physical inventory",
    "spoilage that wasn't logged",
    "a receiving entry that was missed",
  ],
  over: [
    "a distribution that wasn't recorded",
    "a duplicate receiving entry",
    "stock counted twice",
  ],
  impossible: [
    "a data entry error in one of the beginning, received, distributed, or loss figures",
    "a unit mismatch (pounds vs. cases) in the source file",
  ],
};

export function draftCauseExplanation(v: Variance): string {
  if (v.varianceLb === null || v.direction === "balanced" || v.direction === "no-count") {
    return "No variance to explain — this commodity balanced within the threshold.";
  }
  const qty = Math.abs(v.varianceLb).toFixed(1);
  const hints = CAUSE_HINTS[v.direction] ?? CAUSE_HINTS.short;
  const causeText = hints.slice(0, 2).join(" or ");
  const verb = v.direction === "over" ? "more on hand than expected" : "short of the expected amount";

  return (
    `${v.commodity} came in ${qty} lb ${verb}, a ${v.variancePct ?? "?"}% variance. ` +
    `This is consistent with ${causeText}, and should be checked against site records before sign-off. ` +
    `The cause has not been confirmed and this discrepancy is not resolved.`
  );
}

export interface ReportAggregates {
  unduplicatedHouseholds: number;
  totalHouseholds: number;
  totalVisits: number;
  tefapVisits: number;
  tefapPct: number;
  totalPoundsLb: number;
  flaggedVarianceCount: number;
  reconciledCount: number;
  errorCount: number;
  warnCount: number;
}

export function draftReportNarrative(agg: ReportAggregates): string {
  const sentences: string[] = [];
  sentences.push(
    `This period covered ${agg.totalVisits} visit${agg.totalVisits === 1 ? "" : "s"} across ${agg.unduplicatedHouseholds} unique household${agg.unduplicatedHouseholds === 1 ? "" : "s"}, distributing ${Math.round(agg.totalPoundsLb).toLocaleString()} lb of food.`
  );
  if (agg.flaggedVarianceCount > 0) {
    sentences.push(
      `${agg.flaggedVarianceCount} of ${agg.reconciledCount} reconciled commodities showed a variance above threshold and are drafted for supervisor review.`
    );
  } else if (agg.reconciledCount > 0) {
    sentences.push(`All ${agg.reconciledCount} reconciled commodities balanced within threshold.`);
  }
  if (agg.errorCount > 0) {
    sentences.push(
      `${agg.errorCount} data-quality error${agg.errorCount === 1 ? "" : "s"} were found and should be resolved before this report is finalized; treat totals as provisional until they are.`
    );
  } else if (agg.warnCount > 0) {
    sentences.push(`${agg.warnCount} minor data-quality warning${agg.warnCount === 1 ? "" : "s"} were noted but don't block reporting.`);
  } else {
    sentences.push("No data-quality issues were found in the uploaded files.");
  }
  return sentences.join(" ");
}

export function severityLabel(exceptions: QualityException[]): { errors: number; warns: number } {
  const errors = exceptions.filter((e) => e.severity === "error").reduce((n, e) => n + e.count, 0);
  const warns = exceptions.filter((e) => e.severity === "warn").reduce((n, e) => n + e.count, 0);
  return { errors, warns };
}

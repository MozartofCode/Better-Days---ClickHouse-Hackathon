// Pure function. Every data-quality check that feeds the Data Quality tab.

import type { Contract, QualityException } from "../schema";
import { findDuplicates } from "./dedupe";

export function runChecks(contract: Contract): QualityException[] {
  const exceptions: QualityException[] = [];
  const { dateRange } = contract.meta;
  const householdIds = new Set(contract.households.map((h) => h.id));

  // Duplicate households
  const clusters = findDuplicates(contract.households);
  if (clusters.length > 0) {
    exceptions.push({
      severity: "warn",
      type: "DUPLICATE_HOUSEHOLD",
      message: `${clusters.length} possible duplicate household ${clusters.length === 1 ? "record" : "records"} found (similar name and address).`,
      affectedRows: clusters.flatMap((c) => c.members.map((m) => ({ sourceFile: m.sourceFile, sourceRow: m.sourceRow }))),
      count: clusters.length,
    });
  }

  // Dates outside stated reporting period
  if (dateRange.start && dateRange.end) {
    const outOfRange = contract.visits.filter((v) => v.date && (v.date < dateRange.start! || v.date > dateRange.end!));
    if (outOfRange.length > 0) {
      exceptions.push({
        severity: "error",
        type: "DATE_OUT_OF_RANGE",
        message: `${outOfRange.length} visit${outOfRange.length === 1 ? "" : "s"} fall outside the reporting period.`,
        affectedRows: outOfRange.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow })),
        count: outOfRange.length,
      });
    }
  }

  // Invalid / missing dates
  const badDates = contract.visits.filter((v) => !v.date);
  if (badDates.length > 0) {
    exceptions.push({
      severity: "error",
      type: "INVALID_DATE",
      message: `${badDates.length} visit${badDates.length === 1 ? "" : "s"} ${badDates.length === 1 ? "has" : "have"} a missing or unreadable date.`,
      affectedRows: badDates.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow })),
      count: badDates.length,
    });
  }

  // Negative or zero quantities
  const invalidQty = contract.visits.filter((v) => v.poundsLb !== null && v.poundsLb <= 0);
  if (invalidQty.length > 0) {
    exceptions.push({
      severity: "error",
      type: "INVALID_QUANTITY",
      message: `${invalidQty.length} visit${invalidQty.length === 1 ? "" : "s"} ${invalidQty.length === 1 ? "has" : "have"} zero or negative pounds recorded.`,
      affectedRows: invalidQty.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow })),
      count: invalidQty.length,
    });
  }

  // Missing household size on TEFAP visits
  const missingSize = contract.visits.filter((v) => v.program === "TEFAP" && v.householdSize === null);
  if (missingSize.length > 0) {
    exceptions.push({
      severity: "error",
      type: "MISSING_HOUSEHOLD_SIZE",
      message: `${missingSize.length} TEFAP visit${missingSize.length === 1 ? "" : "s"} ${missingSize.length === 1 ? "is" : "are"} missing the required household size.`,
      affectedRows: missingSize.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow })),
      count: missingSize.length,
    });
  }

  // Orphan visits: householdId present but not found among known households
  const orphans = contract.visits.filter(
    (v) => v.householdId && householdIds.size > 0 && !householdIds.has(v.householdId)
  );
  if (orphans.length > 0) {
    exceptions.push({
      severity: "error",
      type: "ORPHAN_VISIT",
      message: `${orphans.length} visit${orphans.length === 1 ? "" : "s"} ${orphans.length === 1 ? "references" : "reference"} a household that isn't in your household file.`,
      affectedRows: orphans.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow })),
      count: orphans.length,
    });
  }

  // Missing physical count
  const missingCount = contract.inventory.filter((i) => i.physicalCountLb === null);
  if (missingCount.length > 0) {
    exceptions.push({
      severity: "warn",
      type: "MISSING_PHYSICAL_COUNT",
      message: `${missingCount.length} inventory item${missingCount.length === 1 ? "" : "s"} ${missingCount.length === 1 ? "has" : "have"} no physical count, so reconciliation was skipped for ${missingCount.length === 1 ? "it" : "them"}.`,
      affectedRows: missingCount.flatMap((i) => i.sourceRows.map((r) => ({ sourceFile: i.sourceFile, sourceRow: r }))),
      count: missingCount.length,
    });
  }

  // Impossible inventory (negative expected ending)
  const impossible = contract.inventory.filter((i) => {
    const expected = i.beginningLb + i.receivedLb - i.distributedLb - i.transferredLb - i.documentedLossLb;
    return expected < 0;
  });
  if (impossible.length > 0) {
    exceptions.push({
      severity: "error",
      type: "IMPOSSIBLE_INVENTORY",
      message: `${impossible.length} commodit${impossible.length === 1 ? "y adds" : "ies add"} up to less than zero pounds expected — the numbers going in don't add up.`,
      affectedRows: impossible.flatMap((i) => i.sourceRows.map((r) => ({ sourceFile: i.sourceFile, sourceRow: r }))),
      count: impossible.length,
    });
  }

  const severityOrder: Record<string, number> = { error: 0, warn: 1 };
  return exceptions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

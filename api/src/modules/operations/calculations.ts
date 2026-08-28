// Deterministic calculation engine. Pure functions only — no DB access, no
// network calls, no LLM calls. Every number the dashboard or a report shows
// must trace back to a function in this file (or a plain DB read), never to
// a model's guess.
//
// Convention: any calculation whose inputs can be legitimately absent
// returns a CalculatedMetric<T> instead of a bare number, so "we don't know"
// is always distinguishable from "the answer is zero." A metric is only
// `insufficient_data` when its required input is missing/null — an empty
// array that legitimately has zero matching rows (e.g. zero unresolved
// exceptions) is a real zero, not missing data, and is returned as a plain
// number.

import {
  InventoryLot,
  InventoryTransaction,
  ReconciliationException,
  ExceptionSeverity,
  VolunteerShift,
} from "./types";

export interface CalculatedMetric<T> {
  value: T | null;
  status: "ok" | "insufficient_data";
  missingDataReason: string | null;
}

function ok<T>(value: T): CalculatedMetric<T> {
  return { value, status: "ok", missingDataReason: null };
}

function insufficientData<T>(reason: string): CalculatedMetric<T> {
  return { value: null, status: "insufficient_data", missingDataReason: reason };
}

// usable_quantity = quantity_on_hand - quantity_reserved - quantity_damaged - quantity_disposed
// Always computable: the four inputs default to 0 at the schema level, so
// this is never "insufficient data," just plain arithmetic.
export function usableQuantity(lot: Pick<InventoryLot, "quantityOnHand" | "quantityReserved" | "quantityDamaged" | "quantityDisposed">): number {
  return lot.quantityOnHand - lot.quantityReserved - lot.quantityDamaged - lot.quantityDisposed;
}

export interface InventoryBalanceCheck {
  beginningInventory: number;
  receipts: number;
  transfersIn: number;
  transfersOut: number;
  distributed: number;
  wasteOrSpoilage: number;
  approvedAdjustments: number;
  expectedEndingInventory: number;
  actualEndingInventory: number;
  varianceQuantity: number;
  matched: boolean;
}

const OPENING_TYPES = new Set(["opening_balance"]);
const RECEIPT_TYPES = new Set(["receipt", "donation_return"]);
const TRANSFER_IN_TYPES = new Set(["transfer_in"]);
const TRANSFER_OUT_TYPES = new Set(["transfer_out"]);
const DISTRIBUTED_TYPES = new Set(["distribution"]);
const WASTE_TYPES = new Set(["waste", "spoilage"]);
const ADJUSTMENT_TYPES = new Set(["adjustment", "correction"]);

// inventory_balance_check:
// beginning + receipts + transfers_in - transfers_out - distributed
//   - waste_or_spoilage + approved_adjustments = ending_inventory
//
// `transactions` must already be filtered to one item + one site + the
// reporting period; `actualEndingInventory` is the physically-counted
// usable_quantity for that same item/site as of period end.
export function inventoryBalanceCheck(
  transactions: InventoryTransaction[],
  actualEndingInventory: number | null
): CalculatedMetric<InventoryBalanceCheck> {
  if (transactions.length === 0) {
    return insufficientData("No inventory transactions recorded for this item/site/period.");
  }
  if (actualEndingInventory === null) {
    return insufficientData("No physical count (inventory lot) available to compare against.");
  }

  const sumOf = (types: Set<string>) =>
    transactions.filter((t) => types.has(t.transactionType)).reduce((sum, t) => sum + t.quantity, 0);

  const beginningInventory = sumOf(OPENING_TYPES);
  const receipts = sumOf(RECEIPT_TYPES);
  const transfersIn = sumOf(TRANSFER_IN_TYPES);
  const transfersOut = sumOf(TRANSFER_OUT_TYPES);
  const distributed = sumOf(DISTRIBUTED_TYPES);
  const wasteOrSpoilage = sumOf(WASTE_TYPES);
  const approvedAdjustments = sumOf(ADJUSTMENT_TYPES);

  const expectedEndingInventory =
    beginningInventory + receipts + transfersIn - transfersOut - distributed - wasteOrSpoilage + approvedAdjustments;
  const varianceQuantity = expectedEndingInventory - actualEndingInventory;

  return ok({
    beginningInventory,
    receipts,
    transfersIn,
    transfersOut,
    distributed,
    wasteOrSpoilage,
    approvedAdjustments,
    expectedEndingInventory,
    actualEndingInventory,
    varianceQuantity,
    matched: varianceQuantity === 0,
  });
}

// distribution_fulfillment_rate = actual / planned.
// Only calculated when the denominator is present and > 0.
export function distributionFulfillmentRate(
  actualQuantityDistributed: number | null,
  plannedQuantityRequired: number | null
): CalculatedMetric<number> {
  if (plannedQuantityRequired === null) {
    return insufficientData("Planned quantity required is not recorded.");
  }
  if (plannedQuantityRequired <= 0) {
    return insufficientData("Planned quantity required must be greater than zero to compute a rate.");
  }
  if (actualQuantityDistributed === null) {
    return insufficientData("Actual quantity distributed is not recorded.");
  }
  return ok(actualQuantityDistributed / plannedQuantityRequired);
}

// days_of_coverage = usable_quantity / average_daily_distribution_rate.
// average_daily_distribution_rate must come from real distribution history
// (e.g. mean of DistributionLine.quantityDistributed / days in period) —
// callers compute that upstream since it requires a date range this module
// doesn't own. A rate of 0 means "nothing has gone out" which is a
// legitimate zero denominator collapse, not missing data — coverage is then
// undefined (infinite), so we say insufficient_data with a clear reason
// rather than returning Infinity.
export function daysOfCoverage(
  usableQty: number,
  averageDailyDistributionRate: number | null
): CalculatedMetric<number> {
  if (averageDailyDistributionRate === null) {
    return insufficientData("No distribution history available to compute an average daily rate.");
  }
  if (averageDailyDistributionRate <= 0) {
    return insufficientData("Average daily distribution rate is zero; days of coverage is undefined.");
  }
  return ok(usableQty / averageDailyDistributionRate);
}

export interface NearExpiryLot {
  lot: InventoryLot;
  daysToExpiry: number;
}

// Lots with expiry_date within `withinDays` of `asOf`. Lots with no
// expiry_date are never included here — that's a MISSING_EXPIRY_DATE
// reconciliation exception (see exceptions.ts), not a near-expiry risk.
export function findNearExpiryLots(
  lots: InventoryLot[],
  asOf: Date,
  withinDays: number
): NearExpiryLot[] {
  // Calendar-day difference, not raw ms/86400000 — expiry_date has no time
  // component, so comparing it against a specific asOf instant (e.g.
  // 11:30am) must not let the time-of-day truncate a day off the count.
  const asOfMidnightMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const results: NearExpiryLot[] = [];
  for (const lot of lots) {
    if (!lot.expiryDate) continue;
    const expiryMs = Date.parse(lot.expiryDate);
    if (Number.isNaN(expiryMs)) continue;
    const daysToExpiry = Math.round((expiryMs - asOfMidnightMs) / (24 * 60 * 60 * 1000));
    if (daysToExpiry <= withinDays) {
      results.push({ lot, daysToExpiry });
    }
  }
  return results.sort((a, b) => a.daysToExpiry - b.daysToExpiry);
}

// shortfall_surplus = confirmed_coverage - planned_requirement, per category.
// Positive = surplus, negative = shortfall. Categories present in
// `requirementByCategory` but absent from `coverageByCategory` are treated
// as zero coverage (a real, known zero — the requirement says we need it and
// nothing is confirmed) rather than insufficient data. A category with no
// recorded requirement at all is skipped: there's nothing to compare against.
export function shortfallSurplusByCategory(
  coverageByCategory: Map<string, number>,
  requirementByCategory: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  for (const [category, requirement] of requirementByCategory) {
    const coverage = coverageByCategory.get(category) ?? 0;
    result.set(category, coverage - requirement);
  }
  return result;
}

// reconciliation_match_rate = reconciled records / total records with a
// determinable status. Records still `insufficient_data` themselves are
// excluded from the denominator — they haven't been evaluated yet, so
// counting them as "not reconciled" would understate the rate unfairly.
export function reconciliationMatchRate(
  records: { reconciliationStatus: string }[]
): CalculatedMetric<number> {
  const evaluable = records.filter((r) => r.reconciliationStatus !== "insufficient_data");
  if (evaluable.length === 0) {
    return insufficientData("No records have been evaluated for reconciliation yet.");
  }
  const reconciled = evaluable.filter((r) => r.reconciliationStatus === "reconciled").length;
  return ok(reconciled / evaluable.length);
}

// data_completeness = fields present / fields required, across all records.
// `requiredFieldGetters` extracts each required field's value from a record;
// a field counts as present if it is not null/undefined/"".
export function dataCompleteness<T>(
  records: T[],
  requiredFieldGetters: Array<(record: T) => unknown>
): CalculatedMetric<number> {
  if (records.length === 0) {
    return insufficientData("No records available to assess completeness.");
  }
  if (requiredFieldGetters.length === 0) {
    return insufficientData("No required fields configured for this record type.");
  }
  let present = 0;
  let total = 0;
  for (const record of records) {
    for (const getter of requiredFieldGetters) {
      total += 1;
      const value = getter(record);
      if (value !== null && value !== undefined && value !== "") present += 1;
    }
  }
  return ok(present / total);
}

export interface DataFreshness {
  mostRecentTimestamp: string;
  ageMinutes: number;
}

// data_freshness = time since the most recent of a set of timestamps
// (e.g. every source's data_freshness_timestamp / last_verified_at).
export function dataFreshness(timestamps: Array<string | null>, now: Date): CalculatedMetric<DataFreshness> {
  const parsed = timestamps
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t))
    .filter((ms) => !Number.isNaN(ms));

  if (parsed.length === 0) {
    return insufficientData("No source timestamps recorded.");
  }

  const mostRecentMs = Math.max(...parsed);
  return ok({
    mostRecentTimestamp: new Date(mostRecentMs).toISOString(),
    ageMinutes: Math.max(0, Math.round((now.getTime() - mostRecentMs) / 60000)),
  });
}

// A real, always-computable zero-or-more count — not wrapped in
// CalculatedMetric, since an empty exceptions array is a genuine "zero
// unresolved exceptions," not missing data.
export function unresolvedExceptionCount(exceptions: ReconciliationException[]): number {
  return exceptions.filter((e) => e.status !== "resolved" && e.status !== "not_applicable").length;
}

export function exceptionSeverityCounts(
  exceptions: ReconciliationException[]
): Record<ExceptionSeverity, number> {
  const counts: Record<ExceptionSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const exception of exceptions) {
    if (exception.status === "resolved" || exception.status === "not_applicable") continue;
    counts[exception.severity] += 1;
  }
  return counts;
}

// volunteer_gap = required_count - confirmed_count. Insufficient data if
// either side of the shift's staffing plan isn't recorded — a gap can't be
// judged from a shift with only one side filled in.
export function volunteerGap(shift: VolunteerShift): CalculatedMetric<number> {
  if (shift.requiredCount === null) {
    return insufficientData("Shift has no required staffing count recorded.");
  }
  if (shift.confirmedCount === null) {
    return insufficientData("Shift has no confirmed staffing count recorded.");
  }
  return ok(shift.requiredCount - shift.confirmedCount);
}

// month_over_month_delta = current - previous, plus percent change.
// Requires both periods to have real (non-null) values — the spec allows
// this comparison "if historical data is sufficient," and one missing side
// means it isn't.
export interface PeriodDelta {
  absoluteDelta: number;
  percentDelta: number | null;
}

export function monthOverMonthDelta(
  current: number | null,
  previous: number | null
): CalculatedMetric<PeriodDelta> {
  if (current === null || previous === null) {
    return insufficientData("Both the current and prior period must have a recorded value to compare.");
  }
  return ok({
    absoluteDelta: current - previous,
    percentDelta: previous === 0 ? null : (current - previous) / previous,
  });
}

// Forecasting is explicitly out of scope until a real historical
// time-series model exists (spec: "Forecast values, only when sufficient
// history exists"). This stub makes that boundary explicit rather than
// silently omitting forecast support.
export function forecastValue(_historicalSeries: number[]): CalculatedMetric<number> {
  return insufficientData(
    "Forecasting is not yet implemented — requires a validated historical time-series model."
  );
}

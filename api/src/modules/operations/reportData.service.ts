// Builds real ReportDocument input from live data for one food bank.
//
// Both distribution/transaction data sources now exist (manual entry via
// operations.service.ts's createDistributionEvent/createInventoryTransaction/
// createVolunteerShift — see README "Round 4"). Both report templates still
// legitimately hit a BLOCKING data-quality issue when that data hasn't been
// entered yet: distribution_readiness_brief needs at least one
// DistributionEvent to know a next-distribution date, and
// monthly_operations_reconciliation needs at least one item with both
// InventoryTransaction history and a physical count (InventoryLot) in the
// reporting period. That's correct behavior, not a bug — the spec requires
// refusing to generate rather than inventing a distribution date or a
// beginning/ending balance that was never recorded. Callers can pass
// forceIncomplete to get a watermarked incomplete draft anyway.

import {
  getFoodBankProfile,
  listInventoryLots,
  listItems,
  listDistributionEvents,
  listInventoryTransactions,
  listVolunteerShifts,
  DistributionEventWithLines,
} from "./operations.service";
import { getOperationsDashboard } from "./dashboardData.service";
import {
  findNearExpiryLots,
  inventoryBalanceCheck,
  reconciliationMatchRate,
  dataCompleteness,
  volunteerGap,
  usableQuantity,
  shortfallSurplusByCategory,
} from "./calculations";
import { InventoryLot, ExceptionSeverity, VolunteerShift } from "./types";
import {
  buildDistributionReadinessBrief,
  DistributionReadinessBriefInput,
} from "./reports/distributionReadinessBrief";
import {
  buildMonthlyOperationsReconciliation,
  MonthlyOperationsReconciliationInput,
} from "./reports/monthlyOperationsReconciliation";

// Prefers the soonest upcoming (non-cancelled) event; falls back to the
// most recently past one so a brief generated the day after a distribution
// still has something concrete to report against, rather than nothing.
function pickRelevantDistributionEvent(
  events: DistributionEventWithLines[],
  now: Date
): DistributionEventWithLines | null {
  const active = events.filter((e) => e.eventStatus !== "cancelled");
  const todayStr = now.toISOString().slice(0, 10);
  const upcoming = active
    .filter((e) => e.distributionDate >= todayStr)
    .sort((a, b) => a.distributionDate.localeCompare(b.distributionDate));
  if (upcoming.length > 0) return upcoming[0];
  // `events` (and therefore `active`) is already ordered by distribution_date
  // DESC from listDistributionEvents, so the first remaining entry is the
  // most recent past one.
  return active[0] ?? null;
}

export async function buildDistributionReadinessBriefFromLiveData(
  foodBankId: string,
  reportId: string,
  version: number
) {
  const [org, dashboard, events, shifts, lots, items] = await Promise.all([
    getFoodBankProfile(foodBankId),
    getOperationsDashboard(foodBankId),
    listDistributionEvents(foodBankId),
    listVolunteerShifts(foodBankId),
    listInventoryLots(foodBankId),
    listItems(foodBankId),
  ]);
  const now = new Date();
  const event = pickRelevantDistributionEvent(events, now);

  const itemCategoryById = new Map(items.map((i) => [i.itemId, i.itemCategory ?? "Uncategorized"]));

  // Requirement = this event's planned distribution quantities, by item
  // category. Coverage = current usable on-hand quantity at the same site,
  // restricted to categories the event actually plans to distribute — a
  // category the event doesn't need says nothing about readiness for it.
  const requirementByCategory = new Map<string, number>();
  if (event) {
    for (const line of event.lines) {
      if (line.quantityPlanned === null) continue;
      const category = itemCategoryById.get(line.itemId) ?? "Uncategorized";
      requirementByCategory.set(category, (requirementByCategory.get(category) ?? 0) + line.quantityPlanned);
    }
  }
  const coverageByCategory = new Map<string, number>();
  for (const lot of lots) {
    if (event && lot.siteId !== event.siteId) continue;
    const category = itemCategoryById.get(lot.itemId) ?? "Uncategorized";
    if (!requirementByCategory.has(category)) continue;
    coverageByCategory.set(category, (coverageByCategory.get(category) ?? 0) + usableQuantity(lot));
  }
  const shortfallByCategory = shortfallSurplusByCategory(coverageByCategory, requirementByCategory);

  // Volunteer gap: sum of (required - confirmed) across shifts at the
  // event's site on the event's date, counting only shifts where both sides
  // of the staffing plan were actually recorded (calculations.ts:
  // volunteerGap returns insufficient_data otherwise, and we don't average
  // in an unknown as if it were zero).
  let volunteerGapCount: number | null = null;
  if (event) {
    const sameDayShifts = shifts.filter(
      (s: VolunteerShift) => s.siteId === event.siteId && s.shiftStart.slice(0, 10) === event.distributionDate
    );
    const gaps = sameDayShifts
      .map((s) => volunteerGap(s))
      .filter((g) => g.status === "ok")
      .map((g) => g.value as number);
    if (gaps.length > 0) volunteerGapCount = gaps.reduce((a, b) => a + b, 0);
  }

  const input: DistributionReadinessBriefInput = {
    reportId,
    version,
    organizationName: org.organizationName,
    siteProgramLabel: "All Sites",
    generatedAt: now.toISOString(),
    dataAsOfTimestamp: dashboard.asOf,
    status: "draft",
    nextDistributionDate: event?.distributionDate ?? null,
    nextDistributionTime: event?.startTime ?? null,
    plannedHouseholds: event?.plannedHouseholds ?? null,
    plannedBoxes: event?.plannedBoxes ?? null,
    readinessStatus: dashboard.readiness.status,
    readinessExplanation: dashboard.readiness.explanation,
    coverageByCategory,
    requirementByCategory,
    shortfallByCategory,
    nearExpiryLots: findNearExpiryLots(lots, now, 7),
    readinessAffectingExceptions: dashboard.exceptions.map((e) => ({
      organizationId: e.organizationId,
      siteId: e.siteId,
      programId: e.programId,
      exceptionType: e.exceptionType,
      severity: e.severity,
      affectedItemId: e.affectedItemId,
      affectedInventoryLotId: e.affectedInventoryLotId,
      affectedDistributionEventId: e.affectedDistributionEventId,
      affectedQuantity: e.affectedQuantity,
      unitOfMeasure: e.unitOfMeasure,
      affectedWeightLbs: e.affectedWeightLbs,
      sourceSystems: e.sourceSystems,
      sourceReferences: e.sourceReferences,
      explanation: e.explanation,
      likelyCauses: e.likelyCauses,
      materialityScore: e.materialityScore,
    })),
    volunteerGapCount,
    topThreeRecommendations: dashboard.topThreeRecommendations,
  };

  return buildDistributionReadinessBrief(input);
}

export async function buildMonthlyOperationsReconciliationFromLiveData(
  foodBankId: string,
  reportId: string,
  version: number,
  periodStart: string,
  periodEnd: string
) {
  const [org, items, transactions, lots, dashboard] = await Promise.all([
    getFoodBankProfile(foodBankId),
    listItems(foodBankId),
    listInventoryTransactions(foodBankId),
    listInventoryLots(foodBankId),
    getOperationsDashboard(foodBankId),
  ]);
  const now = new Date();

  const periodStartMs = Date.parse(periodStart);
  const periodEndMs = Date.parse(periodEnd) + 24 * 60 * 60 * 1000 - 1; // inclusive of the end date
  const inPeriod = (transactionDate: string) => {
    const ms = Date.parse(transactionDate);
    return !Number.isNaN(ms) && ms >= periodStartMs && ms <= periodEndMs;
  };

  const lotsByItem = new Map<string, InventoryLot[]>();
  for (const lot of lots) {
    const arr = lotsByItem.get(lot.itemId) ?? [];
    arr.push(lot);
    lotsByItem.set(lot.itemId, arr);
  }

  // Per commodity (item): reconcile this period's transactions against the
  // item's current usable on-hand quantity (its physical count). An item
  // with no lots at all has no physical count to compare against, so its
  // balance is insufficient_data rather than an assumed zero.
  const commodityBalances = items.map((item) => {
    const itemTransactions = transactions.filter((t) => t.itemId === item.itemId && inPeriod(t.transactionDate));
    const itemLots = lotsByItem.get(item.itemId);
    const actualEndingInventory = itemLots ? itemLots.reduce((sum, lot) => sum + usableQuantity(lot), 0) : null;
    return {
      category: item.canonicalItemName,
      balance: inventoryBalanceCheck(itemTransactions, actualEndingInventory),
    };
  });

  const periodTransactions = transactions.filter((t) => inPeriod(t.transactionDate));
  const periodDistributions = periodTransactions.filter((t) => t.transactionType === "distribution" && t.weightLbs !== null);
  const poundsDistributed =
    periodDistributions.length > 0 ? periodDistributions.reduce((sum, t) => sum + (t.weightLbs as number), 0) : null;

  const input: MonthlyOperationsReconciliationInput = {
    reportId,
    version,
    organizationName: org.organizationName,
    siteProgramLabel: "All Sites — All Programs",
    generatedAt: now.toISOString(),
    dataAsOfTimestamp: now.toISOString(),
    status: "draft",
    periodStart,
    periodEnd,
    householdsServed: null, // no HouseholdServiceAggregate data exists yet
    visits: null,
    poundsDistributed,
    commodityBalances,
    reconciliationMatchRate: reconciliationMatchRate(periodTransactions),
    exceptionSeverityCounts: dashboard.metrics.exceptionSeverityCounts as Record<ExceptionSeverity, number>,
    unresolvedExceptionCount: dashboard.metrics.unresolvedExceptionCount,
    dataCompleteness: dataCompleteness(items, [(i) => i.canonicalItemName, (i) => i.itemCategory]),
    dataFreshnessAgeMinutes: dashboard.metrics.dataFreshnessAgeMinutes,
    monthOverMonthAvailable: false,
    topThreeRecommendations: dashboard.topThreeRecommendations,
  };

  return buildMonthlyOperationsReconciliation(input);
}

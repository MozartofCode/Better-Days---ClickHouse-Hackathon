// Generates real PDFs for both implemented report templates from fixture
// data (extends the same spec worked-example used by verify-operations.ts)
// and asserts basic structural correctness. No DB required.

import assert from "assert";
import fs from "fs";
import {
  findNearExpiryLots,
  volunteerGap,
  shortfallSurplusByCategory,
  inventoryBalanceCheck,
  reconciliationMatchRate,
  dataCompleteness,
} from "../modules/operations/calculations";
import { detectMissingReceivingRecords } from "../modules/operations/exceptions";
import {
  buildDistributionReadinessCandidates,
  buildNearExpiryCandidates,
  buildVolunteerCandidates,
  buildDemandAllocationCandidates,
  rankTopRecommendations,
} from "../modules/operations/recommendations";
import { InventoryLot, InventoryTransaction, VolunteerShift } from "../modules/operations/types";
import { buildDistributionReadinessBrief } from "../modules/operations/reports/distributionReadinessBrief";
import { buildMonthlyOperationsReconciliation } from "../modules/operations/reports/monthlyOperationsReconciliation";
import { generateReport } from "../modules/operations/reports/generateReport";

const AS_OF = new Date("2026-06-14T11:30:00Z");
const SITE_ID = "site-main";

const produceLot: InventoryLot = {
  inventoryLotId: "lot-produce-1",
  itemId: "item-produce",
  siteId: SITE_ID,
  sourceType: "receiving_sheet",
  donorOrVendorId: null,
  lotNumber: "L-2026-0614",
  receivedDate: "2026-06-14",
  expiryDate: "2026-06-20",
  storageLocation: "Cooler A",
  quantityOnHand: 14,
  quantityReserved: 0,
  quantityDamaged: 0,
  quantityDisposed: 0,
  unitOfMeasure: "cases",
  weightLbs: null,
  temperatureStatus: null,
  foodSafetyStatus: null,
  reconciliationStatus: "unreconciled",
  lastVerifiedAt: AS_OF.toISOString(),
  sourceReference: "receiving_june14.xlsx:row12",
};

const yogurtLot: InventoryLot = {
  ...produceLot,
  inventoryLotId: "lot-yogurt-1",
  itemId: "item-yogurt",
  lotNumber: "L-2026-0610",
  expiryDate: "2026-06-17",
  quantityOnHand: 38,
  reconciliationStatus: "reconciled",
  sourceReference: "inventory_june14.xlsx:row40",
};

const shifts: VolunteerShift[] = [
  {
    shiftId: "shift-1",
    siteId: SITE_ID,
    programId: null,
    shiftStart: "2026-06-15T07:00:00Z",
    shiftEnd: "2026-06-15T10:00:00Z",
    role: "Box packing",
    requiredCount: 6,
    confirmedCount: 4,
    checkedInCount: null,
    sourceReference: "volunteer_schedule.xlsx:row5",
  },
];

async function main() {
  const receivingExceptions = detectMissingReceivingRecords([produceLot], []);
  const nearExpiry = findNearExpiryLots([yogurtLot], AS_OF, 7);
  const shiftsWithGaps = shifts.map((shift) => ({ shift, gap: volunteerGap(shift) }));
  const shortfall = shortfallSurplusByCategory(new Map([["Produce", 96]]), new Map([["Produce", 120]]));
  const requirement = new Map([["Produce", 120]]);
  const coverage = new Map([["Produce", 96]]);

  const candidates = [
    ...buildDistributionReadinessCandidates(receivingExceptions, 120),
    ...buildNearExpiryCandidates(nearExpiry),
    ...buildVolunteerCandidates(shiftsWithGaps),
    ...buildDemandAllocationCandidates(shortfall),
  ];
  const topThree = rankTopRecommendations(candidates);

  // --- Distribution Readiness Brief ---
  const brief = buildDistributionReadinessBrief({
    reportId: "rpt-drb-001",
    version: 1,
    organizationName: "Community Pantry",
    siteProgramLabel: "Main Site — TEFAP",
    generatedAt: AS_OF.toISOString(),
    dataAsOfTimestamp: AS_OF.toISOString(),
    status: "draft",
    nextDistributionDate: "2026-06-15",
    nextDistributionTime: "09:00",
    plannedHouseholds: 120,
    plannedBoxes: 120,
    readinessStatus: "red",
    readinessExplanation:
      "Produce availability is below tomorrow's planned requirement, and one unresolved receiving discrepancy may affect the final distribution plan.",
    coverageByCategory: coverage,
    requirementByCategory: requirement,
    shortfallByCategory: shortfall,
    nearExpiryLots: nearExpiry,
    readinessAffectingExceptions: receivingExceptions,
    volunteerGapCount: shiftsWithGaps[0].gap.value,
    topThreeRecommendations: topThree,
  });

  assert.strictEqual(brief.dataQuality.hasBlockingIssues, false, "brief should not be blocked");
  assert.strictEqual(brief.watermark, "DRAFT — STAFF REVIEW REQUIRED");
  console.log("PASS: distribution readiness brief built, not blocked, DRAFT watermark set");

  const briefResult = await generateReport(brief, { periodStart: "2026-06-15", periodEnd: "2026-06-15" });
  assert.strictEqual(briefResult.status, "generated");
  assert.ok(briefResult.filePath && fs.existsSync(briefResult.filePath));
  const briefBytes = fs.readFileSync(briefResult.filePath as string);
  assert.ok(briefBytes.subarray(0, 5).toString() === "%PDF-", "output should be a real PDF");
  assert.ok(briefBytes.length > 1000, "PDF should have real content, not an empty shell");
  console.log(`PASS: distribution_readiness_brief.pdf generated (${briefBytes.length} bytes) at ${briefResult.filePath}`);
  assert.strictEqual(
    briefResult.filename,
    "community_pantry_distribution_readiness_brief_2026-06-15_2026-06-15_v1.pdf"
  );
  console.log("PASS: filename matches spec's {org}_{template}_{start}_{end}_v{version}.pdf format");

  // --- Monthly Operations and Reconciliation Report ---
  // USDA-worked-example-shaped fixture: 2000 beginning + 5000 received -
  // 4200 distributed - 400 transferred - 15 spoilage = 2385 expected;
  // physical count 2100 -> 285 lb variance (matches the pantry-mvp spec's
  // own USDA worked example).
  const transactions: InventoryTransaction[] = [
    { transactionId: "t1", transactionType: "opening_balance", transactionDate: "2026-06-01T00:00:00Z", itemId: "item-chicken", inventoryLotId: null, siteId: SITE_ID, programId: null, quantity: 2000, unitOfMeasure: "lb", weightLbs: 2000, sourceType: null, sourceReference: "inv.xlsx", importedAt: AS_OF.toISOString(), reconciliationStatus: "reconciled", createdBy: null, notes: null },
    { transactionId: "t2", transactionType: "receipt", transactionDate: "2026-06-05T00:00:00Z", itemId: "item-chicken", inventoryLotId: null, siteId: SITE_ID, programId: null, quantity: 5000, unitOfMeasure: "lb", weightLbs: 5000, sourceType: null, sourceReference: "inv.xlsx", importedAt: AS_OF.toISOString(), reconciliationStatus: "reconciled", createdBy: null, notes: null },
    { transactionId: "t3", transactionType: "distribution", transactionDate: "2026-06-20T00:00:00Z", itemId: "item-chicken", inventoryLotId: null, siteId: SITE_ID, programId: null, quantity: 4200, unitOfMeasure: "lb", weightLbs: 4200, sourceType: null, sourceReference: "inv.xlsx", importedAt: AS_OF.toISOString(), reconciliationStatus: "reconciled", createdBy: null, notes: null },
    { transactionId: "t4", transactionType: "transfer_out", transactionDate: "2026-06-22T00:00:00Z", itemId: "item-chicken", inventoryLotId: null, siteId: SITE_ID, programId: null, quantity: 400, unitOfMeasure: "lb", weightLbs: 400, sourceType: null, sourceReference: "inv.xlsx", importedAt: AS_OF.toISOString(), reconciliationStatus: "reconciled", createdBy: null, notes: null },
    { transactionId: "t5", transactionType: "spoilage", transactionDate: "2026-06-25T00:00:00Z", itemId: "item-chicken", inventoryLotId: null, siteId: SITE_ID, programId: null, quantity: 15, unitOfMeasure: "lb", weightLbs: 15, sourceType: null, sourceReference: "inv.xlsx", importedAt: AS_OF.toISOString(), reconciliationStatus: "reconciled", createdBy: null, notes: null },
  ];

  const chickenBalance = inventoryBalanceCheck(transactions, 2100);
  assert.strictEqual(chickenBalance.status, "ok");
  assert.strictEqual(chickenBalance.value?.expectedEndingInventory, 2385);
  assert.strictEqual(chickenBalance.value?.varianceQuantity, 285);
  console.log("PASS: inventoryBalanceCheck reproduces the USDA worked example (285 lb variance)");

  const matchRate = reconciliationMatchRate(transactions);
  const completeness = dataCompleteness(transactions, [(t) => t.quantity, (t) => t.transactionDate]);

  const monthly = buildMonthlyOperationsReconciliation({
    reportId: "rpt-mor-001",
    version: 1,
    organizationName: "Community Pantry",
    siteProgramLabel: "All Sites — All Programs",
    generatedAt: AS_OF.toISOString(),
    dataAsOfTimestamp: AS_OF.toISOString(),
    status: "draft",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    householdsServed: 412,
    visits: 530,
    poundsDistributed: 4200,
    commodityBalances: [{ category: "Frozen Chicken", balance: chickenBalance }],
    reconciliationMatchRate: matchRate,
    exceptionSeverityCounts: { critical: 0, high: 1, medium: 2, low: 3 },
    unresolvedExceptionCount: 6,
    dataCompleteness: completeness,
    dataFreshnessAgeMinutes: 45,
    monthOverMonthAvailable: false,
    topThreeRecommendations: topThree,
  });

  assert.strictEqual(monthly.dataQuality.hasBlockingIssues, false, "monthly report should not be blocked");
  console.log("PASS: monthly operations reconciliation report built, not blocked");

  const monthlyResult = await generateReport(monthly, { periodStart: "2026-06-01", periodEnd: "2026-06-30" });
  assert.strictEqual(monthlyResult.status, "generated");
  const monthlyBytes = fs.readFileSync(monthlyResult.filePath as string);
  assert.ok(monthlyBytes.subarray(0, 5).toString() === "%PDF-");
  console.log(
    `PASS: monthly_operations_reconciliation.pdf generated (${monthlyBytes.length} bytes) at ${monthlyResult.filePath}`
  );

  // --- Blocking-issue path: no organization name, no period ---
  const blockedReport = buildMonthlyOperationsReconciliation({
    reportId: "rpt-mor-blocked",
    version: 1,
    organizationName: "",
    siteProgramLabel: "",
    generatedAt: AS_OF.toISOString(),
    dataAsOfTimestamp: null,
    status: "draft",
    periodStart: "",
    periodEnd: "",
    householdsServed: null,
    visits: null,
    poundsDistributed: null,
    commodityBalances: [],
    reconciliationMatchRate: matchRate,
    exceptionSeverityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
    unresolvedExceptionCount: 0,
    dataCompleteness: completeness,
    dataFreshnessAgeMinutes: null,
    monthOverMonthAvailable: false,
    topThreeRecommendations: [],
  });
  assert.strictEqual(blockedReport.dataQuality.hasBlockingIssues, true);
  const blockedResult = await generateReport(blockedReport, { periodStart: "unknown", periodEnd: "unknown" });
  assert.strictEqual(blockedResult.status, "blocked", "report with blocking issues must not generate a normal PDF");
  console.log("PASS: report with blocking data-quality issues is correctly blocked, no PDF written");

  console.log("\nAll report-generation checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

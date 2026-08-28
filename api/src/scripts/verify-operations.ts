// Sanity check for the operations calc/exception/recommendation engine
// (api/src/modules/operations/). Reproduces the spec's own worked example
// from "SAMPLE DASHBOARD CONTENT" and asserts the modules reproduce it —
// no DB, no server, pure-function only. Run with `npm run verify:operations`.
//
// There is no test framework wired into this project yet (no jest/vitest);
// this follows the existing convention of small ts-node scripts (see
// ingest:calich etc. in package.json) rather than adding a new dependency.

import assert from "assert";
import {
  usableQuantity,
  findNearExpiryLots,
  volunteerGap,
  shortfallSurplusByCategory,
} from "../modules/operations/calculations";
import {
  detectMissingReceivingRecords,
  detectNegativeInventory,
} from "../modules/operations/exceptions";
import {
  buildDistributionReadinessCandidates,
  buildNearExpiryCandidates,
  buildVolunteerCandidates,
  buildDemandAllocationCandidates,
  rankTopRecommendations,
} from "../modules/operations/recommendations";
import { InventoryLot, VolunteerShift } from "../modules/operations/types";

const SITE_ID = "site-main";
const AS_OF = new Date("2026-06-14T11:30:00Z");

// --- Fixture: produce lot with an unresolved receiving discrepancy ---
// "Unresolved receiving discrepancy: 14 produce cases"
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

// no matching 'receipt' transaction exists for produceLot -> missing_receiving_record
const receivingExceptions = detectMissingReceivingRecords([produceLot], []);
assert.strictEqual(receivingExceptions.length, 1, "expected exactly one missing-receiving-record exception");
assert.strictEqual(receivingExceptions[0].exceptionType, "missing_receiving_record");
assert.strictEqual(receivingExceptions[0].affectedQuantity, 14);
console.log("PASS: missing_receiving_record detected for 14 produce cases");

// --- Fixture: yogurt lot expiring in 3 days ---
// "Near-expiry yogurt: 38 cases, 3 days to expiry"
const yogurtLot: InventoryLot = {
  inventoryLotId: "lot-yogurt-1",
  itemId: "item-yogurt",
  siteId: SITE_ID,
  sourceType: "receiving_sheet",
  donorOrVendorId: null,
  lotNumber: "L-2026-0610",
  receivedDate: "2026-06-10",
  expiryDate: "2026-06-17", // 3 days after AS_OF (2026-06-14)
  storageLocation: "Cooler B",
  quantityOnHand: 38,
  quantityReserved: 0,
  quantityDamaged: 0,
  quantityDisposed: 0,
  unitOfMeasure: "cases",
  weightLbs: null,
  temperatureStatus: null,
  foodSafetyStatus: null,
  reconciliationStatus: "reconciled",
  lastVerifiedAt: AS_OF.toISOString(),
  sourceReference: "inventory_june14.xlsx:row40",
};

const nearExpiry = findNearExpiryLots([yogurtLot], AS_OF, 7);
assert.strictEqual(nearExpiry.length, 1);
assert.strictEqual(nearExpiry[0].daysToExpiry, 3, "expected yogurt to be 3 days from expiry");
assert.strictEqual(nearExpiry[0].lot.quantityOnHand, 38);
console.log("PASS: near-expiry yogurt detected at 38 cases, 3 days to expiry");

assert.strictEqual(usableQuantity(produceLot), 14);
assert.strictEqual(detectNegativeInventory([produceLot, yogurtLot]).length, 0, "no negative inventory expected");
console.log("PASS: usable_quantity and negative-inventory check on fixture lots");

// --- Fixture: two box-packing shifts, one short two volunteers ---
// "Volunteer gap: 2 people"
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

const shiftsWithGaps = shifts.map((shift) => ({ shift, gap: volunteerGap(shift) }));
assert.strictEqual(shiftsWithGaps[0].gap.status, "ok");
assert.strictEqual(shiftsWithGaps[0].gap.value, 2, "expected a gap of 2 volunteers");
console.log("PASS: volunteer_gap computed as 2");

// --- Shortfall by category: produce coverage 96 vs requirement 120 -> -24 ---
const shortfall = shortfallSurplusByCategory(
  new Map([["Produce", 96]]),
  new Map([["Produce", 120]])
);
assert.strictEqual(shortfall.get("Produce"), -24, "expected a 24-unit produce shortfall");
console.log("PASS: produce shortfall computed as -24 (96 confirmed vs 120 planned)");

// --- Recommendation ranking should reproduce the spec's exact top three ---
const candidates = [
  ...buildDistributionReadinessCandidates(receivingExceptions, 120),
  ...buildNearExpiryCandidates(nearExpiry),
  ...buildVolunteerCandidates(shiftsWithGaps),
  ...buildDemandAllocationCandidates(shortfall),
];

const top3 = rankTopRecommendations(candidates);
assert.strictEqual(top3.length, 3, "expected exactly three recommendations");
assert.strictEqual(top3[0].recommendationType, "distribution_readiness");
assert.strictEqual(top3[0].priority, "Critical");
assert.strictEqual(top3[1].recommendationType, "near_expiry_waste_prevention");
assert.strictEqual(top3[2].recommendationType, "volunteer_execution_readiness");
console.log("PASS: top-3 recommendations match the spec's worked example ordering");
console.log(
  "  (produce shortfall candidate correctly bumped out of the top 3 by the volunteer gap, matching the spec's own example)"
);

console.log("\nAll operations engine checks passed.");

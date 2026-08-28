// Live smoke test for the Groq-based reasoning agent (requires GROQ_API_KEY
// to be set — not run as part of verify:operations, which is pure/offline).
// Reuses the same spec worked-example fixtures.

import {
  findNearExpiryLots,
  volunteerGap,
  shortfallSurplusByCategory,
} from "../modules/operations/calculations";
import { detectMissingReceivingRecords } from "../modules/operations/exceptions";
import {
  buildDistributionReadinessCandidates,
  buildNearExpiryCandidates,
  buildVolunteerCandidates,
  buildDemandAllocationCandidates,
  rankTopRecommendations,
} from "../modules/operations/recommendations";
import { narrateRecommendations } from "../modules/operations/reasoning/narrateRecommendations";
import { InventoryLot, VolunteerShift } from "../modules/operations/types";

const SITE_ID = "site-main";
const AS_OF = new Date("2026-06-14T11:30:00Z");

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
  inventoryLotId: "lot-yogurt-1",
  itemId: "item-yogurt",
  siteId: SITE_ID,
  sourceType: "receiving_sheet",
  donorOrVendorId: null,
  lotNumber: "L-2026-0610",
  receivedDate: "2026-06-10",
  expiryDate: "2026-06-17",
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

  const candidates = [
    ...buildDistributionReadinessCandidates(receivingExceptions, 120),
    ...buildNearExpiryCandidates(nearExpiry),
    ...buildVolunteerCandidates(shiftsWithGaps),
    ...buildDemandAllocationCandidates(shortfall),
  ];

  const templated = rankTopRecommendations(candidates);
  console.log("=== Template (deterministic) ===");
  for (const r of templated) {
    console.log(`[${r.priority}] ${r.title}\n  action: ${r.recommendedAction}\n  whyNow: ${r.whyNow}\n`);
  }

  const narrated = await narrateRecommendations(templated);
  console.log("=== Narrated (Groq) ===");
  for (const r of narrated) {
    console.log(`[${r.priority}] ${r.title}\n  action: ${r.recommendedAction}\n  whyNow: ${r.whyNow}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

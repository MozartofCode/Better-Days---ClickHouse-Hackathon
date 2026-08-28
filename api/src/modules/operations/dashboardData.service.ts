// Assembles the Operations Intelligence dashboard payload for one food bank:
// sync uploads -> read canonical entities -> run calculations.ts/exceptions.ts
// -> persist exceptions -> rank recommendations -> optionally narrate via Groq.
//
// Honest scope: only Item/InventoryLot data exists today (from the upload
// ETL — see etl.service.ts's header comment on why InventoryTransaction/
// DistributionEvent/VolunteerShift aren't populated). So "readiness" always
// reports unknown/insufficient-data rather than inventing a green/red status
// with no distribution event to base it on, and demand/volunteer
// recommendation candidates never fire. This is the correct behavior per the
// spec ("never substitute zero," "return insufficient data"), not a bug.

import { env } from "../../config/env";
import { syncUploadsIntoCanonicalSchema } from "./etl.service";
import { listItems, listInventoryLots } from "./operations.service";
import { listActiveExceptions, persistDetectedExceptions } from "./exceptionsPersistence.service";
import {
  findNearExpiryLots,
  dataFreshness,
  unresolvedExceptionCount as countUnresolved,
  exceptionSeverityCounts,
} from "./calculations";
import {
  detectMissingExpiryDates,
  detectMissingLotNumbers,
  detectNegativeInventory,
  detectStaleInventorySources,
  detectDuplicateInventoryItems,
} from "./exceptions";
import {
  buildDistributionReadinessCandidates,
  buildNearExpiryCandidates,
  rankTopRecommendations,
  Recommendation,
} from "./recommendations";
import { narrateRecommendations } from "./reasoning/narrateRecommendations";
import { ReconciliationException } from "./types";

const NEAR_EXPIRY_WINDOW_DAYS = 7;
const STALE_SOURCE_DAYS = 14;

export interface OperationsDashboard {
  asOf: string;
  dataStatus: "reconciled" | "partially_reconciled" | "unreconciled" | "insufficient_data";
  readiness: { status: "green" | "yellow" | "red" | "unknown"; explanation: string };
  metrics: {
    totalItems: number;
    totalInventoryLots: number;
    unresolvedExceptionCount: number;
    exceptionSeverityCounts: Record<string, number>;
    dataFreshnessAgeMinutes: number | null;
  };
  nearExpiry: Array<{ lotId: string; itemId: string; quantityOnHand: number; unit: string; daysToExpiry: number }>;
  exceptions: ReconciliationException[];
  topThreeRecommendations: Recommendation[];
  syncedUploads: number;
}

function toCriticalExceptionShape(exceptions: ReconciliationException[]) {
  // recommendations.ts's builders take the pre-persistence DetectedException
  // shape (no exceptionId/status). Active persisted exceptions carry the
  // same fields minus those two, so this is a narrowing, not a re-detection.
  return exceptions.map((e) => ({
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
  }));
}

export async function getOperationsDashboard(foodBankId: string): Promise<OperationsDashboard> {
  const asOf = new Date();
  const sync = await syncUploadsIntoCanonicalSchema(foodBankId);

  const [items, lots] = await Promise.all([listItems(foodBankId), listInventoryLots(foodBankId)]);

  const detected = [
    ...detectMissingExpiryDates(lots, items),
    ...detectMissingLotNumbers(lots),
    ...detectNegativeInventory(lots),
    ...detectStaleInventorySources(lots, asOf, STALE_SOURCE_DAYS),
    ...detectDuplicateInventoryItems(items),
  ].map((e) => ({ ...e, organizationId: foodBankId }));

  await persistDetectedExceptions(foodBankId, detected);
  const activeExceptions = await listActiveExceptions(foodBankId);

  const nearExpiry = findNearExpiryLots(lots, asOf, NEAR_EXPIRY_WINDOW_DAYS);

  const candidates = [
    ...buildDistributionReadinessCandidates(toCriticalExceptionShape(activeExceptions), null),
    ...buildNearExpiryCandidates(nearExpiry),
  ];
  let topThree = rankTopRecommendations(candidates);
  if (env.groq.apiKey && topThree.length > 0) {
    topThree = await narrateRecommendations(topThree);
  }

  const freshness = dataFreshness(
    lots.map((l) => l.lastVerifiedAt),
    asOf
  );

  const dataStatus: OperationsDashboard["dataStatus"] =
    lots.length === 0
      ? "insufficient_data"
      : activeExceptions.some((e) => e.severity === "critical" || e.severity === "high")
        ? "partially_reconciled"
        : "unreconciled";

  const readiness: OperationsDashboard["readiness"] =
    lots.length === 0
      ? { status: "unknown", explanation: "No inventory data uploaded yet." }
      : {
          status: "unknown",
          explanation:
            "No distribution events are recorded, so overall readiness cannot be assessed from inventory data alone. Inventory-level risks are shown below.",
        };

  return {
    asOf: asOf.toISOString(),
    dataStatus,
    readiness,
    metrics: {
      totalItems: items.length,
      totalInventoryLots: lots.length,
      unresolvedExceptionCount: countUnresolved(activeExceptions),
      exceptionSeverityCounts: exceptionSeverityCounts(activeExceptions),
      dataFreshnessAgeMinutes: freshness.status === "ok" ? (freshness.value?.ageMinutes ?? null) : null,
    },
    nearExpiry: nearExpiry.map((n) => ({
      lotId: n.lot.inventoryLotId,
      itemId: n.lot.itemId,
      quantityOnHand: n.lot.quantityOnHand,
      unit: n.lot.unitOfMeasure,
      daysToExpiry: n.daysToExpiry,
    })),
    exceptions: activeExceptions,
    topThreeRecommendations: topThree,
    syncedUploads: sync.uploadsSynced,
  };
}

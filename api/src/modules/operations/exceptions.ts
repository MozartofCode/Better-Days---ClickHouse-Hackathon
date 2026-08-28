// Reconciliation exception detectors. Pure functions: canonical entities in,
// DetectedException[] out. No DB access, no LLM. operations.service.ts is
// responsible for persisting these (assigning exceptionId/status/detectedAt)
// into reconciliation_exceptions.
//
// Every detector implements exactly one of the 13 exception_type values the
// schema's CHECK constraint allows (db/migrations/003_postgres_operations_schema.sql).

import { usableQuantity } from "./calculations";
import {
  DistributionLine,
  ExceptionSeverity,
  ExceptionType,
  Item,
  InventoryLot,
  InventoryTransaction,
  Site,
} from "./types";

export interface DetectedException {
  organizationId: string;
  siteId: string | null;
  programId: string | null;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  affectedItemId: string | null;
  affectedInventoryLotId: string | null;
  affectedDistributionEventId: string | null;
  affectedQuantity: number | null;
  unitOfMeasure: string | null;
  affectedWeightLbs: number | null;
  sourceSystems: string[] | null;
  sourceReferences: string[] | null;
  explanation: string;
  likelyCauses: string[] | null;
  materialityScore: number | null;
}

// MISSING_RECEIVING_RECORD: an inventory lot has stock on hand but no
// 'receipt' (or 'opening_balance') transaction backs it — the physical
// count exists without a documented source.
export function detectMissingReceivingRecords(
  lots: InventoryLot[],
  transactions: InventoryTransaction[]
): DetectedException[] {
  const lotsWithReceipt = new Set(
    transactions
      .filter((t) => t.transactionType === "receipt" || t.transactionType === "opening_balance")
      .map((t) => t.inventoryLotId)
      .filter((id): id is string => id !== null)
  );

  const results: DetectedException[] = [];
  for (const lot of lots) {
    if (lot.quantityOnHand > 0 && !lotsWithReceipt.has(lot.inventoryLotId)) {
      results.push({
        organizationId: "",
        siteId: lot.siteId,
        programId: null,
        exceptionType: "missing_receiving_record",
        severity: "high",
        affectedItemId: lot.itemId,
        affectedInventoryLotId: lot.inventoryLotId,
        affectedDistributionEventId: null,
        affectedQuantity: lot.quantityOnHand,
        unitOfMeasure: lot.unitOfMeasure,
        affectedWeightLbs: lot.weightLbs,
        sourceSystems: lot.sourceReference ? [lot.sourceReference] : null,
        sourceReferences: lot.sourceReference ? [lot.sourceReference] : null,
        explanation: `Inventory lot ${lot.lotNumber ?? lot.inventoryLotId} shows ${lot.quantityOnHand} ${lot.unitOfMeasure} on hand with no receiving transaction on record.`,
        likelyCauses: ["Receiving sheet not yet imported", "Receipt logged under a different lot/item"],
        materialityScore: null,
      });
    }
  }
  return results;
}

// INVENTORY_DISTRIBUTION_MISMATCH: a distribution line's quantity_distributed
// doesn't match the corresponding 'distribution' inventory transaction for
// the same lot.
export function detectInventoryDistributionMismatches(
  lines: DistributionLine[],
  transactions: InventoryTransaction[]
): DetectedException[] {
  const distributionByLot = new Map<string, number>();
  for (const t of transactions) {
    if (t.transactionType !== "distribution" || !t.inventoryLotId) continue;
    distributionByLot.set(t.inventoryLotId, (distributionByLot.get(t.inventoryLotId) ?? 0) + t.quantity);
  }

  const results: DetectedException[] = [];
  for (const line of lines) {
    if (line.quantityDistributed === null || !line.inventoryLotId) continue;
    const transactionQty = distributionByLot.get(line.inventoryLotId);
    if (transactionQty === undefined) continue;
    if (Math.abs(transactionQty - line.quantityDistributed) > 0.001) {
      results.push({
        organizationId: "",
        siteId: null,
        programId: null,
        exceptionType: "inventory_distribution_mismatch",
        severity: "high",
        affectedItemId: line.itemId,
        affectedInventoryLotId: line.inventoryLotId,
        affectedDistributionEventId: line.distributionEventId,
        affectedQuantity: Math.abs(transactionQty - line.quantityDistributed),
        unitOfMeasure: line.unitOfMeasure,
        affectedWeightLbs: line.weightLbs,
        sourceSystems: line.sourceReference ? [line.sourceReference] : null,
        sourceReferences: line.sourceReference ? [line.sourceReference] : null,
        explanation: `Distribution line records ${line.quantityDistributed} ${line.unitOfMeasure} distributed, but inventory transactions for the same lot total ${transactionQty} ${line.unitOfMeasure}.`,
        likelyCauses: ["Partial distribution not fully logged", "Duplicate or missing transaction entry"],
        materialityScore: null,
      });
    }
  }
  return results;
}

// UNIT_CONVERSION_MISMATCH: a transaction/line uses a unit of measure that
// differs from the item's canonical unit, and the item has no
// pounds_per_unit conversion factor recorded to reconcile them.
export function detectUnitConversionMismatches(
  transactions: InventoryTransaction[],
  items: Item[]
): DetectedException[] {
  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const results: DetectedException[] = [];

  for (const t of transactions) {
    const item = itemById.get(t.itemId);
    if (!item) continue;
    if (t.unitOfMeasure === item.unitOfMeasure) continue;
    if (item.poundsPerUnit !== null) continue; // a conversion factor exists — not an exception

    results.push({
      organizationId: "",
      siteId: t.siteId,
      programId: t.programId,
      exceptionType: "unit_conversion_mismatch",
      severity: "medium",
      affectedItemId: t.itemId,
      affectedInventoryLotId: t.inventoryLotId,
      affectedDistributionEventId: null,
      affectedQuantity: t.quantity,
      unitOfMeasure: t.unitOfMeasure,
      affectedWeightLbs: t.weightLbs,
      sourceSystems: t.sourceReference ? [t.sourceReference] : null,
      sourceReferences: t.sourceReference ? [t.sourceReference] : null,
      explanation: `Transaction for ${item.canonicalItemName} is recorded in ${t.unitOfMeasure}, but the item's canonical unit is ${item.unitOfMeasure} with no conversion factor on file.`,
      likelyCauses: ["Item is missing pounds_per_unit", "Source file used a different unit than expected"],
      materialityScore: null,
    });
  }
  return results;
}

// DUPLICATE_INVENTORY_ITEM: two Item rows in the same organization share a
// canonical name (case/whitespace-insensitive), suggesting they should be
// one item.
export function detectDuplicateInventoryItems(items: Item[]): DetectedException[] {
  const byName = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.canonicalItemName.trim().toLowerCase();
    const group = byName.get(key) ?? [];
    group.push(item);
    byName.set(key, group);
  }

  const results: DetectedException[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const item of group) {
      results.push({
        organizationId: item.organizationId,
        siteId: null,
        programId: null,
        exceptionType: "duplicate_inventory_item",
        severity: "low",
        affectedItemId: item.itemId,
        affectedInventoryLotId: null,
        affectedDistributionEventId: null,
        affectedQuantity: null,
        unitOfMeasure: null,
        affectedWeightLbs: null,
        sourceSystems: null,
        sourceReferences: group.map((i) => i.itemId),
        explanation: `"${item.canonicalItemName}" appears as ${group.length} separate item records.`,
        likelyCauses: ["Same item imported from two different source files without dedup"],
        materialityScore: null,
      });
    }
  }
  return results;
}

// UNMAPPED_ITEM: a transaction or distribution line references an item_id
// that has no matching Item record.
export function detectUnmappedItems(
  transactions: InventoryTransaction[],
  lines: DistributionLine[],
  items: Item[]
): DetectedException[] {
  const knownItemIds = new Set(items.map((i) => i.itemId));
  const results: DetectedException[] = [];

  for (const t of transactions) {
    if (knownItemIds.has(t.itemId)) continue;
    results.push({
      organizationId: "",
      siteId: t.siteId,
      programId: t.programId,
      exceptionType: "unmapped_item",
      severity: "high",
      affectedItemId: t.itemId,
      affectedInventoryLotId: t.inventoryLotId,
      affectedDistributionEventId: null,
      affectedQuantity: t.quantity,
      unitOfMeasure: t.unitOfMeasure,
      affectedWeightLbs: t.weightLbs,
      sourceSystems: t.sourceReference ? [t.sourceReference] : null,
      sourceReferences: t.sourceReference ? [t.sourceReference] : null,
      explanation: `Transaction references item_id ${t.itemId}, which has no canonical item record.`,
      likelyCauses: ["Item not yet created in the canonical schema", "Import mapped to the wrong item id"],
      materialityScore: null,
    });
  }

  for (const line of lines) {
    if (knownItemIds.has(line.itemId)) continue;
    results.push({
      organizationId: "",
      siteId: null,
      programId: null,
      exceptionType: "unmapped_item",
      severity: "high",
      affectedItemId: line.itemId,
      affectedInventoryLotId: line.inventoryLotId,
      affectedDistributionEventId: line.distributionEventId,
      affectedQuantity: line.quantityDistributed,
      unitOfMeasure: line.unitOfMeasure,
      affectedWeightLbs: line.weightLbs,
      sourceSystems: line.sourceReference ? [line.sourceReference] : null,
      sourceReferences: line.sourceReference ? [line.sourceReference] : null,
      explanation: `Distribution line references item_id ${line.itemId}, which has no canonical item record.`,
      likelyCauses: ["Item not yet created in the canonical schema", "Import mapped to the wrong item id"],
      materialityScore: null,
    });
  }

  return results;
}

// MISSING_EXPIRY_DATE: a perishable item's lot has no expiry_date.
export function detectMissingExpiryDates(lots: InventoryLot[], items: Item[]): DetectedException[] {
  const itemById = new Map(items.map((i) => [i.itemId, i]));
  const results: DetectedException[] = [];

  for (const lot of lots) {
    const item = itemById.get(lot.itemId);
    if (!item?.perishableFlag) continue;
    if (lot.expiryDate) continue;

    results.push({
      organizationId: item.organizationId,
      siteId: lot.siteId,
      programId: null,
      exceptionType: "missing_expiry_date",
      severity: "medium",
      affectedItemId: lot.itemId,
      affectedInventoryLotId: lot.inventoryLotId,
      affectedDistributionEventId: null,
      affectedQuantity: lot.quantityOnHand,
      unitOfMeasure: lot.unitOfMeasure,
      affectedWeightLbs: lot.weightLbs,
      sourceSystems: lot.sourceReference ? [lot.sourceReference] : null,
      sourceReferences: lot.sourceReference ? [lot.sourceReference] : null,
      explanation: `Lot ${lot.lotNumber ?? lot.inventoryLotId} of perishable item ${item.canonicalItemName} has no expiry date, so near-expiry/waste risk cannot be assessed.`,
      likelyCauses: ["Expiry date column not present in source file", "Field left blank at receiving"],
      materialityScore: null,
    });
  }
  return results;
}

// MISSING_LOT_NUMBER: an inventory lot has no lot_number for traceability.
export function detectMissingLotNumbers(lots: InventoryLot[]): DetectedException[] {
  return lots
    .filter((lot) => !lot.lotNumber)
    .map((lot) => ({
      organizationId: "",
      siteId: lot.siteId,
      programId: null,
      exceptionType: "missing_lot_number" as const,
      severity: "low" as const,
      affectedItemId: lot.itemId,
      affectedInventoryLotId: lot.inventoryLotId,
      affectedDistributionEventId: null,
      affectedQuantity: lot.quantityOnHand,
      unitOfMeasure: lot.unitOfMeasure,
      affectedWeightLbs: lot.weightLbs,
      sourceSystems: lot.sourceReference ? [lot.sourceReference] : null,
      sourceReferences: lot.sourceReference ? [lot.sourceReference] : null,
      explanation: `Inventory lot ${lot.inventoryLotId} has no lot number recorded, limiting traceability if a recall or audit requires it.`,
      likelyCauses: ["Lot number not tracked by source system", "Field left blank at receiving"],
      materialityScore: null,
    }));
}

// STALE_INVENTORY_SOURCE: a lot hasn't been verified within `staleDays`.
export function detectStaleInventorySources(
  lots: InventoryLot[],
  asOf: Date,
  staleDays: number
): DetectedException[] {
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  const results: DetectedException[] = [];

  for (const lot of lots) {
    if (!lot.lastVerifiedAt) {
      results.push({
        organizationId: "",
        siteId: lot.siteId,
        programId: null,
        exceptionType: "stale_inventory_source",
        severity: "medium",
        affectedItemId: lot.itemId,
        affectedInventoryLotId: lot.inventoryLotId,
        affectedDistributionEventId: null,
        affectedQuantity: lot.quantityOnHand,
        unitOfMeasure: lot.unitOfMeasure,
        affectedWeightLbs: lot.weightLbs,
        sourceSystems: null,
        sourceReferences: null,
        explanation: `Lot ${lot.inventoryLotId} has never been verified.`,
        likelyCauses: ["Never physically counted since import"],
        materialityScore: null,
      });
      continue;
    }
    const verifiedMs = Date.parse(lot.lastVerifiedAt);
    if (Number.isNaN(verifiedMs)) continue;
    if (asOf.getTime() - verifiedMs > staleMs) {
      const daysStale = Math.floor((asOf.getTime() - verifiedMs) / (24 * 60 * 60 * 1000));
      results.push({
        organizationId: "",
        siteId: lot.siteId,
        programId: null,
        exceptionType: "stale_inventory_source",
        severity: daysStale > staleDays * 2 ? "high" : "medium",
        affectedItemId: lot.itemId,
        affectedInventoryLotId: lot.inventoryLotId,
        affectedDistributionEventId: null,
        affectedQuantity: lot.quantityOnHand,
        unitOfMeasure: lot.unitOfMeasure,
        affectedWeightLbs: lot.weightLbs,
        sourceSystems: null,
        sourceReferences: null,
        explanation: `Lot ${lot.inventoryLotId} was last verified ${daysStale} days ago.`,
        likelyCauses: ["Physical count overdue"],
        materialityScore: null,
      });
    }
  }
  return results;
}

// UNCONFIRMED_OUTBOUND_DISTRIBUTION: a distribution line has a planned or
// distributed quantity but reconciliation_status never reached 'reconciled'.
export function detectUnconfirmedOutboundDistributions(lines: DistributionLine[]): DetectedException[] {
  return lines
    .filter(
      (line) =>
        (line.quantityDistributed !== null || line.quantityPlanned !== null) &&
        line.reconciliationStatus !== "reconciled"
    )
    .map((line) => ({
      organizationId: "",
      siteId: null,
      programId: null,
      exceptionType: "unconfirmed_outbound_distribution" as const,
      severity: "medium" as const,
      affectedItemId: line.itemId,
      affectedInventoryLotId: line.inventoryLotId,
      affectedDistributionEventId: line.distributionEventId,
      affectedQuantity: line.quantityDistributed ?? line.quantityPlanned,
      unitOfMeasure: line.unitOfMeasure,
      affectedWeightLbs: line.weightLbs,
      sourceSystems: line.sourceReference ? [line.sourceReference] : null,
      sourceReferences: line.sourceReference ? [line.sourceReference] : null,
      explanation: `Distribution line ${line.distributionLineId} has not been confirmed against source records (status: ${line.reconciliationStatus}).`,
      likelyCauses: ["Outbound scan/log not yet imported", "Reconciliation pending review"],
      materialityScore: null,
    }));
}

// NEGATIVE_INVENTORY: usable_quantity < 0 for a lot.
export function detectNegativeInventory(lots: InventoryLot[]): DetectedException[] {
  return lots
    .filter((lot) => usableQuantity(lot) < 0)
    .map((lot) => ({
      organizationId: "",
      siteId: lot.siteId,
      programId: null,
      exceptionType: "negative_inventory" as const,
      severity: "critical" as const,
      affectedItemId: lot.itemId,
      affectedInventoryLotId: lot.inventoryLotId,
      affectedDistributionEventId: null,
      affectedQuantity: usableQuantity(lot),
      unitOfMeasure: lot.unitOfMeasure,
      affectedWeightLbs: lot.weightLbs,
      sourceSystems: lot.sourceReference ? [lot.sourceReference] : null,
      sourceReferences: lot.sourceReference ? [lot.sourceReference] : null,
      explanation: `Lot ${lot.inventoryLotId} has a negative usable quantity of ${usableQuantity(lot)} ${lot.unitOfMeasure} — reserved, damaged, or disposed quantities exceed what was on hand.`,
      likelyCauses: ["Over-reservation or over-distribution relative to receipts", "Data entry error in on-hand quantity"],
      materialityScore: null,
    }));
}

// DUPLICATE_DISTRIBUTION_RECORD: two distribution lines share the same
// source_reference (same source row imported twice) for the same event/item.
export function detectDuplicateDistributionRecords(lines: DistributionLine[]): DetectedException[] {
  const bySourceRef = new Map<string, DistributionLine[]>();
  for (const line of lines) {
    if (!line.sourceReference) continue;
    const key = `${line.distributionEventId}::${line.itemId}::${line.sourceReference}`;
    const group = bySourceRef.get(key) ?? [];
    group.push(line);
    bySourceRef.set(key, group);
  }

  const results: DetectedException[] = [];
  for (const group of bySourceRef.values()) {
    if (group.length < 2) continue;
    for (const line of group) {
      results.push({
        organizationId: "",
        siteId: null,
        programId: null,
        exceptionType: "duplicate_distribution_record",
        severity: "medium",
        affectedItemId: line.itemId,
        affectedInventoryLotId: line.inventoryLotId,
        affectedDistributionEventId: line.distributionEventId,
        affectedQuantity: line.quantityDistributed,
        unitOfMeasure: line.unitOfMeasure,
        affectedWeightLbs: line.weightLbs,
        sourceSystems: null,
        sourceReferences: [line.sourceReference as string],
        explanation: `${group.length} distribution lines share source reference "${line.sourceReference}" for the same event and item.`,
        likelyCauses: ["Same source row imported more than once"],
        materialityScore: null,
      });
    }
  }
  return results;
}

// UNKNOWN_SITE_LOCATION: an ETL-time check — a raw site label from a source
// file doesn't match any known Site name for the organization. Runs before
// data has been assigned a real site_id, so it's the one detector that
// doesn't operate on already-typed canonical entities.
export function detectUnknownSiteLocations(rawSiteLabels: string[], knownSites: Site[]): DetectedException[] {
  const knownNames = new Set(knownSites.map((s) => s.siteName.trim().toLowerCase()));
  const seen = new Set<string>();
  const results: DetectedException[] = [];

  for (const label of rawSiteLabels) {
    const normalized = label.trim().toLowerCase();
    if (!normalized || knownNames.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({
      organizationId: knownSites[0]?.organizationId ?? "",
      siteId: null,
      programId: null,
      exceptionType: "unknown_site_location",
      severity: "medium",
      affectedItemId: null,
      affectedInventoryLotId: null,
      affectedDistributionEventId: null,
      affectedQuantity: null,
      unitOfMeasure: null,
      affectedWeightLbs: null,
      sourceSystems: null,
      sourceReferences: [label],
      explanation: `Source data references site "${label}", which does not match any known site.`,
      likelyCauses: ["New site not yet configured", "Site name typo or abbreviation in source file"],
      materialityScore: null,
    });
  }
  return results;
}

// DATA_NOT_MAPPED_TO_CANONICAL_SCHEMA: an ETL-time check — a source column
// wasn't matched to any canonical field during import.
export function detectUnmappedColumns(
  sourceColumns: string[],
  mappedCanonicalFields: Record<string, string | null>
): DetectedException[] {
  const mappedSourceColumns = new Set(Object.values(mappedCanonicalFields).filter((v): v is string => v !== null));
  const unmapped = sourceColumns.filter((c) => !mappedSourceColumns.has(c));

  return unmapped.map((column) => ({
    organizationId: "",
    siteId: null,
    programId: null,
    exceptionType: "data_not_mapped_to_canonical_schema" as const,
    severity: "low" as const,
    affectedItemId: null,
    affectedInventoryLotId: null,
    affectedDistributionEventId: null,
    affectedQuantity: null,
    unitOfMeasure: null,
    affectedWeightLbs: null,
    sourceSystems: null,
    sourceReferences: [column],
    explanation: `Source column "${column}" was not mapped to any canonical schema field.`,
    likelyCauses: ["Column not recognized by the field-mapping aliases", "Column is source-specific and has no canonical equivalent"],
    materialityScore: null,
  }));
}

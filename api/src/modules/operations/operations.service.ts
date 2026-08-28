import { pgPool } from "../../db/postgres";
import { HttpError } from "../../utils/http-error";
import {
  Organization,
  Site,
  Program,
  Item,
  InventoryLot,
  InventoryTransaction,
  InventoryTransactionType,
  DistributionEvent,
  DistributionLine,
  VolunteerShift,
} from "./types";

// pg returns DATE/TIMESTAMPTZ columns as JS Date objects by default (no
// custom type parsers configured in db/postgres.ts) — these normalize back
// to the plain strings every type in types.ts declares, regardless of
// whether the driver happens to hand back a Date or a string.
function toDateStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function toIsoStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function toOrganization(row: any): Organization {
  return {
    organizationId: row.id,
    organizationName: row.name,
    organizationType: row.organization_type,
    timezone: row.timezone,
    address: row.address,
    reportingCurrency: row.reporting_currency,
    primaryContact: row.primary_contact,
    activeStatus: row.active_status,
  };
}

function toSite(row: any): Site {
  return {
    siteId: row.site_id,
    organizationId: row.organization_id,
    siteName: row.site_name,
    siteType: row.site_type,
    address: row.address,
    operatingDays: row.operating_days,
    storageCapabilities: row.storage_capabilities,
    activeStatus: row.active_status,
  };
}

function toProgram(row: any): Program {
  return {
    programId: row.program_id,
    organizationId: row.organization_id,
    programName: row.program_name,
    programType: row.program_type,
    fundingSource: row.funding_source,
    complianceConfigurationId: row.compliance_configuration_id,
    activeStatus: row.active_status,
  };
}

function toItem(row: any): Item {
  return {
    itemId: row.item_id,
    organizationId: row.organization_id,
    canonicalItemName: row.canonical_item_name,
    itemCategory: row.item_category,
    subcategory: row.subcategory,
    foodGroup: row.food_group,
    unitOfMeasure: row.unit_of_measure,
    poundsPerUnit: row.pounds_per_unit,
    perishableFlag: row.perishable_flag,
    refrigeratedFlag: row.refrigerated_flag,
    frozenFlag: row.frozen_flag,
    barcode: row.barcode,
    activeStatus: row.active_status,
  };
}

export async function getFoodBankProfile(foodBankId: string): Promise<Organization> {
  const result = await pgPool.query(
    `SELECT id, name, organization_type, timezone, address, reporting_currency, primary_contact, active_status
     FROM food_banks WHERE id = $1`,
    [foodBankId]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Food bank not found");
  return toOrganization(result.rows[0]);
}

export async function updateFoodBankProfile(
  foodBankId: string,
  patch: { address?: string; primaryContact?: string; timezone?: string }
): Promise<Organization> {
  const result = await pgPool.query(
    `UPDATE food_banks
     SET address = COALESCE($2, address),
         primary_contact = COALESCE($3, primary_contact),
         timezone = COALESCE($4, timezone)
     WHERE id = $1
     RETURNING id, name, organization_type, timezone, address, reporting_currency, primary_contact, active_status`,
    [foodBankId, patch.address ?? null, patch.primaryContact ?? null, patch.timezone ?? null]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Food bank not found");
  return toOrganization(result.rows[0]);
}

export async function listSites(foodBankId: string): Promise<Site[]> {
  const result = await pgPool.query(
    "SELECT * FROM sites WHERE organization_id = $1 AND active_status = true ORDER BY site_name",
    [foodBankId]
  );
  return result.rows.map(toSite);
}

export async function listPrograms(foodBankId: string): Promise<Program[]> {
  const result = await pgPool.query(
    "SELECT * FROM programs WHERE organization_id = $1 AND active_status = true ORDER BY program_name",
    [foodBankId]
  );
  return result.rows.map(toProgram);
}

export async function listItems(foodBankId: string): Promise<Item[]> {
  const result = await pgPool.query(
    "SELECT * FROM items WHERE organization_id = $1 AND active_status = true ORDER BY canonical_item_name",
    [foodBankId]
  );
  return result.rows.map(toItem);
}

export async function updateItem(
  foodBankId: string,
  itemId: string,
  patch: {
    canonicalItemName?: string;
    itemCategory?: string;
    unitOfMeasure?: string;
    activeStatus?: boolean;
  }
): Promise<Item> {
  const result = await pgPool.query(
    `UPDATE items
     SET canonical_item_name = COALESCE($3, canonical_item_name),
         item_category = COALESCE($4, item_category),
         unit_of_measure = COALESCE($5, unit_of_measure),
         active_status = COALESCE($6, active_status)
     WHERE item_id = $1 AND organization_id = $2
     RETURNING *`,
    [itemId, foodBankId, patch.canonicalItemName ?? null, patch.itemCategory ?? null, patch.unitOfMeasure ?? null, patch.activeStatus ?? null]
  );
  // Same response whether the item doesn't exist or belongs to another food
  // bank — never let a caller distinguish the two across a tenant boundary.
  if (result.rows.length === 0) throw new HttpError(404, "Item not found");
  return toItem(result.rows[0]);
}

function toInventoryLot(row: any): InventoryLot {
  return {
    inventoryLotId: row.inventory_lot_id,
    itemId: row.item_id,
    siteId: row.site_id,
    sourceType: row.source_type,
    donorOrVendorId: row.donor_or_vendor_id,
    lotNumber: row.lot_number,
    receivedDate: row.received_date,
    expiryDate: row.expiry_date,
    storageLocation: row.storage_location,
    quantityOnHand: Number(row.quantity_on_hand),
    quantityReserved: Number(row.quantity_reserved),
    quantityDamaged: Number(row.quantity_damaged),
    quantityDisposed: Number(row.quantity_disposed),
    unitOfMeasure: row.unit_of_measure,
    weightLbs: row.weight_lbs === null ? null : Number(row.weight_lbs),
    temperatureStatus: row.temperature_status,
    foodSafetyStatus: row.food_safety_status,
    reconciliationStatus: row.reconciliation_status,
    lastVerifiedAt: row.last_verified_at,
    sourceReference: row.source_reference,
  };
}

// Joins through items so this stays organization-scoped even though
// inventory_lots itself only carries item_id/site_id, not organization_id
// directly — never trust a lot's own columns for tenant scoping.
export async function listInventoryLots(foodBankId: string): Promise<InventoryLot[]> {
  const result = await pgPool.query(
    `SELECT l.* FROM inventory_lots l
     JOIN items i ON i.item_id = l.item_id
     WHERE i.organization_id = $1
     ORDER BY l.expiry_date NULLS LAST`,
    [foodBankId]
  );
  return result.rows.map(toInventoryLot);
}

const DEFAULT_SITE_NAME = "Main Site";

// Get-or-create by (organization_id, lower(site_name)). With no name given,
// reuses the org's first active site or creates the same "Main Site"
// fallback etl.service.ts used to define locally — kept here as the single
// source of truth so manual entry and the upload ETL never diverge on what
// "the default site" means for a tenant.
export async function getOrCreateSiteId(foodBankId: string, siteName?: string | null): Promise<string> {
  const name = siteName?.trim() || null;

  const existing = await pgPool.query(
    name
      ? "SELECT site_id FROM sites WHERE organization_id = $1 AND lower(site_name) = lower($2)"
      : "SELECT site_id FROM sites WHERE organization_id = $1 AND active_status = true ORDER BY site_name LIMIT 1",
    name ? [foodBankId, name] : [foodBankId]
  );
  if (existing.rows.length > 0) return existing.rows[0].site_id;

  const created = await pgPool.query(
    `INSERT INTO sites (organization_id, site_name, site_type, active_status)
     VALUES ($1, $2, 'primary', true)
     RETURNING site_id`,
    [foodBankId, name ?? DEFAULT_SITE_NAME]
  );
  return created.rows[0].site_id;
}

// Get-or-create by (organization_id, lower(program_name)). Unlike site,
// program is genuinely optional on every table that references it — no name
// means no program, not a fallback default.
export async function getOrCreateProgramId(foodBankId: string, programName?: string | null): Promise<string | null> {
  const name = programName?.trim() || null;
  if (!name) return null;

  const existing = await pgPool.query(
    "SELECT program_id FROM programs WHERE organization_id = $1 AND lower(program_name) = lower($2)",
    [foodBankId, name]
  );
  if (existing.rows.length > 0) return existing.rows[0].program_id;

  const created = await pgPool.query(
    `INSERT INTO programs (organization_id, program_name, active_status)
     VALUES ($1, $2, true)
     RETURNING program_id`,
    [foodBankId, name]
  );
  return created.rows[0].program_id;
}

// Get-or-create by (organization_id, lower(canonical_item_name)) — same
// matching rule etl.service.ts already used locally; moved here so it's one
// function shared by the upload ETL and manual distribution/transaction
// entry instead of two copies that could drift.
export async function getOrCreateItemId(foodBankId: string, canonicalItemName: string, unit?: string | null): Promise<string> {
  const existing = await pgPool.query(
    "SELECT item_id FROM items WHERE organization_id = $1 AND lower(canonical_item_name) = lower($2)",
    [foodBankId, canonicalItemName]
  );
  if (existing.rows.length > 0) return existing.rows[0].item_id;

  const created = await pgPool.query(
    `INSERT INTO items (organization_id, canonical_item_name, unit_of_measure, active_status)
     VALUES ($1, $2, $3, true)
     RETURNING item_id`,
    [foodBankId, canonicalItemName, unit ?? "unit"]
  );
  return created.rows[0].item_id;
}

function toDistributionEvent(row: any): DistributionEvent {
  return {
    distributionEventId: row.distribution_event_id,
    organizationId: row.organization_id,
    siteId: row.site_id,
    programId: row.program_id,
    distributionDate: toDateStringOrNull(row.distribution_date) as string,
    startTime: toIsoStringOrNull(row.start_time),
    endTime: toIsoStringOrNull(row.end_time),
    plannedHouseholds: row.planned_households,
    actualHouseholdsServed: row.actual_households_served,
    plannedBoxes: row.planned_boxes,
    actualBoxesDistributed: row.actual_boxes_distributed,
    plannedVolunteers: row.planned_volunteers,
    confirmedVolunteers: row.confirmed_volunteers,
    eventStatus: row.event_status,
    sourceReference: row.source_reference,
    reconciliationStatus: row.reconciliation_status,
  };
}

function toDistributionLine(row: any): DistributionLine {
  return {
    distributionLineId: row.distribution_line_id,
    distributionEventId: row.distribution_event_id,
    itemId: row.item_id,
    inventoryLotId: row.inventory_lot_id,
    quantityPlanned: row.quantity_planned === null ? null : Number(row.quantity_planned),
    quantityDistributed: row.quantity_distributed === null ? null : Number(row.quantity_distributed),
    quantityReturned: row.quantity_returned === null ? null : Number(row.quantity_returned),
    quantityWasted: row.quantity_wasted === null ? null : Number(row.quantity_wasted),
    unitOfMeasure: row.unit_of_measure,
    weightLbs: row.weight_lbs === null ? null : Number(row.weight_lbs),
    sourceReference: row.source_reference,
    reconciliationStatus: row.reconciliation_status,
  };
}

export interface CreateDistributionEventInput {
  siteName?: string | null;
  programName?: string | null;
  distributionDate: string;
  startTime?: string | null;
  endTime?: string | null;
  plannedHouseholds?: number | null;
  plannedBoxes?: number | null;
  plannedVolunteers?: number | null;
  lines?: { itemName: string; unit?: string | null; quantityPlanned?: number | null }[];
}

export type DistributionEventWithLines = DistributionEvent & { lines: DistributionLine[] };

// distribution_events carries organization_id directly, so creation and
// listing are straightforwardly tenant-scoped (unlike inventory_transactions/
// volunteer_shifts below, which only reach organization_id through a join).
export async function createDistributionEvent(
  foodBankId: string,
  input: CreateDistributionEventInput
): Promise<DistributionEventWithLines> {
  if (!input.distributionDate) throw new HttpError(400, "distributionDate is required");

  const siteId = await getOrCreateSiteId(foodBankId, input.siteName);
  const programId = await getOrCreateProgramId(foodBankId, input.programName);

  const eventResult = await pgPool.query(
    `INSERT INTO distribution_events
       (organization_id, site_id, program_id, distribution_date, start_time, end_time,
        planned_households, planned_boxes, planned_volunteers, event_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'planned')
     RETURNING *`,
    [
      foodBankId,
      siteId,
      programId,
      input.distributionDate,
      input.startTime ?? null,
      input.endTime ?? null,
      input.plannedHouseholds ?? null,
      input.plannedBoxes ?? null,
      input.plannedVolunteers ?? null,
    ]
  );
  const event = toDistributionEvent(eventResult.rows[0]);

  const lines: DistributionLine[] = [];
  for (const line of input.lines ?? []) {
    if (!line.itemName) continue;
    const itemId = await getOrCreateItemId(foodBankId, line.itemName, line.unit);
    const lineResult = await pgPool.query(
      `INSERT INTO distribution_lines
         (distribution_event_id, item_id, quantity_planned, unit_of_measure, reconciliation_status)
       VALUES ($1, $2, $3, $4, 'unreconciled')
       RETURNING *`,
      [event.distributionEventId, itemId, line.quantityPlanned ?? null, line.unit ?? "unit"]
    );
    lines.push(toDistributionLine(lineResult.rows[0]));
  }

  return { ...event, lines };
}

export async function listDistributionEvents(foodBankId: string): Promise<DistributionEventWithLines[]> {
  const eventsResult = await pgPool.query(
    "SELECT * FROM distribution_events WHERE organization_id = $1 ORDER BY distribution_date DESC",
    [foodBankId]
  );
  const events = eventsResult.rows.map(toDistributionEvent);
  if (events.length === 0) return [];

  const linesResult = await pgPool.query(
    `SELECT * FROM distribution_lines WHERE distribution_event_id = ANY($1::uuid[])`,
    [events.map((e) => e.distributionEventId)]
  );
  const linesByEvent = new Map<string, DistributionLine[]>();
  for (const row of linesResult.rows) {
    const line = toDistributionLine(row);
    const arr = linesByEvent.get(line.distributionEventId) ?? [];
    arr.push(line);
    linesByEvent.set(line.distributionEventId, arr);
  }

  return events.map((e) => ({ ...e, lines: linesByEvent.get(e.distributionEventId) ?? [] }));
}

function toInventoryTransaction(row: any): InventoryTransaction {
  return {
    transactionId: row.transaction_id,
    transactionType: row.transaction_type,
    transactionDate: toIsoStringOrNull(row.transaction_date) as string,
    itemId: row.item_id,
    inventoryLotId: row.inventory_lot_id,
    siteId: row.site_id,
    programId: row.program_id,
    quantity: Number(row.quantity),
    unitOfMeasure: row.unit_of_measure,
    weightLbs: row.weight_lbs === null ? null : Number(row.weight_lbs),
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    importedAt: toIsoStringOrNull(row.imported_at) as string,
    reconciliationStatus: row.reconciliation_status,
    createdBy: row.created_by,
    notes: row.notes,
  };
}

// Mirrors the transaction_type CHECK constraint in migration 003 — kept as
// an explicit allowlist here so an invalid type 400s before hitting Postgres.
const TRANSACTION_TYPES = new Set<InventoryTransactionType>([
  "opening_balance", "receipt", "adjustment", "reservation",
  "transfer_out", "transfer_in", "distribution", "waste",
  "spoilage", "donation_return", "correction",
]);

export interface CreateInventoryTransactionInput {
  transactionType: string;
  itemName: string;
  unit?: string | null;
  quantity: number;
  transactionDate: string;
  siteName?: string | null;
  programName?: string | null;
  weightLbs?: number | null;
  notes?: string | null;
}

// inventory_transactions has no organization_id column of its own (see
// migration 003) — tenant scoping happens through item_id at both write
// (get-or-create resolves within foodBankId's items only) and read (the
// listing joins items on organization_id, same pattern as listInventoryLots).
export async function createInventoryTransaction(
  foodBankId: string,
  userId: string,
  input: CreateInventoryTransactionInput
): Promise<InventoryTransaction> {
  if (!TRANSACTION_TYPES.has(input.transactionType as InventoryTransactionType)) {
    throw new HttpError(400, `transactionType must be one of: ${[...TRANSACTION_TYPES].join(", ")}`);
  }
  if (!input.itemName) throw new HttpError(400, "itemName is required");
  if (!input.transactionDate) throw new HttpError(400, "transactionDate is required");
  if (input.quantity === undefined || input.quantity === null || Number.isNaN(Number(input.quantity))) {
    throw new HttpError(400, "quantity is required");
  }

  const itemId = await getOrCreateItemId(foodBankId, input.itemName, input.unit);
  const siteId = await getOrCreateSiteId(foodBankId, input.siteName);
  const programId = await getOrCreateProgramId(foodBankId, input.programName);

  const result = await pgPool.query(
    `INSERT INTO inventory_transactions
       (transaction_type, transaction_date, item_id, site_id, program_id,
        quantity, unit_of_measure, weight_lbs, source_type, notes, created_by, reconciliation_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual_entry', $9, $10, 'unreconciled')
     RETURNING *`,
    [
      input.transactionType,
      input.transactionDate,
      itemId,
      siteId,
      programId,
      input.quantity,
      input.unit ?? "unit",
      input.weightLbs ?? null,
      input.notes ?? null,
      userId,
    ]
  );
  return toInventoryTransaction(result.rows[0]);
}

export async function listInventoryTransactions(foodBankId: string): Promise<InventoryTransaction[]> {
  const result = await pgPool.query(
    `SELECT t.* FROM inventory_transactions t
     JOIN items i ON i.item_id = t.item_id
     WHERE i.organization_id = $1
     ORDER BY t.transaction_date DESC`,
    [foodBankId]
  );
  return result.rows.map(toInventoryTransaction);
}

function toVolunteerShift(row: any): VolunteerShift {
  return {
    shiftId: row.shift_id,
    siteId: row.site_id,
    programId: row.program_id,
    shiftStart: toIsoStringOrNull(row.shift_start) as string,
    shiftEnd: toIsoStringOrNull(row.shift_end) as string,
    role: row.role,
    requiredCount: row.required_count,
    confirmedCount: row.confirmed_count,
    checkedInCount: row.checked_in_count,
    sourceReference: row.source_reference,
  };
}

export interface CreateVolunteerShiftInput {
  siteName?: string | null;
  programName?: string | null;
  shiftStart: string;
  shiftEnd: string;
  role?: string | null;
  requiredCount?: number | null;
  confirmedCount?: number | null;
  checkedInCount?: number | null;
}

// volunteer_shifts also has no organization_id column — scoped through
// site_id the same way inventory_transactions is scoped through item_id.
export async function createVolunteerShift(
  foodBankId: string,
  input: CreateVolunteerShiftInput
): Promise<VolunteerShift> {
  if (!input.shiftStart || !input.shiftEnd) throw new HttpError(400, "shiftStart and shiftEnd are required");

  const siteId = await getOrCreateSiteId(foodBankId, input.siteName);
  const programId = await getOrCreateProgramId(foodBankId, input.programName);

  const result = await pgPool.query(
    `INSERT INTO volunteer_shifts
       (site_id, program_id, shift_start, shift_end, role, required_count, confirmed_count, checked_in_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      siteId,
      programId,
      input.shiftStart,
      input.shiftEnd,
      input.role ?? null,
      input.requiredCount ?? null,
      input.confirmedCount ?? null,
      input.checkedInCount ?? null,
    ]
  );
  return toVolunteerShift(result.rows[0]);
}

export async function listVolunteerShifts(foodBankId: string): Promise<VolunteerShift[]> {
  const result = await pgPool.query(
    `SELECT sh.* FROM volunteer_shifts sh
     JOIN sites s ON s.site_id = sh.site_id
     WHERE s.organization_id = $1
     ORDER BY sh.shift_start DESC`,
    [foodBankId]
  );
  return result.rows.map(toVolunteerShift);
}

// Canonical operations schema (TypeScript side). Mirrors
// db/migrations/003_postgres_operations_schema.sql 1:1 — every field here
// has a same-named (snake_case) column there. `organization_id` refers to
// `food_banks.id`; there is no separate `organizations` table (see the
// migration's header comment).
//
// These types are the shared vocabulary for calculations.ts, exceptions.ts,
// and recommendations.ts — all pure functions that take arrays of these
// entities and never touch the DOM, a DB connection, or an LLM.

export type ReconciliationStatus =
  | "reconciled"
  | "partially_reconciled"
  | "unreconciled"
  | "insufficient_data";

export interface Organization {
  organizationId: string;
  organizationName: string;
  organizationType: string | null;
  timezone: string;
  address: string | null;
  reportingCurrency: string;
  primaryContact: string | null;
  activeStatus: boolean;
}

export interface Site {
  siteId: string;
  organizationId: string;
  siteName: string;
  siteType: string | null;
  address: string | null;
  operatingDays: unknown | null;
  storageCapabilities: unknown | null;
  activeStatus: boolean;
}

export interface Program {
  programId: string;
  organizationId: string;
  programName: string;
  programType: string | null;
  fundingSource: string | null;
  complianceConfigurationId: string | null;
  activeStatus: boolean;
}

export interface Item {
  itemId: string;
  organizationId: string;
  canonicalItemName: string;
  itemCategory: string | null;
  subcategory: string | null;
  foodGroup: string | null;
  unitOfMeasure: string;
  poundsPerUnit: number | null;
  perishableFlag: boolean;
  refrigeratedFlag: boolean;
  frozenFlag: boolean;
  barcode: string | null;
  activeStatus: boolean;
}

export interface InventoryLot {
  inventoryLotId: string;
  itemId: string;
  siteId: string;
  sourceType: string | null;
  donorOrVendorId: string | null;
  lotNumber: string | null;
  receivedDate: string | null;
  expiryDate: string | null;
  storageLocation: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  quantityDamaged: number;
  quantityDisposed: number;
  unitOfMeasure: string;
  weightLbs: number | null;
  temperatureStatus: string | null;
  foodSafetyStatus: string | null;
  reconciliationStatus: ReconciliationStatus;
  lastVerifiedAt: string | null;
  sourceReference: string | null;
}

export type InventoryTransactionType =
  | "opening_balance"
  | "receipt"
  | "adjustment"
  | "reservation"
  | "transfer_out"
  | "transfer_in"
  | "distribution"
  | "waste"
  | "spoilage"
  | "donation_return"
  | "correction";

export interface InventoryTransaction {
  transactionId: string;
  transactionType: InventoryTransactionType;
  transactionDate: string;
  itemId: string;
  inventoryLotId: string | null;
  siteId: string;
  programId: string | null;
  quantity: number;
  unitOfMeasure: string;
  weightLbs: number | null;
  sourceType: string | null;
  sourceReference: string | null;
  importedAt: string;
  reconciliationStatus: ReconciliationStatus;
  createdBy: string | null;
  notes: string | null;
}

export type DistributionEventStatus = "planned" | "in_progress" | "completed" | "cancelled";

export interface DistributionEvent {
  distributionEventId: string;
  organizationId: string;
  siteId: string;
  programId: string | null;
  distributionDate: string;
  startTime: string | null;
  endTime: string | null;
  plannedHouseholds: number | null;
  actualHouseholdsServed: number | null;
  plannedBoxes: number | null;
  actualBoxesDistributed: number | null;
  plannedVolunteers: number | null;
  confirmedVolunteers: number | null;
  eventStatus: DistributionEventStatus;
  sourceReference: string | null;
  reconciliationStatus: ReconciliationStatus;
}

export interface DistributionLine {
  distributionLineId: string;
  distributionEventId: string;
  itemId: string;
  inventoryLotId: string | null;
  quantityPlanned: number | null;
  quantityDistributed: number | null;
  quantityReturned: number | null;
  quantityWasted: number | null;
  unitOfMeasure: string;
  weightLbs: number | null;
  sourceReference: string | null;
  reconciliationStatus: ReconciliationStatus;
}

export interface HouseholdServiceAggregate {
  aggregateId: string;
  organizationId: string;
  siteId: string | null;
  programId: string | null;
  reportingPeriod: string;
  uniqueHouseholdsServed: number | null;
  individualsServed: number | null;
  visits: number | null;
  newHouseholds: number | null;
  returningHouseholds: number | null;
  sourceCoveragePercentage: number | null;
  calculationDefinition: string | null;
  sourceReference: string | null;
}

export interface VolunteerShift {
  shiftId: string;
  siteId: string;
  programId: string | null;
  shiftStart: string;
  shiftEnd: string;
  role: string | null;
  requiredCount: number | null;
  confirmedCount: number | null;
  checkedInCount: number | null;
  sourceReference: string | null;
}

export type ExceptionType =
  | "missing_receiving_record"
  | "inventory_distribution_mismatch"
  | "unit_conversion_mismatch"
  | "duplicate_inventory_item"
  | "unmapped_item"
  | "missing_expiry_date"
  | "missing_lot_number"
  | "stale_inventory_source"
  | "unconfirmed_outbound_distribution"
  | "negative_inventory"
  | "duplicate_distribution_record"
  | "unknown_site_location"
  | "data_not_mapped_to_canonical_schema";

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";
export type ExceptionStatus = "new" | "assigned" | "in_review" | "resolved" | "not_applicable";

export interface ReconciliationException {
  exceptionId: string;
  organizationId: string;
  siteId: string | null;
  programId: string | null;
  exceptionType: ExceptionType;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  affectedItemId: string | null;
  affectedInventoryLotId: string | null;
  affectedDistributionEventId: string | null;
  affectedQuantity: number | null;
  unitOfMeasure: string | null;
  affectedWeightLbs: number | null;
  detectedAt: string;
  sourceSystems: string[] | null;
  sourceReferences: string[] | null;
  explanation: string;
  likelyCauses: string[] | null;
  assignedOwner: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  materialityScore: number | null;
}

export interface DataSource {
  sourceId: string;
  organizationId: string;
  sourceType: string | null;
  sourceName: string | null;
  fileName: string | null;
  fileHash: string | null;
  importTimestamp: string;
  reportingPeriod: string | null;
  dataFreshnessTimestamp: string | null;
  mappingVersion: string | null;
  sourceRowReference: string | null;
  extractionConfidence: number | null;
  reconciliationRunId: string | null;
}

export type ReportTemplateId =
  | "distribution_readiness_brief"
  | "monthly_operations_reconciliation"
  | "board_impact_report"
  | "grant_progress_report"
  | "tefap_draft_review_packet"
  | "network_partner_allocation_report";

export interface ReportConfiguration {
  reportConfigId: string;
  organizationId: string;
  templateId: ReportTemplateId;
  reportName: string;
  brandingLogo: string | null;
  primaryColor: string | null;
  includedSites: string[] | null;
  includedPrograms: string[] | null;
  metricDefinitions: unknown | null;
  customSections: unknown | null;
  approvedTemplateFile: string | null;
  reportDisclaimer: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  lastUpdatedAt: string;
}

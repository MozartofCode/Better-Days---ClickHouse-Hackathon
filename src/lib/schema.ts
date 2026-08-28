// The shared contract every part of the app reads and writes.
// Ingest -> Normalize produce this shape. Engines consume it. Present renders it.
// Every record carries sourceFile + sourceRow(s) so results trace back to raw data.

export type FileKind = "inventory" | "visits" | "households" | "unknown";

export interface ParsedFile {
  name: string;
  headers: string[];
  rows: string[][];
  kind: FileKind;
  rowCount: number;
}

export interface InventoryRecord {
  id: string;
  commodity: string;
  lot: string | null;
  beginningLb: number;
  receivedLb: number;
  distributedLb: number;
  transferredLb: number;
  documentedLossLb: number;
  physicalCountLb: number | null;
  sourceFile: string;
  sourceRows: number[];
}

export interface VisitRecord {
  id: string;
  householdId: string | null;
  date: string | null; // ISO YYYY-MM-DD
  site: string | null;
  program: "TEFAP" | "CSFP" | "Other" | null;
  poundsLb: number | null;
  householdSize: number | null;
  sourceFile: string;
  sourceRow: number;
}

export interface HouseholdRecord {
  id: string;
  nameRaw: string;
  addressRaw: string;
  size: number | null;
  sourceFile: string;
  sourceRow: number;
}

export type ExceptionSeverity = "error" | "warn";

export interface AffectedRow {
  sourceFile: string;
  sourceRow: number;
}

export interface QualityException {
  severity: ExceptionSeverity;
  type: string;
  message: string;
  affectedRows: AffectedRow[];
  count: number;
}

export interface ContractMeta {
  files: { name: string; rowCount: number; kind: FileKind }[];
  dateRange: { start: string | null; end: string | null };
  sites: string[];
  mappingConfidence: number; // 0-1, average across mapped files
}

export interface Contract {
  meta: ContractMeta;
  inventory: InventoryRecord[];
  visits: VisitRecord[];
  households: HouseholdRecord[];
  exceptions: QualityException[];
}

export const TARGET_FIELDS: Record<Exclude<FileKind, "unknown">, string[]> = {
  inventory: [
    "commodity",
    "lot",
    "beginningLb",
    "receivedLb",
    "distributedLb",
    "transferredLb",
    "documentedLossLb",
    "physicalCountLb",
  ],
  visits: ["householdId", "date", "site", "program", "poundsLb", "householdSize"],
  households: ["nameRaw", "addressRaw", "size"],
};

// The confirmation screen shows at most 6 dropdowns per file so a busy,
// non-technical user isn't overwhelmed. These are the fields most worth a
// human double-check; anything else stays on the automatic match.
export const MANUAL_FIELDS: Record<Exclude<FileKind, "unknown">, string[]> = {
  inventory: ["commodity", "beginningLb", "receivedLb", "distributedLb", "documentedLossLb", "physicalCountLb"],
  visits: ["householdId", "date", "site", "program", "poundsLb", "householdSize"],
  households: ["nameRaw", "addressRaw", "size"],
};

// Plain-English labels for the confirmation screen. No technical field names shown to the user.
export const FIELD_LABELS: Record<string, string> = {
  commodity: "Commodity / item name",
  lot: "Lot number",
  beginningLb: "Beginning pounds",
  receivedLb: "Received pounds",
  distributedLb: "Distributed pounds",
  transferredLb: "Transferred pounds",
  documentedLossLb: "Documented loss (pounds)",
  physicalCountLb: "Physical count (pounds)",
  householdId: "Household ID",
  date: "Visit date",
  site: "Site",
  program: "Program (TEFAP / CSFP)",
  poundsLb: "Pounds given",
  householdSize: "Household size",
  nameRaw: "Household name",
  addressRaw: "Address",
  size: "Household size",
};

export interface ColumnMapping {
  fileName: string;
  kind: FileKind;
  mapping: Record<string, number | null>; // targetField -> column index
  unitHint: "lb" | "kg" | "cases" | "unknown";
  confidence: number;
}

export interface Variance {
  id: string;
  commodity: string;
  lot: string | null;
  beginningLb: number;
  receivedLb: number;
  distributedLb: number;
  transferredLb: number;
  documentedLossLb: number;
  expectedEndingLb: number;
  physicalCountLb: number | null;
  varianceLb: number | null;
  variancePct: number | null;
  flagged: boolean;
  direction: "short" | "over" | "balanced" | "impossible" | "no-count";
  sourceFile: string;
  sourceRows: number[];
}

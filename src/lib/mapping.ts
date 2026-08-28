import { v4 as uuid } from "uuid";
import type {
  ColumnMapping,
  Contract,
  FileKind,
  HouseholdRecord,
  InventoryRecord,
  ParsedFile,
  VisitRecord,
} from "./schema";
import { TARGET_FIELDS } from "./schema";

// --- Column mapping -------------------------------------------------------
// Deterministic, keyword-based mapper. No network call, no API key.
// Runs the same whether or not an AI mapping service is ever wired in later,
// so the app never depends on an external call to be usable.

const SYNONYMS: Record<string, string[]> = {
  commodity: ["commodity", "item", "product", "food item", "category"],
  lot: ["lot", "lot number", "lot#", "batch"],
  beginningLb: ["beginning", "starting", "opening"],
  receivedLb: ["received", "receipts", "incoming"],
  distributedLb: ["distributed", "given out", "issued", "outgoing"],
  transferredLb: ["transferred", "transfer"],
  documentedLossLb: ["loss", "spoilage", "documented loss", "waste"],
  physicalCountLb: ["physical count", "count", "counted", "actual", "on hand"],
  householdId: ["household id", "householdid", "hh id", "hh_id", "family id"],
  date: ["date", "visit date"],
  site: ["site", "location", "pantry", "distribution site"],
  program: ["program", "tefap", "csfp"],
  poundsLb: ["pounds", "poundslb", "weight", "lbs"],
  householdSize: ["household size", "family size", "hh size", "size"],
  nameRaw: ["name", "household name", "client name", "recipient"],
  addressRaw: ["address", "street", "home address"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreHeader(header: string, synonyms: string[]): number {
  const h = norm(header);
  let best = 0;
  for (const syn of synonyms) {
    if (h === syn) best = Math.max(best, 1);
    else if (h.includes(syn) || syn.includes(h)) best = Math.max(best, 0.75);
  }
  return best;
}

function detectUnitHint(headers: string[]): "lb" | "kg" | "cases" | "unknown" {
  const joined = headers.join(" ").toLowerCase();
  if (joined.includes("kg") || joined.includes("kilogram")) return "kg";
  if (joined.includes("case")) return "cases";
  if (joined.includes("lb") || joined.includes("pound")) return "lb";
  return "unknown";
}

export function mapColumns(file: ParsedFile): ColumnMapping {
  const kind = file.kind === "unknown" ? "inventory" : file.kind;
  const targets = TARGET_FIELDS[kind as Exclude<FileKind, "unknown">];
  const mapping: Record<string, number | null> = {};
  const used = new Set<number>();
  let totalScore = 0;

  for (const field of targets) {
    const synonyms = SYNONYMS[field] ?? [field];
    let bestIdx: number | null = null;
    let bestScore = 0;
    file.headers.forEach((h, idx) => {
      if (used.has(idx)) return;
      const s = scoreHeader(h, synonyms);
      if (s > bestScore) {
        bestScore = s;
        bestIdx = idx;
      }
    });
    if (bestIdx !== null && bestScore >= 0.5) {
      mapping[field] = bestIdx;
      used.add(bestIdx);
      totalScore += bestScore;
    } else {
      mapping[field] = null;
    }
  }

  const matched = Object.values(mapping).filter((v) => v !== null).length;
  const confidence = targets.length === 0 ? 0 : Math.min(1, totalScore / targets.length);

  return {
    fileName: file.name,
    kind: file.kind,
    mapping,
    unitHint: detectUnitHint(file.headers),
    confidence: matched === 0 ? 0 : confidence,
  };
}

// --- Unit + date conversion ------------------------------------------------

export function toPounds(value: number, unit: "lb" | "kg" | "cases" | "unknown", lbPerCase = 30): number {
  if (unit === "kg") return value * 2.20462;
  if (unit === "cases") return value * lbPerCase;
  return value; // lb or unknown, treated as lb
}

export function toIsoDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const trimmed = raw.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function num(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === "") return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

function cell(row: string[], idx: number | null): string | undefined {
  if (idx === null) return undefined;
  return row[idx];
}

// --- Build contract from confirmed mappings --------------------------------

export interface FileMappingInput {
  file: ParsedFile;
  mapping: ColumnMapping;
  lbPerCase?: number;
}

export function buildContract(inputs: FileMappingInput[]): Contract {
  const inventory: InventoryRecord[] = [];
  const visits: VisitRecord[] = [];
  const households: HouseholdRecord[] = [];
  const sites = new Set<string>();
  let minDate: string | null = null;
  let maxDate: string | null = null;
  let confidenceSum = 0;

  for (const { file, mapping, lbPerCase } of inputs) {
    confidenceSum += mapping.confidence;
    const m = mapping.mapping;
    const unit = mapping.unitHint;

    if (mapping.kind === "inventory" || file.kind === "unknown") {
      file.rows.forEach((row, i) => {
        const rowNum = i + 2; // header is row 1
        const commodity = cell(row, m.commodity) ?? "";
        if (!commodity.trim() && mapping.kind !== "inventory") return;
        const beginningLb = toPounds(num(cell(row, m.beginningLb)) ?? 0, unit, lbPerCase);
        const receivedLb = toPounds(num(cell(row, m.receivedLb)) ?? 0, unit, lbPerCase);
        const distributedLb = toPounds(num(cell(row, m.distributedLb)) ?? 0, unit, lbPerCase);
        const transferredLb = toPounds(num(cell(row, m.transferredLb)) ?? 0, unit, lbPerCase);
        const documentedLossLb = toPounds(num(cell(row, m.documentedLossLb)) ?? 0, unit, lbPerCase);
        const rawCount = num(cell(row, m.physicalCountLb));
        const physicalCountLb = rawCount === null ? null : toPounds(rawCount, unit, lbPerCase);
        if (!commodity.trim()) return;
        inventory.push({
          id: `inv_${uuid().slice(0, 8)}`,
          commodity: commodity.trim(),
          lot: cell(row, m.lot)?.trim() || null,
          beginningLb,
          receivedLb,
          distributedLb,
          transferredLb,
          documentedLossLb,
          physicalCountLb,
          sourceFile: file.name,
          sourceRows: [rowNum],
        });
      });
    } else if (mapping.kind === "visits") {
      file.rows.forEach((row, i) => {
        const rowNum = i + 2;
        const dateRaw = cell(row, m.date) ?? "";
        const date = toIsoDate(dateRaw);
        const site = cell(row, m.site)?.trim() || null;
        if (site) sites.add(site);
        if (date) {
          if (!minDate || date < minDate) minDate = date;
          if (!maxDate || date > maxDate) maxDate = date;
        }
        const programRaw = (cell(row, m.program) ?? "").trim().toUpperCase();
        const program = programRaw === "TEFAP" ? "TEFAP" : programRaw === "CSFP" ? "CSFP" : programRaw ? "Other" : null;
        const poundsRaw = num(cell(row, m.poundsLb));
        visits.push({
          id: `vis_${uuid().slice(0, 8)}`,
          householdId: cell(row, m.householdId)?.trim() || null,
          date,
          site,
          program,
          poundsLb: poundsRaw === null ? null : toPounds(poundsRaw, unit, lbPerCase),
          householdSize: num(cell(row, m.householdSize)),
          sourceFile: file.name,
          sourceRow: rowNum,
        });
      });
    } else if (mapping.kind === "households") {
      file.rows.forEach((row, i) => {
        const rowNum = i + 2;
        const nameRaw = cell(row, m.nameRaw)?.trim() || "";
        if (!nameRaw) return;
        households.push({
          id: `hh_${uuid().slice(0, 8)}`,
          nameRaw,
          addressRaw: cell(row, m.addressRaw)?.trim() || "",
          size: num(cell(row, m.size)),
          sourceFile: file.name,
          sourceRow: rowNum,
        });
      });
    }
  }

  return {
    meta: {
      files: inputs.map(({ file }) => ({ name: file.name, rowCount: file.rowCount, kind: file.kind })),
      dateRange: { start: minDate, end: maxDate },
      sites: Array.from(sites),
      mappingConfidence: inputs.length ? confidenceSum / inputs.length : 0,
    },
    inventory,
    visits,
    households,
    exceptions: [],
  };
}

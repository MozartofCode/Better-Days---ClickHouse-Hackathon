// Column mapping for community/demand uploads (visits, households served,
// commodities distributed, by site and date). Mirrors uploads/inventory-schema.ts:
// fuzzy-match uploaded headers onto a fixed set of fields, leave the rest
// unmatched rather than rejecting the file.

export interface DemandField {
  key: string;
  label: string;
  aliases: string[];
}

export const DEMAND_FIELDS: DemandField[] = [
  { key: "site", label: "Site", aliases: ["site", "location", "pantry", "pantry site", "distribution site"] },
  { key: "date", label: "Date", aliases: ["date", "visit date", "activity date", "distribution date"] },
  { key: "commodity", label: "Commodity", aliases: ["commodity", "item", "food item", "category", "product"] },
  { key: "visitCount", label: "Visits", aliases: ["visits", "visit count", "# visits", "number of visits", "visit"] },
  {
    key: "householdCount",
    label: "Households served",
    aliases: ["households", "household count", "# households", "families served", "households served"],
  },
  { key: "quantity", label: "Quantity", aliases: ["quantity", "pounds", "lbs", "amount", "qty"] },
  { key: "unit", label: "Unit", aliases: ["unit", "uom", "unit of measurement"] },
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Maps each canonical field to the original column name it best matches, or null if none fit. */
export function mapDemandColumns(columns: string[]): Record<string, string | null> {
  const normalized = columns.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Record<string, string | null> = {};

  for (const field of DEMAND_FIELDS) {
    let matchIndex = -1;
    for (const alias of field.aliases) {
      matchIndex = normalized.findIndex((h, i) => !used.has(i) && h === alias);
      if (matchIndex !== -1) break;
    }
    if (matchIndex === -1) {
      for (const alias of field.aliases) {
        matchIndex = normalized.findIndex((h, i) => !used.has(i) && h.includes(alias));
        if (matchIndex !== -1) break;
      }
    }
    if (matchIndex !== -1) {
      used.add(matchIndex);
      mapping[field.key] = columns[matchIndex];
    } else {
      mapping[field.key] = null;
    }
  }

  return mapping;
}

export interface NormalizedDemandRecord {
  site: string | null;
  date: string | null; // ISO YYYY-MM-DD
  commodity: string | null;
  visitCount: number | null;
  householdCount: number | null;
  quantity: number | null;
  unit: string | null;
  valid: boolean; // has a parseable date AND at least one of site/commodity
}

function cleanValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.replace(/,/g, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseIsoDate(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeDemandRow(
  data: Record<string, string>,
  mapping: Record<string, string | null>
): NormalizedDemandRecord {
  const get = (key: string) => (mapping[key] ? data[mapping[key] as string] : undefined);

  const site = cleanValue(get("site"));
  const date = parseIsoDate(get("date"));
  const commodity = cleanValue(get("commodity"));

  return {
    site,
    date,
    commodity,
    visitCount: parseNumber(get("visitCount")),
    householdCount: parseNumber(get("householdCount")),
    quantity: parseNumber(get("quantity")),
    unit: cleanValue(get("unit")),
    valid: date !== null && (site !== null || commodity !== null),
  };
}

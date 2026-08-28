// Canonical inventory schema, modeled on Jotform's "Food Pantry Inventory
// Management" form template (Item Name, Category, Quantity, Unit of
// Measurement, Expiration Date, Storage Location, Source of Item, Date of
// Entry/Update, Restocking Status, Person Responsible, Handling
// Instructions Notes). Uploaded spreadsheets rarely use these exact header
// names, so every upload's headers get fuzzy-matched onto this schema —
// unmatched fields are simply left blank rather than rejecting the file.

export interface InventoryField {
  key: string;
  label: string;
  aliases: string[];
}

// Ordered most-specific-first: a generic alias like "status" or "date"
// shouldn't steal a column that a more specific field also matches.
export const INVENTORY_FIELDS: InventoryField[] = [
  { key: "expirationDate", label: "Expiration Date", aliases: ["expiration date", "expiry date", "exp date", "best by", "use by date"] },
  { key: "restockingStatus", label: "Restocking Status", aliases: ["restocking status", "stock status", "status"] },
  { key: "dateEntered", label: "Date of Entry/Update", aliases: ["date of entry/update", "date of entry", "date entered", "date added", "entry date", "date"] },
  { key: "personResponsible", label: "Person Responsible", aliases: ["person responsible", "responsible", "responsible person", "staff name", "recorded by", "staff"] },
  { key: "unit", label: "Unit of Measurement", aliases: ["unit of measurement", "unit", "uom", "measure"] },
  { key: "storageLocation", label: "Storage Location", aliases: ["storage location", "storage", "location"] },
  { key: "source", label: "Source of Item", aliases: ["source of item", "source", "donor", "donated by"] },
  { key: "notes", label: "Handling Instructions Notes", aliases: ["handling instructions notes", "handling instructions", "instructions", "notes", "comments"] },
  { key: "itemName", label: "Item Name", aliases: ["item name", "item", "product name", "product"] },
  { key: "category", label: "Category", aliases: ["category", "food category", "type"] },
  { key: "quantity", label: "Quantity", aliases: ["quantity", "qty", "amount", "count"] },
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

/** Maps each canonical field to the original column name it best matches, or null if none of the uploaded columns fit. */
export function mapInventoryColumns(columns: string[]): Record<string, string | null> {
  const normalized = columns.map(normalizeHeader);
  const used = new Set<number>();
  const mapping: Record<string, string | null> = {};

  for (const field of INVENTORY_FIELDS) {
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

export interface NormalizedInventoryItem {
  itemName: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  expirationDate: string | null;
  storageLocation: string | null;
  source: string | null;
  dateEntered: string | null;
  restockingStatus: string | null;
  personResponsible: string | null;
  notes: string | null;
}

function cleanValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseQuantity(value: string | undefined): number | null {
  if (value === undefined) return null;
  const trimmed = value.replace(/,/g, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function normalizeInventoryRow(
  data: Record<string, string>,
  mapping: Record<string, string | null>
): NormalizedInventoryItem {
  const get = (key: string) => (mapping[key] ? data[mapping[key] as string] : undefined);
  return {
    itemName: cleanValue(get("itemName")),
    category: cleanValue(get("category")),
    quantity: parseQuantity(get("quantity")),
    unit: cleanValue(get("unit")),
    expirationDate: cleanValue(get("expirationDate")),
    storageLocation: cleanValue(get("storageLocation")),
    source: cleanValue(get("source")),
    dateEntered: cleanValue(get("dateEntered")),
    restockingStatus: cleanValue(get("restockingStatus")),
    personResponsible: cleanValue(get("personResponsible")),
    notes: cleanValue(get("notes")),
  };
}

const LOW_STOCK_HINTS = ["low"];
const OUT_OF_STOCK_HINTS = ["out of stock", "out", "empty", "depleted"];

export function classifyStockStatus(status: string | null): "out" | "low" | "ok" | "unknown" {
  if (!status) return "unknown";
  const s = status.toLowerCase();
  if (OUT_OF_STOCK_HINTS.some((h) => s.includes(h))) return "out";
  if (LOW_STOCK_HINTS.some((h) => s.includes(h))) return "low";
  return "ok";
}

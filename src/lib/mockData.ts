// Sample fixture so a reviewer can see the whole pipeline without hunting
// for a real spreadsheet. Hand-built directly as a Contract (bypassing
// parse/mapping) so the seeded issues below are guaranteed, not incidental.

import type { Contract } from "./schema";

const inv = (
  id: string,
  commodity: string,
  beginningLb: number,
  receivedLb: number,
  distributedLb: number,
  transferredLb: number,
  documentedLossLb: number,
  physicalCountLb: number | null,
  row: number
) => ({
  id,
  commodity,
  lot: `L-2026-${row.toString().padStart(4, "0")}`,
  beginningLb,
  receivedLb,
  distributedLb,
  transferredLb,
  documentedLossLb,
  physicalCountLb,
  sourceFile: "sample_inventory.xlsx",
  sourceRows: [row],
});

export const SAMPLE_CONTRACT: Contract = {
  meta: {
    files: [
      { name: "sample_inventory.xlsx", rowCount: 6, kind: "inventory" },
      { name: "sample_visits.csv", rowCount: 16, kind: "visits" },
      { name: "sample_households.csv", rowCount: 10, kind: "households" },
    ],
    dateRange: { start: "2026-06-01", end: "2026-06-30" },
    sites: ["Main", "North", "Mobile"],
    mappingConfidence: 0.93,
  },
  inventory: [
    inv("inv_001", "Frozen Chicken", 2000, 5000, 4200, 400, 15, 2100, 2),
    inv("inv_002", "Canned Corn", 800, 1200, 1500, 0, 0, 500, 3),
    inv("inv_003", "Rice", 1000, 0, 400, 0, 0, 600, 4),
    inv("inv_004", "Milk", 300, 900, 1100, 0, 20, 95, 5),
    inv("inv_005", "Produce", 0, 2000, 1800, 100, 50, 40, 6),
    inv("inv_006", "Pasta", 500, 500, 300, 0, 0, null, 7),
  ],
  visits: [
    { id: "vis_001", householdId: "hh_001", date: "2026-06-02", site: "Main", program: "TEFAP", poundsLb: 38, householdSize: 4, sourceFile: "sample_visits.csv", sourceRow: 2 },
    { id: "vis_002", householdId: "hh_002", date: "2026-06-02", site: "Main", program: "TEFAP", poundsLb: 22, householdSize: 2, sourceFile: "sample_visits.csv", sourceRow: 3 },
    { id: "vis_003", householdId: "hh_003", date: "2026-06-03", site: "North", program: "Other", poundsLb: 15, householdSize: 1, sourceFile: "sample_visits.csv", sourceRow: 4 },
    { id: "vis_004", householdId: "hh_004", date: "2026-06-04", site: "Mobile", program: "TEFAP", poundsLb: 30, householdSize: null, sourceFile: "sample_visits.csv", sourceRow: 5 },
    { id: "vis_005", householdId: "hh_005", date: "2026-06-05", site: "Main", program: "TEFAP", poundsLb: 41, householdSize: 5, sourceFile: "sample_visits.csv", sourceRow: 6 },
    { id: "vis_006", householdId: "hh_006", date: "2026-06-05", site: "North", program: "CSFP", poundsLb: 18, householdSize: 1, sourceFile: "sample_visits.csv", sourceRow: 7 },
    { id: "vis_007", householdId: "hh_007", date: "2026-06-06", site: "Main", program: "TEFAP", poundsLb: -12, householdSize: 3, sourceFile: "sample_visits.csv", sourceRow: 8 },
    { id: "vis_008", householdId: "hh_008", date: "2026-06-07", site: "Mobile", program: "TEFAP", poundsLb: 27, householdSize: null, sourceFile: "sample_visits.csv", sourceRow: 9 },
    { id: "vis_009", householdId: "hh_009", date: "2026-06-08", site: "North", program: "Other", poundsLb: 19, householdSize: 2, sourceFile: "sample_visits.csv", sourceRow: 10 },
    { id: "vis_010", householdId: "hh_010", date: "2026-06-09", site: "Main", program: "TEFAP", poundsLb: 33, householdSize: null, sourceFile: "sample_visits.csv", sourceRow: 11 },
    { id: "vis_011", householdId: "hh_001", date: "2026-06-12", site: "Main", program: "TEFAP", poundsLb: 36, householdSize: 4, sourceFile: "sample_visits.csv", sourceRow: 12 },
    { id: "vis_012", householdId: "hh_003", date: "2026-06-14", site: "North", program: "Other", poundsLb: 16, householdSize: 1, sourceFile: "sample_visits.csv", sourceRow: 13 },
    { id: "vis_013", householdId: "hh_999", date: "2026-06-15", site: "Mobile", program: "TEFAP", poundsLb: 24, householdSize: 3, sourceFile: "sample_visits.csv", sourceRow: 14 },
    { id: "vis_014", householdId: "hh_005", date: "2026-06-18", site: "Main", program: "TEFAP", poundsLb: 40, householdSize: 5, sourceFile: "sample_visits.csv", sourceRow: 15 },
    { id: "vis_015", householdId: "hh_006", date: "2026-05-28", site: "North", program: "CSFP", poundsLb: 20, householdSize: 1, sourceFile: "sample_visits.csv", sourceRow: 16 },
    { id: "vis_016", householdId: "hh_007", date: "2026-05-28", site: "Main", program: "TEFAP", poundsLb: 31, householdSize: 3, sourceFile: "sample_visits.csv", sourceRow: 17 },
  ],
  households: [
    { id: "hh_001", nameRaw: "Maria Gonzalez", addressRaw: "412 Oak St", size: 4, sourceFile: "sample_households.csv", sourceRow: 2 },
    { id: "hh_002", nameRaw: "Maria Gonzales", addressRaw: "412 Oak Street", size: 4, sourceFile: "sample_households.csv", sourceRow: 3 },
    { id: "hh_003", nameRaw: "J. Chen", addressRaw: "88 Pine", size: 1, sourceFile: "sample_households.csv", sourceRow: 4 },
    { id: "hh_004", nameRaw: "James Chen", addressRaw: "88 Pine Ave", size: 3, sourceFile: "sample_households.csv", sourceRow: 5 },
    { id: "hh_005", nameRaw: "Alicia Ramos", addressRaw: "20 Birch Rd", size: 5, sourceFile: "sample_households.csv", sourceRow: 6 },
    { id: "hh_006", nameRaw: "Tom Iverson", addressRaw: "5 Elm Ct", size: 1, sourceFile: "sample_households.csv", sourceRow: 7 },
    { id: "hh_007", nameRaw: "Priya Nair", addressRaw: "77 Cedar Ln", size: 3, sourceFile: "sample_households.csv", sourceRow: 8 },
    { id: "hh_008", nameRaw: "Dwayne Ford", addressRaw: "3 Maple Dr", size: 2, sourceFile: "sample_households.csv", sourceRow: 9 },
    { id: "hh_009", nameRaw: "Linh Tran", addressRaw: "91 Willow Ave", size: 2, sourceFile: "sample_households.csv", sourceRow: 10 },
    { id: "hh_010", nameRaw: "Robert Nguyen", addressRaw: "14 Aspen St", size: 6, sourceFile: "sample_households.csv", sourceRow: 11 },
  ],
  exceptions: [],
};

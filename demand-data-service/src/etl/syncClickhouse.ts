// Truncate-and-reload ETL: Postgres (operational) -> ClickHouse (reporting).
// Simplest correct approach for a hackathon; not incremental. Run after any
// ingestion via `npm run etl:clickhouse` or scripts/ingest-all.ts.

import { pgPool } from "../db/postgres";
import { clickhouse } from "../db/clickhouse";

interface DemandProxyRow {
  county_or_coc: string;
  metric_source: string;
  dimension: string;
  dimension_detail: string;
  period: string;
  value: number | null;
  value_raw: string;
  synced_at: string;
}

function toNumberOrNull(raw: string | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ClickHouse's JSONEachRow DateTime parser wants "YYYY-MM-DD HH:MM:SS", not
// ISO 8601 with a "T" separator, a fractional-seconds suffix, or a "Z".
function clickhouseDateTimeNow(): string {
  return new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
}

async function buildDemandProxyRows(): Promise<DemandProxyRow[]> {
  const now = clickhouseDateTimeNow();
  const rows: DemandProxyRow[] = [];

  const homelessness = await pgPool.query(
    `SELECT location_id, dimension_type, dimension_value, calendar_year, count_raw
     FROM ca_homelessness_counts`
  );
  for (const r of homelessness.rows) {
    rows.push({
      county_or_coc: r.location_id,
      metric_source: "calich_homelessness",
      dimension: r.dimension_type,
      dimension_detail: r.dimension_value,
      period: r.calendar_year,
      value: toNumberOrNull(r.count_raw),
      value_raw: r.count_raw ?? "",
      synced_at: now,
    });
  }

  const bhCountyProfile = await pgPool.query(
    `SELECT county_name, dimension, dimension_dtl, value_raw
     FROM chhs_bh_county_profile`
  );
  for (const r of bhCountyProfile.rows) {
    rows.push({
      county_or_coc: r.county_name,
      metric_source: "chhs_bh_county_profile",
      dimension: r.dimension ?? "",
      dimension_detail: r.dimension_dtl ?? "",
      period: "",
      value: toNumberOrNull(r.value_raw),
      value_raw: r.value_raw ?? "",
      synced_at: now,
    });
  }

  return rows;
}

interface FoodBankSummaryRow {
  food_bank_id: string;
  name: string;
  county: string;
  meals_provided: number | null;
  pounds_distributed: number | null;
  synced_at: string;
}

async function buildFoodBankSummaryRows(): Promise<FoodBankSummaryRow[]> {
  const now = clickhouseDateTimeNow();
  const { rows } = await pgPool.query(
    `SELECT id, name, meals_provided, pounds_distributed, counties_served FROM food_banks`
  );

  const summaryRows: FoodBankSummaryRow[] = [];
  for (const r of rows) {
    const counties: string[] = Array.isArray(r.counties_served) ? r.counties_served : [];
    if (counties.length === 0) {
      summaryRows.push({
        food_bank_id: r.id,
        name: r.name ?? "",
        county: "",
        meals_provided: r.meals_provided,
        pounds_distributed: r.pounds_distributed,
        synced_at: now,
      });
      continue;
    }
    for (const county of counties) {
      summaryRows.push({
        food_bank_id: r.id,
        name: r.name ?? "",
        county,
        meals_provided: r.meals_provided,
        pounds_distributed: r.pounds_distributed,
        synced_at: now,
      });
    }
  }
  return summaryRows;
}

export async function syncClickhouse(): Promise<{ demandProxyRows: number; foodBankRows: number }> {
  const demandProxyRows = await buildDemandProxyRows();
  const foodBankRows = await buildFoodBankSummaryRows();

  await clickhouse.command({ query: "TRUNCATE TABLE demand_proxy_by_county" });
  if (demandProxyRows.length > 0) {
    await clickhouse.insert({
      table: "demand_proxy_by_county",
      values: demandProxyRows,
      format: "JSONEachRow",
    });
  }

  await clickhouse.command({ query: "TRUNCATE TABLE food_bank_summary" });
  if (foodBankRows.length > 0) {
    await clickhouse.insert({
      table: "food_bank_summary",
      values: foodBankRows,
      format: "JSONEachRow",
    });
  }

  return { demandProxyRows: demandProxyRows.length, foodBankRows: foodBankRows.length };
}

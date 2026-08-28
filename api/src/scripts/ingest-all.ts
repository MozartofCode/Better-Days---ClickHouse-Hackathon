// Runs the one-time CKAN ingestion (CalICH + CHHS), then refreshes the
// ClickHouse reporting tables. Does NOT touch the Feeding America API —
// that integration is real-time/on-demand via the REST API
// (GET /api/community/food-banks), not part of this batch job, since
// directory-wide pulls burn parse.bot credits.

import { ingestCalich } from "../modules/community-data/ingest/calich";
import { ingestChhsBhCountyProfile } from "../modules/community-data/ingest/chhsBhCountyProfile";
import { syncClickhouse } from "../modules/community-data/etl/syncClickhouse";
import { pgPool } from "../db/postgres";
import { clickhouse } from "../db/clickhouse";

async function main(): Promise<void> {
  console.log("Ingesting CalICH (data.ca.gov)...");
  console.log(await ingestCalich());

  console.log("Ingesting CHHS BH county profile...");
  console.log(await ingestChhsBhCountyProfile());

  console.log("Syncing ClickHouse reporting tables...");
  console.log(await syncClickhouse());

  await pgPool.end();
  await clickhouse.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

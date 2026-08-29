import fs from "fs";
import path from "path";
import { pgPool } from "./postgres";
import { clickhouse } from "./clickhouse";

const POSTGRES_MIGRATIONS = [
  "001_postgres_init.sql",
  "002_postgres_community_data.sql",
  "003_postgres_operations_schema.sql",
  "004_mcp_oauth_schema.sql",
  "005_postgres_org_setup.sql",
  "006_postgres_generated_reports.sql",
  "007_postgres_data_source_tag.sql",
];
const CLICKHOUSE_MIGRATIONS = [
  "001_clickhouse_init.sql",
  "002_clickhouse_community_data.sql",
  "003_clickhouse_uploads_tag.sql",
];

async function migratePostgres() {
  for (const file of POSTGRES_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, "migrations", file), "utf-8");
    await pgPool.query(sql);
    console.log(`Postgres: applied ${file}`);
  }
}

async function migrateClickhouse() {
  for (const file of CLICKHOUSE_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(__dirname, "migrations", file), "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await clickhouse.command({ query: statement });
    }
    console.log(`ClickHouse: applied ${file}`);
  }
}

async function main() {
  await migratePostgres();
  await migrateClickhouse();
  await pgPool.end();
  await clickhouse.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

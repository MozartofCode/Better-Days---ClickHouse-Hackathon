import fs from "fs";
import path from "path";
import { pgPool } from "../src/db/postgres";
import { clickhouse } from "../src/db/clickhouse";

async function migratePostgres(): Promise<void> {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "001_init.sql"),
    "utf-8"
  );
  await pgPool.query(sql);
  console.log("Postgres: applied db/migrations/001_init.sql");
}

async function migrateClickhouse(): Promise<void> {
  const sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "clickhouse", "001_init.sql"),
    "utf-8"
  );
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await clickhouse.command({ query: statement });
  }
  console.log("ClickHouse: applied db/clickhouse/001_init.sql");
}

async function main(): Promise<void> {
  await migratePostgres();
  await migrateClickhouse();
  await pgPool.end();
  await clickhouse.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

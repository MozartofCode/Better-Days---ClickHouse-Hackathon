import { Pool } from "pg";
import { env } from "../config/env";

export const pgPool = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  database: env.postgres.database,
  user: env.postgres.user,
  password: env.postgres.password,
  ssl: env.postgres.ssl ? { rejectUnauthorized: false } : undefined,
});

import { createClient } from "@clickhouse/client";
import { env } from "../config/env";

export const clickhouse = createClient({
  url: env.clickhouse.host,
  database: env.clickhouse.database,
  username: env.clickhouse.user,
  password: env.clickhouse.password,
});

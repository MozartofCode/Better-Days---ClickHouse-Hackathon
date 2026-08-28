import { createClient } from "@clickhouse/client";
import { env } from "../config/env";

export const clickhouse = createClient({
  url: env.clickhouseUrl,
  username: env.clickhouseUser,
  password: env.clickhousePassword,
  database: env.clickhouseDatabase,
});

import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. See .env.example.`);
  }
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),

  clickhouseUrl: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
  clickhouseUser: process.env.CLICKHOUSE_USER ?? "default",
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD ?? "",
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE ?? "hackbetterdays",

  feedingAmericaApiKey: process.env.FEEDINGAMERICA_API_KEY ?? "",
  feedingAmericaBaseUrl:
    process.env.FEEDINGAMERICA_BASE_URL ??
    "https://api.parse.bot/scraper/dcbc6656-4d7d-4ca1-bc88-673b8184b594",

  port: Number(process.env.PORT ?? 3000),
};

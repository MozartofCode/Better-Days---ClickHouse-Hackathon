import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  apiPort: parseInt(process.env.API_PORT ?? "4000", 10),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  jwtSecret: required("JWT_SECRET", "dev_secret_change_me"),
  libreChatServiceApiKey: required("LIBRECHAT_SERVICE_API_KEY"),

  postgres: {
    host: required("POSTGRES_HOST", "localhost"),
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    database: required("POSTGRES_DB", "foodbank"),
    user: required("POSTGRES_USER", "foodbank"),
    password: required("POSTGRES_PASSWORD", "change_me"),
    // Hosted Postgres (e.g. Supabase) requires TLS; local Docker Postgres doesn't support it.
    // Auto-detects Supabase hosts, or set POSTGRES_SSL=true explicitly for other hosted providers.
    ssl: process.env.POSTGRES_SSL === "true" || /supabase\.co$/.test(process.env.POSTGRES_HOST ?? ""),
  },

  clickhouse: {
    host: required("CLICKHOUSE_HOST", "http://localhost:8123"),
    database: required("CLICKHOUSE_DB", "foodbank"),
    user: required("CLICKHOUSE_USER", "default"),
    password: required("CLICKHOUSE_PASSWORD", "change_me"),
  },

  feedingAmerica: {
    // Not set locally by default — get this from the teammate who owns it
    // (see README "Community & Demand Data"). Only /api/community/food-banks*
    // routes need it; demand-proxy and ingest routes work without it.
    apiKey: process.env.FEEDINGAMERICA_API_KEY ?? "",
    baseUrl:
      process.env.FEEDINGAMERICA_BASE_URL ??
      "https://api.parse.bot/scraper/dcbc6656-4d7d-4ca1-bc88-673b8184b594",
  },
};

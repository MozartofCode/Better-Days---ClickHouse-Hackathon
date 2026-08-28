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
  // Used server-side only, for the Ask Your Data narration step (demand-data
  // module). Never sent to the browser. Optional: query results and their
  // templated summaries still work with this unset — only the plain-language
  // wording falls back to a template instead of an LLM sentence.
  groqApiKey: process.env.GROQ_API_KEY ?? "",

  mcp: {
    // Public origin this API is reachable at. Used as the OAuth issuer and
    // as the RFC 8707 resource identifier tokens are bound to — must match
    // exactly what MCP clients see (not an internal docker service name).
    issuerUrl: required("MCP_ISSUER_URL", "http://localhost:4000"),
    resourceUrl: required("MCP_RESOURCE_URL", "http://localhost:4000/mcp"),
    accessTokenTtlSeconds: parseInt(process.env.MCP_ACCESS_TOKEN_TTL_SECONDS ?? "900", 10),
    refreshTokenTtlSeconds: parseInt(process.env.MCP_REFRESH_TOKEN_TTL_SECONDS ?? "2592000", 10),
    authCodeTtlSeconds: parseInt(process.env.MCP_AUTH_CODE_TTL_SECONDS ?? "120", 10),
  },

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
    // CLICKHOUSE_URL/CLICKHOUSE_DATABASE are the documented names in the
    // product spec; CLICKHOUSE_HOST/CLICKHOUSE_DB are what the rest of this
    // repo (docker-compose.yml, .env.example) already uses. Both work.
    host: process.env.CLICKHOUSE_URL ?? required("CLICKHOUSE_HOST", "http://localhost:8123"),
    database: process.env.CLICKHOUSE_DATABASE ?? required("CLICKHOUSE_DB", "foodbank"),
    user: required("CLICKHOUSE_USER", "default"),
    password: required("CLICKHOUSE_PASSWORD", "change_me"),
  },

  groq: {
    // Optional — recommendation narration falls back to the deterministic
    // template (recommendations.ts) whenever this is unset. groq.com is
    // OpenAI-compatible, not xAI's "Grok" — see operations/README.md.
    apiKey: process.env.GROQ_API_KEY ?? "",
    baseUrl: process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
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

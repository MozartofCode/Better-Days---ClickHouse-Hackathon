# Food Bank Backend

Backend API for the food bank dashboard app. Users register/log in, upload Excel spreadsheets
of their data, and view aggregated dashboards of that data.

## Stack
- **API**: Node.js + Express + TypeScript
- **PostgreSQL**: users, food banks, auth
- **ClickHouse**: uploaded spreadsheet row data, dashboard aggregation
- **LibreChat**: chat-over-data interface (runs as its own service, own Mongo)

## Running locally

```bash
cp .env.example .env   # edit values as needed
docker compose up --build
```

This starts: `postgres` (5432), `clickhouse` (8123/9000), `librechat-mongo`, `librechat` (3080), `api` (4000).

On first run, apply DB migrations (creates tables in both Postgres and ClickHouse):

```bash
docker compose exec api npm run migrate
```

Health check: `GET http://localhost:4000/health`

## API contract (for frontend)

All routes are prefixed with `/api`. Authenticated routes require header:
`Authorization: Bearer <token>`.

### Auth

**`POST /api/auth/register`**
```json
{
  "email": "jane@examplefoodbank.org",
  "password": "at-least-8-chars",
  "firstName": "Jane",
  "lastName": "Doe",
  "role": "admin",       // "admin" | "staff"
  "foodBankName": "Example Food Bank"
}
```
→ `201 { token, user }`. If `foodBankName` already exists, the new user is attached to that
existing food bank (shared org, multi-user).

**`POST /api/auth/login`**
```json
{ "email": "jane@examplefoodbank.org", "password": "..." }
```
→ `200 { token, user }`

**`GET /api/auth/me`** (auth required) → `200 { user }`

`user` shape:
```ts
{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "staff";
  foodBankId: string;
  foodBankName: string;
}
```

### Uploads

**`POST /api/uploads`** (auth required) — multipart/form-data, field name `file`, `.xlsx`/`.xls`/`.csv`, max 25MB.
→ `201 { id, filename, columns, rowCount }`

**`GET /api/uploads`** (auth required) → `200 { uploads: [{ id, filename, columns, row_count, uploaded_at }] }`

Scoped automatically to the caller's food bank — one food bank never sees another's uploads.

### Dashboard

**`GET /api/dashboard/summary`** (auth required)
→ `200 { totalUploads, totalRows, lastUploadAt, recentUploads }`

**`GET /api/dashboard/uploads/:id?page=1&pageSize=50`** (auth required)
→ `200 { upload, rows: [{ row_number, data }], page, pageSize }`

`data` is a key/value object matching the spreadsheet's own column headers — headers vary by
food bank/spreadsheet, so nothing is hardcoded on the backend.

### Actions (LibreChat only)

**`GET /api/actions/food-banks`**, **`GET /api/actions/dashboard-summary?foodBankName=...`**,
**`GET /api/actions/uploads?foodBankName=...`**, **`GET /api/actions/uploads/:id/rows?foodBankName=...`**

These mirror the dashboard/uploads endpoints above but are auth'd with a shared secret
(`X-API-Key` header) instead of a user JWT, and take `foodBankName` as a query param instead of
reading it from a logged-in session — see "LibreChat Integration" below for why and how they're
used. Not part of the frontend contract; frontend should keep using the JWT-based endpoints above.

## LibreChat Integration

Lets staff ask natural-language questions in LibreChat ("How many households has Example Food
Bank served?") and get answers pulled live from ClickHouse, via LibreChat's **Actions** feature
(an agent calling an external API through an OpenAPI schema).

**Known limitation (v1):** Actions in LibreChat authenticate as themselves, not as a specific
logged-in staff member — there's no per-user JWT inside an action call. So this uses a single
**shared service API key** instead, and the LLM scopes each query by food bank *name* (pulled
from the conversation), not from a logged-in session. Good enough to demo and use today.

**This has since been superseded by a real per-user OAuth solution** — see `modules/mcp/` and
`modules/oauth/`, and [`../README_START.md`](../README_START.md) for setup. The MCP server derives
`foodBankId` from the signed-in user's own token, never a client-supplied name, and works with
Claude and ChatGPT as well as LibreChat. This `actions/` module is kept running only as a fallback
until LibreChat is cut over to talking MCP directly.

**Setup:**
1. Generate a secret and put it in `.env` as `LIBRECHAT_SERVICE_API_KEY` (already done if you
   ran `openssl rand -hex 32` — see `.env.example`), then `docker compose up -d --build api`.
2. Start LibreChat: `docker compose up -d librechat-mongo librechat` (open `http://localhost:3080`,
   create an account, needs at least one LLM provider API key configured for LibreChat itself).
3. In LibreChat, create an **Agent**, add an **Action**, and import the schema from
   [`openapi/librechat-actions.yaml`](openapi/librechat-actions.yaml) (paste its contents
   or the file path when prompted).
4. Set the Action's auth type to **API Key**, header name `X-API-Key`, value = the same secret
   from step 1.
5. If LibreChat is running outside Docker's network from the API (e.g. you access it from your
   host browser), the schema's `servers.url` (`http://localhost:4000/api/actions`) already works
   for that case; if LibreChat itself calls the API from *inside* Docker, change it to
   `http://api:4000/api/actions` instead.

**Try it** — ask the agent things like:
- "What food banks are in the system?"
- "How many households has Example Food Bank served in total?"
- "List the recent uploads for Example Food Bank."

## Community & Demand Data

Absorbed from a teammate's standalone `demand-data-service` (California homelessness/housing
"demand proxy" data + a Feeding America food bank directory) — folded into this API so it shares
the same Postgres/ClickHouse connections instead of running as a second process. Answers "how
much need is there near this pantry, and who else serves it."

**Endpoints** (all under `/api/community`):
- `GET /demand-proxy/counties` — public. Aggregated demand-proxy metrics by county/CoC (reads ClickHouse).
- `GET /demand-proxy/counties/:county` — public. Full detail rows for one county/CoC (e.g. `CA-500`, or a lowercase county name for CHHS rows).
- `GET /food-banks?zip=94110` or `?state=CA` — public. Live Feeding America directory search (no caching on the search itself).
- `GET /food-banks/:slug` — public. Live Feeding America profile (e.g. `greater-chicago-food-depository`), upserts into `feeding_america_food_banks`.
- `POST /ingest/:source` (`calich` | `chhs`) — **requires `X-API-Key`** (same shared service key as the LibreChat actions above). Re-runs one-time ingestion on demand; does not refresh ClickHouse — run `npm run etl:clickhouse` after.

**Important naming note:** `feeding_america_food_banks` (Postgres) is a cache of the *public*
Feeding America directory — completely unrelated to this app's own `food_banks` table (the
tenant orgs whose staff register/log in/upload spreadsheets). Don't confuse the two.

**Data flow:** CalICH + CHHS ingestion pulls from public `data.ca.gov`/`data.chhs.ca.gov` CKAN
APIs (no credentials needed) into Postgres, then `npm run etl:clickhouse` truncates and reloads
two ClickHouse reporting tables (`demand_proxy_by_county`, `food_bank_summary`) from it. Feeding
America lookups are real-time/on-demand via the API, not part of the batch ingest (keeps
parse.bot credit usage down).

**Setup:**
```bash
docker compose exec api npm run migrate      # applies all migrations, incl. community-data tables
docker compose exec api npm run ingest:all   # CalICH + CHHS ingest, then ClickHouse sync
```
`FEEDINGAMERICA_API_KEY` is **not set by default** — get it from the teammate who owns it before
the `/food-banks*` routes will work (`.env.example` has the placeholder + where to look). Everything
else in this section works without it.

## Notes for frontend integration
- CORS is open (`*`) in dev — adjust `CORS_ORIGIN` in `.env` for production.
- JWT expires after 7 days; there's no refresh-token flow yet.
- Errors are always `{ error: string }` (validation errors also include `details`), with an
  appropriate HTTP status code.

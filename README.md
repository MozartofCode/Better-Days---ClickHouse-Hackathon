# Pana — Food Bank Reconciliation

A pantry-ops app: food banks sign up, upload their inventory/visits/household spreadsheets, get
an instant reconciliation + data-quality report in the browser, and can revisit past uploads from
a real account. Two parts live in this repo:

- **`/` (this root)** — the Next.js frontend ("Pana"): sign up/sign in, drag-and-drop upload,
  column-mapping confirmation, and the reconciliation/variance/exceptions report.
- **`api/`** — the backend: Node.js + Express + TypeScript, PostgreSQL (users/food banks/auth),
  ClickHouse (uploaded spreadsheet rows + dashboard aggregation), plus a LibreChat chat-over-data
  integration and absorbed community/demand-data ingestion. See [`api/README.md`](api/README.md)
  for the full API contract, endpoints, and setup.

## Running locally

**1. Backend** (Postgres, ClickHouse, LibreChat, API — via Docker):
```bash
cp .env.example .env   # edit values as needed (see "Secrets" below)
docker compose up -d --build
docker compose exec api npm run migrate   # first run only — creates Postgres + ClickHouse tables
```
This starts `postgres` (5432), `clickhouse` (8123/9000), `librechat-mongo`, `librechat` (3080),
and `api` (4000). Check everything is healthy:
```bash
docker compose ps                                   # all should show "Up" / "healthy"
curl http://localhost:4000/health                    # {"status":"ok"}
curl -o /dev/null -w '%{http_code}\n' http://localhost:8123/ping   # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:3080        # 200
```

Optional: pull in community/demand data (California homelessness + Feeding America directory):
```bash
docker compose exec api npm run ingest:all
```

**2. Frontend** (Next.js):
```bash
cp .env.local.example .env.local   # points the frontend at the api above + Groq key
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

The frontend talks to the backend over `NEXT_PUBLIC_API_URL` (`.env.local`) for auth, uploads,
and dashboard history; reconciliation/quality checks themselves still run client-side in the
browser. See [`api/README.md`](api/README.md) for the full `/api/*` contract.

### Secrets you need to fill in

`.env.example` / `.env.local.example` are templates — copy them to `.env` / `.env.local` and fill
these in:

| Variable | Where | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | `.env` | Postgres password (any value in dev; a real secret in prod) |
| `CLICKHOUSE_PASSWORD` | `.env` | ClickHouse password |
| `JWT_SECRET` | `.env` | Signs this app's own auth tokens (`openssl rand -hex 32`) |
| `LIBRECHAT_SERVICE_API_KEY` | `.env` | Shared secret LibreChat's Action uses to call `/api/actions/*` (`openssl rand -hex 32`) |
| `LIBRECHAT_JWT_SECRET`, `LIBRECHAT_JWT_REFRESH_SECRET` | `.env` | LibreChat's own session auth — **not** the same as this app's `JWT_SECRET` (`openssl rand -hex 32` each) |
| `LIBRECHAT_CREDS_KEY` (64 hex chars) / `LIBRECHAT_CREDS_IV` (32 hex chars) | `.env` | Encrypts credentials LibreChat stores in Mongo — must be *exactly* these lengths or LibreChat refuses to boot (`openssl rand -hex 32` / `openssl rand -hex 16`) |
| `GROQ_API_KEY` | `.env` **and** `.env.local` | Powers LibreChat's "Groq" model, the frontend's `/api/chat`, and `/api/ocr`. Get one free at [console.groq.com/keys](https://console.groq.com/keys) |
| `FEEDINGAMERICA_API_KEY` | `.env` | Only needed for `/api/community/food-banks*`; ask the teammate who owns it |

Without `GROQ_API_KEY`, LibreChat still boots (Postgres/ClickHouse/Actions all work), but its
"Groq" model and the frontend's chat/photo-upload features will return a "needs a Groq API key"
error until you add it and restart (`docker compose restart librechat` / `npm run dev`).

### LibreChat: chat-over-your-data

`librechat.yaml` (repo root, mounted into the `librechat` container) registers Groq as a custom
OpenAI-compatible model provider (`https://api.groq.com/openai/v1`). Once `GROQ_API_KEY` is set:

1. Open [http://localhost:3080](http://localhost:3080), register a LibreChat account (local to
   LibreChat's own Mongo — separate from Pana's Postgres users), and pick **Groq** as the endpoint.
2. To let it answer questions from *this app's* data (e.g. "how many households has Example Food
   Bank served?"), create an **Agent**, add an **Action**, and import
   [`api/openapi/librechat-actions.yaml`](api/openapi/librechat-actions.yaml) — full walkthrough in
   [`api/README.md`](api/README.md#librechat-integration).

## Deploying to production

The local Docker setup runs everything on one machine. In production the pieces split across
four platforms — Vercel can't run Postgres/ClickHouse/LibreChat (no persistent servers), so:

| Piece | Platform | Why |
|---|---|---|
| Frontend (Next.js) | **Vercel** | Purpose-built for Next.js, zero-config |
| API + LibreChat | **Railway** | Deploys straight from this repo's Dockerfiles, one dashboard |
| Postgres | **Supabase** | Managed Postgres; a project (`pana-foodbank`) is already provisioned |
| ClickHouse | **ClickHouse Cloud** | Managed ClickHouse |
| LibreChat's Mongo | **Railway** (Mongo template) or **MongoDB Atlas** | LibreChat needs its own Mongo |

### 1. Postgres (Supabase) — already done

A Supabase project **`pana-foodbank`** (ref `malztlathqjybusviwvi`, region `us-east-1`) has been
created and both Postgres migrations applied. You still need the DB password (not retrievable via
the Supabase MCP tool for security — Supabase never exposes it after creation):

1. [supabase.com/dashboard/project/malztlathqjybusviwvi/settings/database](https://supabase.com/dashboard/project/malztlathqjybusviwvi/settings/database)
2. Under **Connection string**, reset/copy the database password.
3. You'll set these as Railway env vars on the API service (step 3 below):
   ```
   POSTGRES_HOST=db.malztlathqjybusviwvi.supabase.co
   POSTGRES_PORT=5432
   POSTGRES_DB=postgres
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=<from the dashboard>
   POSTGRES_SSL=true
   ```
   (`POSTGRES_SSL` is required for Supabase — the API now supports it, and auto-detects
   `*.supabase.co` hosts even without the flag.)

**Security note:** Supabase flagged Row Level Security as disabled on all 7 tables — normally a
critical issue since it means the `anon`/`authenticated` keys can read/write everything. This app
never exposes those keys or Supabase's client libraries to the browser (the frontend only talks to
your own Express API, which connects as the Postgres superuser), so it's not an active exposure
today — but don't start using `@supabase/supabase-js` from the frontend against this project
without enabling RLS and writing policies first.

### 2. ClickHouse (ClickHouse Cloud)

1. Create a service at [clickhouse.cloud](https://clickhouse.cloud) (any region close to Railway's,
   e.g. `us-east-1`). Free trial credits cover a hackathon demo comfortably.
2. From the service's **Connect** tab, grab the HTTPS host (`https://<id>.<region>.aws.clickhouse.cloud:8443`),
   `default` user, and password.
3. Run the two ClickHouse migrations against it once (from your machine, pointed at the cloud
   instance instead of local Docker):
   ```bash
   cd api
   CLICKHOUSE_HOST=https://<id>.<region>.aws.clickhouse.cloud:8443 \
   CLICKHOUSE_DB=default \
   CLICKHOUSE_USER=default \
   CLICKHOUSE_PASSWORD=<from Connect tab> \
   POSTGRES_HOST=db.malztlathqjybusviwvi.supabase.co POSTGRES_SSL=true \
   POSTGRES_DB=postgres POSTGRES_USER=postgres POSTGRES_PASSWORD=<supabase password> \
   LIBRECHAT_SERVICE_API_KEY=x npx ts-node src/db/migrate.ts
   ```
   (this runs both the Postgres and ClickHouse migrations in one pass; harmless to re-run against
   the already-migrated Supabase project since every statement is `IF NOT EXISTS`.)
4. Note the host/user/password — you'll set them as Railway env vars next.

### 3. API + LibreChat (Railway)

Push this repo to GitHub first if it isn't already, then in the Railway dashboard:

**API service:**
1. New Project → Deploy from GitHub repo → pick this repo.
2. Root directory: `api`. Railway auto-detects `api/Dockerfile`.
3. Add a **Generate Domain** (Settings → Networking) so you get a public URL — note it, the
   frontend needs it as `NEXT_PUBLIC_API_URL`.
4. Set environment variables (Variables tab):
   ```
   POSTGRES_HOST=db.malztlathqjybusviwvi.supabase.co
   POSTGRES_PORT=5432
   POSTGRES_DB=postgres
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=<supabase password>
   POSTGRES_SSL=true
   CLICKHOUSE_HOST=https://<id>.<region>.aws.clickhouse.cloud:8443
   CLICKHOUSE_DB=default
   CLICKHOUSE_USER=default
   CLICKHOUSE_PASSWORD=<clickhouse cloud password>
   API_PORT=4000
   JWT_SECRET=<openssl rand -hex 32>
   CORS_ORIGIN=https://<your-vercel-domain>.vercel.app
   LIBRECHAT_SERVICE_API_KEY=<same value you'll use in the LibreChat Action, step 4>
   ```

**LibreChat service** (same Railway project, "New Service"):
1. Deploy from the same GitHub repo, but set **Dockerfile Path** to `deploy/librechat/Dockerfile`
   and **Root Directory** to `.` (repo root) — this custom Dockerfile (already in the repo) bakes
   `librechat.yaml` into the official LibreChat image, since Railway can't mount a local file like
   `docker compose` does.
2. Add a Mongo database to the project (New → Database → Add MongoDB), then set on the LibreChat
   service:
   ```
   HOST=0.0.0.0
   PORT=3080
   MONGO_URI=${{MongoDB.MONGO_URL}}     # Railway variable reference to the Mongo service
   JWT_SECRET=<openssl rand -hex 32>            # different from the API's JWT_SECRET
   JWT_REFRESH_SECRET=<openssl rand -hex 32>
   CREDS_KEY=<openssl rand -hex 32>             # must be exactly 64 hex chars
   CREDS_IV=<openssl rand -hex 16>              # must be exactly 32 hex chars
   GROQ_API_KEY=<your Groq key>
   ```
3. Generate a public domain for it too (Settings → Networking) if staff should access LibreChat
   directly.

### 4. Frontend (Vercel)

1. [vercel.com/new](https://vercel.com/new) → import this GitHub repo. Root directory: `/` (repo
   root, default) — Vercel auto-detects Next.js.
2. Project → Settings → Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://<your-railway-api-domain>.up.railway.app
   GROQ_API_KEY=<your Groq key>
   ```
3. Deploy. Once live, go back to the Railway API service and set `CORS_ORIGIN` to the resulting
   `https://<project>.vercel.app` domain (or `*` while testing, then lock it down).

### 5. Wire up the LibreChat Action

Same as local (see [`api/README.md`](api/README.md#librechat-integration)), except:
- In `api/openapi/librechat-actions.yaml`, change `servers.url` from `http://localhost:4000/api/actions`
  to your Railway API's public URL + `/api/actions`.
- Set the Action's API key to the `LIBRECHAT_SERVICE_API_KEY` you put on the Railway API service.
## MCP + OAuth (agentic chat integration)

Claude, ChatGPT, and LibreChat can query/update a signed-in user's own food bank data through an
MCP server with self-hosted OAuth. **Read [`README_START.md`](README_START.md) before deploying**
— it covers the env vars and one-time setup steps this needs beyond what's above. In the app
itself, see the "Connect AI chat" page (`/settings/mcp`) for the end-user instructions.

## Stack
- **Frontend**: Next.js (App Router), React, Tailwind — client-side spreadsheet parsing,
  column mapping, reconciliation, and data-quality engines.
- **API**: Node.js + Express + TypeScript.
- **PostgreSQL**: users, food banks, auth.
- **ClickHouse**: uploaded spreadsheet row data, dashboard aggregation, community/demand-proxy data.
- **LibreChat**: chat-over-data interface (runs as its own service, own Mongo).

## Repo layout
```
src/            Next.js app (frontend)
public/
api/            Backend (Express API) — see api/README.md
specs/          Product/hackathon specs
docker-compose.yml
librechat.yaml  LibreChat config — registers Groq as a custom model endpoint
deploy/         Production-only deploy configs (e.g. LibreChat Dockerfile for Railway)
```

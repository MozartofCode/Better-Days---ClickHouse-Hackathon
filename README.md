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
cp .env.example .env   # edit values as needed
docker compose up --build
docker compose exec api npm run migrate   # first run only
```
This starts `postgres` (5432), `clickhouse` (8123/9000), `librechat-mongo`, `librechat` (3080),
and `api` (4000). Health check: `GET http://localhost:4000/health`.

**2. Frontend** (Next.js):
```bash
cp .env.local.example .env.local   # points the frontend at the api above
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

The frontend talks to the backend over `NEXT_PUBLIC_API_URL` (`.env.local`) for auth, uploads,
and dashboard history; reconciliation/quality checks themselves still run client-side in the
browser. See [`api/README.md`](api/README.md) for the full `/api/*` contract.

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
```

# demand-data-service

Collects California homelessness/housing "demand proxy" data and food bank
profile data, so the product can eventually answer "how much need is there
near this pantry, and who else serves it." This is a **separate service from
the main backend** (which someone else on the team owns) — it's a standalone
ingestion + reporting API that the main backend can call or absorb later.

This README is written for whoever is wiring up the real Postgres and
ClickHouse instances — hand it to your AI agent as-is, it has everything
needed to integrate.

## What already exists (do not rebuild)

- **Ingestion** (`src/ingest/`): pulls CalICH homelessness data and CHHS
  behavioral-health/county data from their public CKAN APIs, and Feeding
  America food bank profiles from a parse.bot proxy, into Postgres.
- **ETL** (`src/etl/syncClickhouse.ts`): truncate-and-reload job that rolls
  the Postgres tables into two ClickHouse reporting tables.
- **REST API** (`src/api/`): Express app exposing all of the above.
- **Schemas**: `db/migrations/001_init.sql` (Postgres), `db/clickhouse/001_init.sql`
  (ClickHouse). Both are already correct and tested against the live data
  sources — do not redesign them, just apply them.

Everything above has been run end-to-end against real Postgres/ClickHouse
containers and the live data sources (CalICH, CHHS, Feeding America) during
development. The only thing missing is **your team's actual database
connection details** — that's the integration task.

## What you need to do

1. Point `DATABASE_URL` at your real Postgres instance (or spin one up).
2. Point `CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` /
   `CLICKHOUSE_DATABASE` at your real ClickHouse instance.
3. Run `npm run migrate` — applies both schema files as-is.
4. Decide whether this service runs standalone (its own `npm run dev` /
   deploy) or gets merged into the main backend's process. Nothing in this
   codebase assumes either — `src/api/server.ts` is a self-contained Express
   app, `src/db/postgres.ts` and `src/db/clickhouse.ts` are plain client
   singletons that can be imported from elsewhere if you fold this in.

Nothing here needs redesigning — it's a connection-string problem, not an
architecture problem.

## Environment variables

```bash
cp .env.example .env
```

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string |
| `CLICKHOUSE_URL` | No (default `http://localhost:8123`) | ClickHouse HTTP endpoint |
| `CLICKHOUSE_USER` | No (default `default`) | |
| `CLICKHOUSE_PASSWORD` | No (default empty) | |
| `CLICKHOUSE_DATABASE` | No (default `hackbetterdays`) | |
| `FEEDINGAMERICA_API_KEY` | Yes, for `/api/food-banks*` routes | **Not committed to this repo — it's a live credential.** Get it from Ankit directly (Parse dashboard → Settings → API Keys, starts with `pmx_`). Verified working against the live API as of 2026-08-28. |
| `FEEDINGAMERICA_BASE_URL` | No | Already correct in `.env.example`: `https://api.parse.bot/scraper/dcbc6656-4d7d-4ca1-bc88-673b8184b594` |
| `PORT` | No (default `3000`) | |

## Commands

```bash
npm install
npm run migrate        # applies db/migrations/001_init.sql + db/clickhouse/001_init.sql
npm run ingest:all      # pulls CalICH + CHHS live data into Postgres, then syncs ClickHouse
npm run dev              # starts the API
npm run etl:clickhouse  # re-run just the Postgres -> ClickHouse sync, e.g. after a re-ingest
```

`npm run build && npm run start` for a compiled run instead of `ts-node`.

## API

- `GET /api/health`
- `GET /api/demand-proxy/counties` — aggregated demand-proxy metrics by county/CoC (reads ClickHouse)
- `GET /api/demand-proxy/counties/:county` — full detail rows for one county/CoC (e.g. `CA-500`, or a lowercase county name for the CHHS rows)
- `GET /api/food-banks?zip=94110` or `?state=CA` — live Feeding America search (no caching on the search itself)
- `GET /api/food-banks/:slug` — live Feeding America profile (e.g. `greater-chicago-food-depository`), upserts into `food_banks`
- `POST /api/ingest/calich` / `POST /api/ingest/chhs` — re-run one-time ingestion on demand (does not refresh ClickHouse — run `npm run etl:clickhouse` after)

## Data model

**Postgres (operational)** — raw ingested rows, source of truth:
`ca_homelessness_counts`, `ca_system_performance_measures`,
`chhs_bh_county_profile`, `food_banks`, `ingestion_runs` (audit log of every
ingestion run: source, row count, status, error).

**ClickHouse (reporting only)** — never written to directly, only via the
ETL: `demand_proxy_by_county` (one row per county/CoC + metric), `food_bank_summary`
(one row per food bank + county it serves, for joining against demand
proxies). Re-run `npm run etl:clickhouse` any time Postgres changes; it's a
full truncate + reload, not incremental.

## Data sources

| Source | What it is | Access |
|---|---|---|
| CalICH homelessness demographics (`data.ca.gov`) | Yearly counts of people receiving homeless response services, by Continuum of Care, broken out by gender/race/age | CKAN `datastore_search` API, no auth |
| CalICH system performance measures (`data.ca.gov`) | HUD system performance measures, statewide and by CoC | Same, no auth |
| CHHS BH county profile — homelessness resource (`data.chhs.ca.gov`) | County-level behavioral-health/housing service dimensions | Same CKAN API shape, no auth |
| Feeding America profiles (via parse.bot) | Food bank directory + profiles: contact info, meals/pounds distributed, counties served, hunger statistics | REST, `X-API-Key` header, metered (free tier: 200 credits/mo, 5 req/min) |
| FRAC SNAP county map | SNAP participation by county | **Not integrated** — see "Known gaps" below |

## Known gaps

- **FRAC SNAP county data is not integrated.** The FRAC map page has no
  discovered CSV/JSON download or API — it's a static interactive map over
  2017–2021 ACS data. To add it later, pull the underlying SNAP-receipt
  table directly from the Census ACS API (`data.census.gov`) rather than
  scraping FRAC's page, which has no stable structure to scrape.
- **No auth or rate limiting on this API.** Fine for local/hackathon use,
  add before deploying anywhere shared.
- **The ClickHouse ETL is truncate-and-reload, not incremental.** Simplest
  correct thing for the current data volume; revisit if ingestion grows
  large.
- **Feeding America search results aren't cached**, only `get_food_bank_details`
  is (cache-aside into `food_banks`). Intentional — the user asked for the
  directory lookups to always be real-time.

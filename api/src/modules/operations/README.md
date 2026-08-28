# Operations module

Backend + frontend for the "Operations Intelligence" dashboard + one-click
report generation spec. Built in three rounds:

1. **Schema + reconciliation + calculation engine** (`calculations.ts`,
   `exceptions.ts`, `recommendations.ts`, migration `003`).
2. **Reasoning agent + report generation** (`reasoning/`, `reports/`).
3. **ETL + live routes + UI** (`etl.service.ts`, `dashboardData.service.ts`,
   `exceptionsPersistence.service.ts`, `reportData.service.ts`,
   `reportsPersistence.service.ts`, `operations.controller.ts`,
   `operations.routes.ts`, migration `006`, and
   `src/app/dashboard/operations/page.tsx` on the frontend). This is the
   round that makes the feature actually usable end-to-end — real upload,
   real dashboard, real PDF, real resolve/assign UI, all live-tested.

Still missing: RBAC beyond tenant scoping, audit logging, the other 4 report
templates, distribution/volunteer/household data sources. See "Not built
yet" below.

## What's here

- **`../../db/migrations/003_postgres_operations_schema.sql`** — the 13-entity
  canonical schema from the spec (Site, Program, Item, InventoryLot,
  InventoryTransaction, DistributionEvent, DistributionLine,
  HouseholdServiceAggregate, VolunteerShift, ReconciliationException,
  DataSource, ReportConfiguration), plus Organization fields added onto the
  existing `food_banks` table rather than a duplicate table — `food_banks`
  was already the tenant/org table `users.food_bank_id` points at. Applied
  and verified idempotent against a real Postgres 16 instance. **Tables
  start empty** — nothing ETLs the existing `uploads`/`upload_rows`
  (ClickHouse, flat Jotform-style inventory) into this richer schema yet.
- **`types.ts`** — TypeScript mirror of every table, camelCase, matching this
  repo's existing convention (see `dashboard.service.ts`) of hand-mapping DB
  rows rather than using an ORM.
- **`calculations.ts`** — every formula from the spec's "RECONCILIATION AND
  CALCULATION RULES" section as a pure function: `usableQuantity`,
  `inventoryBalanceCheck`, `distributionFulfillmentRate`, `daysOfCoverage`,
  `findNearExpiryLots`, `shortfallSurplusByCategory`,
  `reconciliationMatchRate`, `dataCompleteness`, `dataFreshness`,
  `unresolvedExceptionCount`, `exceptionSeverityCounts`, `volunteerGap`,
  `monthOverMonthDelta`, and a `forecastValue` stub that always returns
  `insufficient_data` (forecasting needs a real historical model, not built
  yet). Every function that can legitimately lack an input returns a
  `CalculatedMetric<T>` (`{ value, status, missingDataReason }`) instead of
  silently defaulting to zero — per the spec: "Never substitute zero."
- **`exceptions.ts`** — one detector per `exception_type` the schema's CHECK
  constraint allows (all 13: missing receiving record, inventory/distribution
  mismatch, unit conversion mismatch, duplicate item, unmapped item, missing
  expiry date, missing lot number, stale source, unconfirmed outbound
  distribution, negative inventory, duplicate distribution record, unknown
  site, unmapped column). Pure functions: canonical entities in,
  `DetectedException[]` out.
- **`recommendations.ts`** — deterministic ranking that turns exceptions +
  near-expiry lots + volunteer gaps + category shortfalls into candidates,
  then picks exactly the top three by the spec's 5-tier priority order
  (imminent risk → near-expiry → material reconciliation problem →
  volunteer/execution → demand/procurement), tie-broken by severity. This is
  the "calculate deterministically before passing to the AI" hand-off
  boundary — every field is built from real evidence; nothing is invented.
  `title`/`recommendedAction`/`whyNow` are template-generated from that
  evidence for now. A future LLM integration can replace the templating with
  generated prose, but must keep reading only the same aggregated evidence
  objects, never raw unreconciled records (per the spec's "AI INTELLIGENCE
  REQUIREMENTS").

- **`reasoning/groqClient.ts` + `reasoning/narrateRecommendations.ts`** — the
  narrative layer. Uses **Groq** (groq.com, OpenAI-compatible API,
  `openai/gpt-oss-120b`) — not xAI's "Grok," same name spoken aloud but a
  different product; confirmed against the live API before wiring in. Takes
  the already-ranked `Recommendation[]` from `recommendations.ts` and asks
  the model to rewrite only `title`/`recommendedAction`/`whyNow` into better
  prose. Guardrails: the model receives only that one recommendation's own
  evidence (never other candidates', never raw entities); any numeric token
  in the output that doesn't already appear in the input is rejected outright
  (not sanitized — the whole rewrite is discarded); any failure (no API key,
  network error, invalid JSON) falls back to the deterministic template
  untouched. `recommendations.ts` itself was not changed — it's still a pure
  function; this wraps its output.
- **`reports/`** — One-Click Report Generation. `types.ts` defines
  `ReportDocument`/`ReportSection`/the data-quality gate
  (`evaluateDataQualityGate`, BLOCKING/WARNING/INFORMATIONAL per the spec).
  `registry.ts` documents metadata for all 6 template IDs. Two are fully
  implemented end-to-end (data builder → gate → PDF):
  - `distributionReadinessBrief.ts` (`distribution_readiness_brief`)
  - `monthlyOperationsReconciliation.ts` (`monthly_operations_reconciliation`)
    — structurally modeled on the USDA/TEFAP monthly distribution report
    format the user linked (beginning/received/distributed/ending balance by
    commodity), which maps directly onto `calculations.ts`'s
    `inventoryBalanceCheck`.
  `pdf/renderPdf.ts` renders a real native PDF (pdfkit, not HTML
  screenshotted) with header/footer (org, period, generation timestamp),
  page numbers, a repeating-header table renderer, a diagonal DRAFT
  watermark, and always includes "Data Notes and Limitations" +
  "Source and Methodology Appendix" sections. `generateReport.ts`
  orchestrates gate → render → write to `api/generated-reports/` (gitignored)
  using the spec's `{org_slug}_{template_id}_{start}_{end}_v{version}.pdf`
  filename format. A report with blocking data-quality issues is refused
  (returns `status: "blocked"`, no PDF written) unless `forceIncomplete` is
  passed, in which case it's watermarked "INCOMPLETE DRAFT" instead.
  The other 4 templates (`board_impact_report`, `grant_progress_report`,
  `tefap_draft_review_packet`, `network_partner_allocation_report`) are
  registered in `registry.ts` with their required fields but have no builder
  yet.

## Verified

`npm run verify:operations` reproduces the spec's own "SAMPLE DASHBOARD
CONTENT" worked example end-to-end (14-case produce receiving discrepancy →
missing_receiving_record; 38-case yogurt 3 days from expiry; 2-person
volunteer gap; 96-vs-120 produce shortfall) and asserts the top-3
recommendation ranking matches the spec's example exactly, including the
produce-shortfall candidate correctly losing its spot to the volunteer-gap
candidate. There's no test framework in this project yet (no jest/vitest);
this follows the existing convention of small `ts-node` scripts.

The migration was also applied against a throwaway Postgres 16 container and
confirmed idempotent (safe to re-run, matching `db/migrate.ts`'s
run-unconditionally pattern).

`npm run verify:reasoning` (requires `GROQ_API_KEY`) runs the same worked
example through the live Groq API and prints template vs. narrated output
side by side — verified live: better prose, zero rejected/invented numbers
across all three recommendations.

`npm run verify:reports` builds both implemented report templates from
fixture data (including a second fixture reproducing the pantry-mvp spec's
own USDA worked example: 2000 beginning + 5000 received − 4200 distributed −
400 transferred − 15 spoilage = 2385 expected, physical count 2100 → 285 lb
variance) and asserts: neither is incorrectly blocked, both produce a
well-formed PDF (`%PDF-` header, real byte size) at the correct filename, and
a report with missing org/period is correctly blocked with no PDF written.

## Round 3: ETL, live routes, and UI

- **`etl.service.ts`** — bridges the existing upload pipeline (ClickHouse
  `uploads`/`upload_rows`, flat Jotform-style rows) into `items`/
  `inventory_lots`. Runs lazily on every `GET /api/operations/dashboard`
  (idempotent — dedupes on `data_sources.source_row_reference = upload.id`).
  Honest limitation, load-bearing for what reports can say: the Jotform
  template has no beginning/received/distributed/transaction history, only a
  point-in-time snapshot, so this ETL populates Item + InventoryLot only —
  never a synthesized InventoryTransaction, DistributionEvent, or
  VolunteerShift, because that would mean inventing history that was never
  recorded.
- **`dashboardData.service.ts`** — assembles `GET /api/operations/dashboard`:
  syncs uploads, runs the exception detectors, persists new ones, ranks
  recommendations, narrates via Groq if `GROQ_API_KEY` is set.
- **`exceptionsPersistence.service.ts`** — the exception queue's DB layer.
  Dedupes on `(organization_id, exception_type, affected_item_id,
  affected_inventory_lot_id)` **regardless of status** — a live bug caught
  during testing: dedup used to exclude resolved/not_applicable rows, so
  resolving an exception whose underlying data condition was still true
  (e.g. a lot still has no lot number) got silently reopened on the very
  next dashboard load. Fixed and re-verified live: resolving now sticks.
- **`reportData.service.ts`** — builds real `ReportDocument`s from live data
  instead of fixtures. Both implemented templates legitimately hit a
  BLOCKING data-quality issue against real uploaded data today (no
  DistributionEvent → no next-distribution date; no InventoryTransaction →
  no beginning/ending balance) — confirmed live, this is correct behavior,
  not a bug: the system refuses to fabricate a distribution date or a
  balance that was never recorded, exactly per spec.
- **`reportsPersistence.service.ts`** — `generated_reports` (migration
  `006`), the tenant boundary for downloads. A report's `organization_id` is
  checked against the requesting user's `foodBankId` before a file is ever
  served — verified live with two separate registered food banks: org B got
  a 404 trying to download org A's report by id, and org B's own dashboard
  showed zero items/exceptions despite org A having 10 of each.
- **`operations.controller.ts` / `.routes.ts`**, mounted at `/api/operations`
  in `app.ts`: `GET /dashboard`, `GET /exceptions`,
  `PATCH /exceptions/:id` (assign/resolve/not_applicable),
  `POST /reports/:templateId` (`forceIncomplete: true` for a watermarked
  incomplete draft when blocked), `GET /reports`,
  `GET /reports/:id/download`.
- **Frontend**: `src/app/dashboard/operations/page.tsx` — readiness card, top
  three recommendation cards (with an evidence expand/collapse), metric
  cards, near-expiry table, exception queue with Resolve/Not Applicable
  actions, report generation buttons with data-quality-issue display and a
  "generate incomplete draft anyway" fallback, and a generated-reports list
  with download. Reuses `Navbar`/`Button` and the existing `bg-(--color-x)`
  token conventions — no new dependencies, no design-system drift. Linked
  from the existing upload dashboard via an "Operations Intelligence →"
  link. `src/lib/api.ts` gained the matching typed methods.

**Live-tested end-to-end**, not just typechecked: registered two food banks
against real Postgres + ClickHouse containers, uploaded a real spreadsheet
through the actual `/api/uploads` endpoint, loaded the operations dashboard
in an actual browser (screenshots taken), resolved an exception through the
UI and confirmed it persisted, generated a real PDF from live data via the
UI, and confirmed cross-tenant isolation on every new endpoint.

## Not built yet

1. **Storage for generated PDFs.** Currently local disk
   (`api/generated-reports/`, gitignored) — fine for dev, needs object
   storage (S3 or similar) before this runs anywhere but one machine.
2. **The other 4 report templates** (board impact, grant progress, TEFAP
   draft review packet, network partner allocation) — `registry.ts` has
   their metadata, no builder yet.
3. **DistributionEvent / VolunteerShift / HouseholdServiceAggregate data
   sources.** Nothing writes to these tables yet, so readiness always
   reports "unknown" and both report templates need `forceIncomplete` to
   generate against real data. This is the actual next unlock — see
   `etl.service.ts`'s header comment.
4. **RBAC beyond tenant scoping** (role checks are on the existing
   auth/org modules' TODO, not added here), **audit logging** of report
   generation/downloads/exception changes, **LibreChat/MCP drill-down**
   wiring for "Ask about this dashboard."

## Flag for the team

`services/demand-data-service/` (the standalone ingestion service from
before) looks superseded by `api/src/modules/community-data/` — same logic,
already absorbed into `api/`, and the service's own README says it was meant
to be dropped once absorbed. Didn't delete it this round since removing
someone else's files wasn't asked for — worth a decision from whoever's
tracking `api/` before it's cleaned up.

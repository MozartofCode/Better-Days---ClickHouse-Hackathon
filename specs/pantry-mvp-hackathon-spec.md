# Pantry Ops MVP — spec, flow, and 3-person split

## What it is

Upload pantry spreadsheets. Get three things: a variance reconciliation, a data-quality exception list, and a monthly report packet. Every number traces to source rows.

## Non-goals

- No login, accounts, or database. Session-only, in-browser.
- No MCP server. Web UI only.
- No write-back to PantrySoft, Link2Feed, or any existing system.
- No client PII beyond what dedupe requires.

---

## THE CONTRACT — build this first, together, in the first 30 minutes

Everything else depends on one shared JSON shape. Agree on it before anyone writes feature code. Commit it as `schema.js` with a hardcoded mock object.

```js
{
  meta: { files: [{name, rowCount}], dateRange: {start, end}, sites: [] },
  inventory: [
    { id, commodity, lot, beginningLb, receivedLb, distributedLb,
      transferredLb, documentedLossLb, physicalCountLb,
      sourceFile, sourceRows: [] }
  ],
  visits: [
    { id, householdId, date, site, program, poundsLb, householdSize,
      sourceFile, sourceRow }
  ],
  households: [
    { id, nameRaw, addressRaw, size, sourceFile, sourceRow }
  ],
  exceptions: [
    { severity, type, message, affectedRows: [], sourceFile }
  ]
}
```

Rule: `sourceFile` and `sourceRows` are mandatory on every record. Provenance is not optional.

---

## User flow (9 steps)

1. Open URL. Single page. One drop zone.
2. Drag in 1–3 files (.xlsx or .csv).
3. App shows what it parsed: row count, date range, sites detected, columns mapped.
4. User corrects mapping in dropdowns. Max 6.
5. Three tabs appear: **Reconcile**, **Data Quality**, **Report**.
6. Reconcile → variance table, flagged lines, drafted cause explanations.
7. Data Quality → exception list, grouped by severity, each expandable to the offending rows.
8. Report → monthly packet, every figure with a "show rows" toggle.
9. Copy to clipboard or download .md.

Step 3 is the demo moment. It happens before the user asks anything.

---

## Feature 1: Reconciler

Per commodity:

`beginning + received − distributed − transferred − documentedLoss = expectedEnding`

`expectedEnding − physicalCount = variance`

Outputs:
- Variance in pounds and percent per commodity.
- Flag variance above threshold. Default 2%.
- Per flagged line, an LLM-drafted cause explanation in TEFAP's required shape: date, commodity type, quantity, cause, supervisor sign-off line.
- Every draft labeled `DRAFT — REQUIRES SIGN-OFF`.

Test case (USDA worked example):
2,000 beginning + 5,000 received − 4,200 distributed − 400 transferred − 15 spoilage = 2,385 expected. Physical count 2,100 → 285 lb variance, 12% → finding.

## Feature 2: Data quality

Checks:
- Duplicate households (fuzzy name + address)
- Dates outside stated reporting period
- Negative or zero quantities
- Missing household size (TEFAP-required)
- Unit mismatch in one column (lb / kg / cases)
- Orphan visits (householdId with no household record)

Each exception: severity (`error` / `warn`), type, plain-English message, affected row numbers.

Never silently corrected. Review list only.

## Feature 3: Report generator

Markdown packet containing:
- Unduplicated households served, by site
- Total visits
- Pounds distributed, by category
- TEFAP vs non-TEFAP split
- Month-over-month delta if prior data present
- Exceptions summary carried over from Feature 2

Each metric shows: value, source file, rows used, rows excluded and why.

---

## The rule that makes it trustworthy

Deterministic code does all arithmetic. The LLM does column mapping, cause wording, and report narrative only. If a number appears in the output, JavaScript produced it.

State this on the demo slide. It is the differentiator against every "chat with your spreadsheet" project in the room.

---

## Three-person split

Chosen so nobody blocks anyone after the first 30 minutes. Each person owns one input and one output of the contract.

### Person A — Ingestion and shell
Owns: files in → contract object out.
- Drop zone, SheetJS (.xlsx) and PapaParse (.csv)
- LLM column mapping: send headers + 3 sample rows, get field mapping back
- Manual override dropdowns
- The "here's what I found" confirmation screen
- Tab shell and routing

### Person B — Engines
Owns: contract object in → variance results and exceptions out.
- Reconciler math, per commodity
- Threshold flagging
- All six data-quality checks
- Fuzzy dedupe
- Pure functions. No UI. No API calls.

Person B never touches the DOM. Fastest to test, easiest to unblock.

### Person C — Output and LLM
Owns: results in → rendered packet out.
- Variance table UI
- Exception list UI, grouped, expandable
- Report packet renderer
- The "show rows" provenance toggle
- All Anthropic API prompts: cause explanations, report narrative
- Copy and download

### Handoffs
- A → B: the contract object
- B → C: `{variances: [], exceptions: []}`
- C → A: nothing. C is terminal.

Everyone starts against the mock object in `schema.js`. B and C are unblocked at minute 30 even if A's parser isn't done.

---

## Timeline

| Time | All three |
|---|---|
| 0:00–0:30 | Agree the contract. Write `schema.js` with mock data. Split repo files. |

| Time | A | B | C |
|---|---|---|---|
| 0:30–1:15 | Drop zone + parse | Reconciler math | Variance table UI |
| 1:15–2:00 | LLM column mapping | Data quality checks | Exception list UI |
| 2:00–2:45 | Confirmation screen + overrides | Fuzzy dedupe | Report packet + LLM prompts |
| 2:45–3:15 | Integrate: A's real output replaces the mock | | |
| 3:15–3:45 | End-to-end pass on the sample file. Fix what breaks. | | |
| 3:45–4:00 | Demo run-through. Twice. | | |

Adjust the block lengths to your actual hackathon window. The proportions matter more than the hours.

---

## Cut list, in order

1. Month-over-month delta
2. Fuzzy dedupe → exact match only
3. Download → clipboard only
4. Unit mismatch check

Do not cut: the confirmation screen, or the show-rows provenance. Those are the demo.

---

## Before you start

Make the sample file first. One person, 15 minutes, before the contract discussion. A deliberately messy .xlsx: three sites, a month of visits, an inventory sheet with one real variance, two duplicate households, one date typo, one negative quantity.

Without it, three people build against three different imagined data shapes and integration fails at hour three.

## Open risk

No real pantry file. Column mapping will break on first contact with real data. Say so in the demo rather than hiding it — it is the honest next step, not a flaw.

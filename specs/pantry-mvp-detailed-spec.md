# Pantry Ops MVP — detailed build spec

Companion to `pantry-mvp-hackathon-spec.md`. That doc covers scope and the 3-person split. This one covers implementation detail: schema, function signatures, prompts, UI states, edge cases, test fixtures.

---

## 1. Architecture

Single-page app. No backend. No database. No auth.

```
files (.xlsx/.csv)
  → parse/                  [Person A]
  → mapping/ (LLM + manual) [Person A]
  → schema.js contract object
  → engines/                [Person B]  pure functions, no I/O
  → render/                 [Person C]  UI + LLM narrative
```

State lives in one React `useState` object at the root. Passed down as props. No context, no store.

**Anthropic API calls happen in exactly two places.** Person A's column mapper, Person C's narrative generator. Nowhere else.

### Repo layout

```
/src
  schema.js          contract + MOCK_DATA        [all, hour 0]
  parse.js           file → raw rows             [A]
  mapping.js         raw rows → contract         [A]
  engines/
    reconcile.js     contract → variances        [B]
    quality.js       contract → exceptions       [B]
    dedupe.js        households → clusters       [B]
  render/
    Variances.jsx                                [C]
    Exceptions.jsx                               [C]
    Report.jsx                                   [C]
    ShowRows.jsx     provenance toggle           [C]
  llm.js             two prompt functions        [A writes mapper, C writes narrative]
  App.jsx            shell + tabs                [A]
```

One file per owner. Merge conflicts near zero.

---

## 2. The contract (`schema.js`)

Frozen at hour 0. Changes require all three to agree.

```js
export const CONTRACT = {
  meta: {
    files: [{ name: "", rowCount: 0, kind: "inventory|visits|households" }],
    dateRange: { start: "2026-06-01", end: "2026-06-30" },
    sites: ["Main", "North", "Mobile"],
    mappingConfidence: 0.0        // 0-1, from LLM mapper
  },

  inventory: [{
    id: "inv_001",
    commodity: "Frozen Chicken",
    lot: "L-2026-0612",           // nullable
    beginningLb: 2000,
    receivedLb: 5000,
    distributedLb: 4200,
    transferredLb: 400,
    documentedLossLb: 15,
    physicalCountLb: 2100,        // nullable → skip reconciliation for this row
    sourceFile: "inventory_june.xlsx",
    sourceRows: [14]
  }],

  visits: [{
    id: "vis_001",
    householdId: "hh_001",        // nullable → orphan exception
    date: "2026-06-14",
    site: "Main",
    program: "TEFAP",             // TEFAP | CSFP | Other | null
    poundsLb: 38,
    householdSize: 4,             // nullable → TEFAP exception
    sourceFile: "visits_june.csv",
    sourceRow: 212
  }],

  households: [{
    id: "hh_001",
    nameRaw: "Maria Gonzalez",
    addressRaw: "412 Oak St",
    size: 4,
    sourceFile: "households.csv",
    sourceRow: 88
  }],

  exceptions: []                  // filled by engines/quality.js
};
```

### Invariants

- Every record has `sourceFile`. Every record has `sourceRow` or `sourceRows`.
- All weights in pounds. Conversion happens in `mapping.js`, never later.
- All dates ISO `YYYY-MM-DD`. Conversion happens in `mapping.js`.
- Nullable fields are `null`, never `undefined`, never `""`.
- IDs are strings with a type prefix. Generated at parse time.

Ship `MOCK_DATA` alongside: 6 inventory rows, 40 visits, 25 households, containing every seeded defect from §8.

---

## 3. Parse and mapping — Person A

### 3.1 `parse.js`

```js
parseFile(File) → { name, headers: [], rows: [[]], kind }
```

- `.xlsx` via SheetJS `read()` + `sheet_to_json({header: 1})`. First sheet only.
- `.csv` via PapaParse, `header: false`, `skipEmptyLines: true`.
- Header row = first row with ≥2 non-empty cells.
- `kind` guessed from headers, confirmed by user in §3.3.

### 3.2 `mapping.js` — LLM column mapper

Send headers plus 3 sample rows. Get field mapping back. One call per file.

**Prompt:**

```
You map spreadsheet columns to a fixed schema for food pantry data.

Target fields for kind="inventory":
commodity, lot, beginningLb, receivedLb, distributedLb,
transferredLb, documentedLossLb, physicalCountLb

Target fields for kind="visits":
householdId, date, site, program, poundsLb, householdSize

Target fields for kind="households":
nameRaw, addressRaw, size

Headers: <JSON array>
Sample rows: <JSON array of 3 arrays>

Return ONLY JSON, no markdown fences, no preamble:
{
  "kind": "inventory|visits|households",
  "mapping": { "<targetField>": <column index or null> },
  "unitHint": "lb|kg|cases|unknown",
  "confidence": 0.0-1.0
}

Rules:
- Use null for fields with no matching column.
- Never invent a column index outside the header array bounds.
- confidence below 0.6 means you are guessing.
```

Model: `claude-sonnet-4-6`. `max_tokens: 1000`.

Parsing the response:

```js
const text = data.content.filter(b => b.type === "text")
                         .map(b => b.text).join("");
const clean = text.replace(/```json|```/g, "").trim();
const mapping = JSON.parse(clean);   // wrap in try/catch
```

On parse failure or any API error: fall back to empty mapping, set `confidence: 0`, show all dropdowns unset. The app must remain fully usable with zero LLM calls.

### 3.3 Confirmation screen

Renders after mapping, before any tab. The demo moment.

Shows:
- Per file: name, row count, detected kind
- Date range detected
- Sites detected, with counts
- Up to 6 mapping dropdowns, prefilled from the LLM, each listing every header plus "not present"
- Confidence badge: green ≥0.8, amber 0.6–0.8, red <0.6

One button: **Looks right →**

If confidence <0.6, the button reads **Check these first →** and the dropdowns are outlined amber. Do not block; nudge.

### 3.4 Unit conversion

Applied in `mapping.js` after the user confirms.

- `kg` → lb: `× 2.20462`
- `cases` → lb: prompt user for lb-per-case, default 30, single input
- `unknown` → treat as lb, and emit a `warn` exception

---

## 4. Engines — Person B

Pure functions. No DOM, no fetch, no imports beyond lodash. Testable in isolation from minute 30.

### 4.1 `reconcile.js`

```js
reconcile(contract, opts = { thresholdPct: 2 }) → Variance[]
```

```js
Variance = {
  commodity, lot,
  beginningLb, receivedLb, distributedLb, transferredLb, documentedLossLb,
  expectedEndingLb,      // computed
  physicalCountLb,
  varianceLb,            // expected − physical
  variancePct,           // |variance| / expected × 100, 0 if expected === 0
  flagged,               // variancePct > threshold
  direction,             // "short" | "over" | "balanced"
  sourceFile, sourceRows
}
```

Formula:

```
expectedEndingLb = beginningLb + receivedLb − distributedLb
                   − transferredLb − documentedLossLb
varianceLb       = expectedEndingLb − physicalCountLb
```

Edge cases:
- `physicalCountLb === null` → skip row, emit exception `MISSING_PHYSICAL_COUNT`
- `expectedEndingLb === 0` → `variancePct = 0`, flag if `physicalCountLb !== 0`
- `expectedEndingLb < 0` → always flag, `direction: "impossible"`, emit `error` exception
- Negative variance means physical exceeds expected. Also a finding. Flag it.

Round to 1 decimal for display. Keep full precision internally.

### 4.2 `quality.js`

```js
runChecks(contract) → Exception[]
```

```js
Exception = {
  severity: "error" | "warn",
  type: "<CONSTANT>",
  message: "<plain English, no jargon>",
  affectedRows: [{ sourceFile, sourceRow }],
  count: 0
}
```

| Type | Severity | Rule |
|---|---|---|
| `DUPLICATE_HOUSEHOLD` | warn | Fuzzy match ≥0.85 on name + address |
| `DATE_OUT_OF_RANGE` | error | Visit date outside `meta.dateRange` |
| `INVALID_QUANTITY` | error | `poundsLb <= 0` or non-numeric |
| `MISSING_HOUSEHOLD_SIZE` | error | `householdSize === null` on a TEFAP visit |
| `UNIT_MISMATCH` | warn | Mixed unit tokens in one source column |
| `ORPHAN_VISIT` | error | `householdId` not found in `households` |
| `MISSING_PHYSICAL_COUNT` | warn | Inventory row without a count |
| `IMPOSSIBLE_INVENTORY` | error | `expectedEndingLb < 0` |

Message style: "3 visits fall outside June 2026." Not "DATE_OUT_OF_RANGE violation detected."

Group by type. Never mutate the contract. Return a new array.

### 4.3 `dedupe.js`

```js
findDuplicates(households) → Cluster[]
```

- Normalize: lowercase, strip punctuation, collapse whitespace, strip street suffixes (`st|street|ave|avenue|rd|road|blvd`).
- Score: `0.6 × nameSimilarity + 0.4 × addressSimilarity`, Dice coefficient on bigrams.
- Cluster at ≥0.85.
- Return clusters of size ≥2 with member IDs and the score.

Unduplicated household count = `households.length − Σ(clusterSize − 1)`.

Fallback if behind schedule: exact normalized string match. Same interface, one line of logic.

---

## 5. Render and narrative — Person C

### 5.1 Variance table

Columns: Commodity, Expected, Counted, Variance (lb), Variance (%), Status.

Flagged rows: amber left border. `direction: "impossible"`: red.

Each flagged row expands to a drafted explanation:

```
DRAFT — REQUIRES SUPERVISOR SIGN-OFF

Date:       2026-06-30
Commodity:  Frozen Chicken
Quantity:   285 lb short
Cause:      [drafted text]
Sign-off:   ________________________
```

The `DRAFT` banner is not removable in the MVP. No approve button.

### 5.2 Cause-explanation prompt

```
You draft inventory variance explanations for a food pantry's
TEFAP compliance file. A supervisor reviews and signs every draft.

Variance data: <JSON of one Variance object>

Write 2-3 sentences stating the variance and listing the most
plausible operational causes for this commodity and direction.

Rules:
- Never assert a cause as fact. Write "likely", "consistent with",
  "should be checked against".
- Never invent a number not present in the data above.
- Never state the discrepancy is resolved or acceptable.
- Plain sentences. No headers, no bullets.
```

`max_tokens: 1000`. On failure, render a static template with the raw numbers. The variance table must work with the API down.

### 5.3 Exception list

Grouped by severity, errors first. Each group: count badge, type label, plain message, expandable row list.

Empty state: "No issues found in 312 rows." Not a blank panel.

### 5.4 Report packet

Rendered markdown, in this order:

```markdown
# Monthly Operations Report
## <site names> — <date range>

## Households served
Unduplicated: N          [show rows]
By site: table

## Visits
Total: N                 [show rows]
TEFAP: N (X%)
Non-TEFAP: N (Y%)

## Pounds distributed
Total: N lb              [show rows]
By category: table

## Inventory reconciliation
N commodities reconciled. M flagged above 2%.
Summary table.

## Data quality
N exceptions: X errors, Y warnings.
Summary by type.

## Notes
<LLM narrative, 3-4 sentences>

---
Generated <timestamp>. Sources: <file list>.
All figures computed from uploaded data. Review before submission.
```

Narrative prompt: pass only the computed aggregates. Instruct: describe trends, do not restate every number, do not recommend actions, flag if exceptions materially affect confidence. `max_tokens: 1000`.

### 5.5 `ShowRows.jsx`

Every `[show rows]` toggle expands to a table of the underlying records with source file and row number per line. Reads `sourceRows` off the record. No recomputation.

This component is the trust argument. Build it early, not last.

---

## 6. Error handling

| Failure | Behavior |
|---|---|
| Unsupported file type | Reject at drop zone, name the accepted types |
| Empty or 1-row file | Parse, show 0 rows, do not crash |
| LLM mapping fails | Empty mapping, dropdowns unset, app usable |
| LLM narrative fails | Static template, numbers intact |
| No inventory file | Hide Reconcile tab. Report and Quality still work |
| No visits file | Hide Report tab. Reconcile still works |
| Malformed JSON from model | try/catch → fallback path, log to console |

Nothing in this list produces a blank screen or an uncaught throw.

---

## 7. Demo script (2 minutes)

1. Drop three messy files.
2. Confirmation screen. "It read them without being told the format."
3. Reconcile tab. Point at the 285 lb variance. "That's an audit finding."
4. Expand the drafted explanation. "Draft. A human signs it."
5. Data Quality tab. Two duplicates, one bad date.
6. Report tab. Expand one `[show rows]`. "Every number traces back."
7. Closing line: **the math is deterministic code, the model only writes prose.**

Step 7 is the differentiator against every other spreadsheet-chat project in the room. Say it out loud.

---

## 8. Test fixture

Build this before the contract discussion. 15 minutes, one person.

`sample_inventory.xlsx` — 6 commodities:
- Frozen Chicken: 2000 / 5000 / 4200 / 400 / 15, count 2100 → **285 lb, 12%, flagged**
- Canned Corn: 800 / 1200 / 1500 / 0 / 0, count 500 → balanced
- Rice: 1000 / 0 / 400 / 0 / 0, count 600 → balanced
- Milk: 300 / 900 / 1100 / 0 / 20, count 95 → **−15 lb, over**
- Produce: 0 / 2000 / 1800 / 100 / 50, count 40 → **10 lb, 20%, flagged**
- Pasta: 500 / 500 / 300 / 0 / 0, count `null` → **missing count**

`sample_visits.csv` — 40 rows, 3 sites, June 2026:
- 2 rows dated `2026-05-28` → out of range
- 1 row `poundsLb = -12` → invalid quantity
- 3 TEFAP rows with blank `householdSize` → missing size
- 1 row with `householdId = hh_999` → orphan
- Header uses `Weight (kg)` on one file to exercise conversion

`sample_households.csv` — 25 rows:
- "Maria Gonzalez / 412 Oak St" and "maria gonzales / 412 Oak Street" → duplicate
- "J. Chen / 88 Pine" and "James Chen / 88 Pine Ave" → duplicate
- Unduplicated count should be **23**

Expected end state: 2 flagged variances, 1 over, 1 missing count, 9 exceptions, 23 unduplicated households.

Write those expected numbers on a whiteboard. Integration is done when the app matches them.

---

## 9. Cut list, in order

1. Month-over-month delta
2. Fuzzy dedupe → exact normalized match
3. Download → clipboard only
4. `UNIT_MISMATCH` check
5. LLM column mapping → hardcode the sample file's mapping, keep the dropdowns

Do not cut: confirmation screen, `ShowRows`, the `DRAFT` banner.

## 10. Open risk

No real pantry file exists. The fixture is synthetic and shaped from public TEFAP guidance, not from a pantry's actual export. Column mapping will break on first real contact.

Say this in the demo. It is the honest next step, and it is a better closing line than pretending the problem is solved.

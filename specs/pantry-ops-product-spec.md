# Pantry Ops — Product Spec

The shared base doc. Read this before the build specs. Everyone on the team should be able to answer "who is this for and why does it matter" from this page alone.

---

## 1. Who this is for

### Primary persona — Denise, Operations Director

- Runs a multi-site pantry network. 5 to 30 distribution sites.
- Reports to a regional food bank and to the state agency.
- Team is 2–4 paid staff plus rotating volunteers.
- Tools: Excel, Google Sheets, paper intake forms, and one vertical system (PantrySoft, Link2Feed, or similar) that only covers part of the operation.
- Technical skill: confident in Excel. Has never installed a developer tool. Will not edit a config file.
- Time: has none. Administrative capacity is the first thing cut when budgets tighten.

**Her month:** the TEFAP report is due by the 7th. She pulls exports from two systems, opens three spreadsheets, reconciles by hand, chases volunteers for missing intake forms, and rebuilds the same numbers again the following week for the board.

**What she is judged on:** clean audits, and pounds out the door.

### Secondary personas

- **Volunteer coordinator** — needs the exception list. Owns the data mess without owning the reporting.
- **Executive Director** — consumes the board packet. Never uploads anything.
- **Regional food bank program officer** — receives partner reports. Cares about consistency across agencies.

### Explicitly not our user (for now)

- The single-site, all-volunteer pantry with no digital records. Great design partner, bad first customer: no clean data, no implementation capacity, no budget.
- The large Feeding America member running Ceres or Primarius. Already has an ERP. Long sales cycle.

---

## 2. The problem

### The macro pressure

- SNAP enrollment fell ~4.95M between Jan 2025 and Feb 2026 after eligibility tightened. That demand shifts to pantries.
- Over 50 million people turned to food aid organizations.
- ~22% of pantries want to expand. ~48% are at capacity with no intention to grow.

**Read that last line carefully.** Our users are capacity-bound, not growth-bound. The value proposition is *give me back my week*, not *help me serve more people*. Anyone building a feature justified by "serves more families" is building the wrong thing.

### The specific pain we attack

**Reconciliation has a hard forcing function.** TEFAP requires inventory loss to be documented with date, commodity type, quantity, cause, and supervisor sign-off. Undocumented variance is classified as missing inventory and becomes an audit finding. Reports are due monthly, typically by the 7th.

This is the wedge because it has a deadline and a penalty. Nobody defers it.

**Three failures compound:**

1. **Manual reconciliation.** Numbers live in different files with different column names and different units. Reconciling is arithmetic done by hand at 11pm.
2. **Invisible data quality.** Duplicates, bad dates, missing household sizes. Discovered during the audit rather than before it.
3. **Repeated consolidation.** The same numbers get rebuilt for TEFAP, the board, and each grant renewal, from scratch each time.

### Why existing tools don't solve it

- **Ceres / Primarius** — ERP-grade, food-bank tier, entrenched since 1985 and 2000. Not for Denise.
- **PantrySoft / Link2Feed / SmartChoice / PlanStreet** — mid-market systems of record. They handle *their own* data well. They do not reconcile *across* files, and they do not tell you what is wrong with what you typed in.
- **Open source** — repeatedly attempted, repeatedly abandoned. Volunteer projects that stalled when volunteers left.

The gap is not a system of record. It is the layer that checks and consolidates whatever systems and spreadsheets already exist.

---

## 3. What we're building

**One line:** Upload your existing spreadsheets. Get a reconciliation, an error list, and a report packet — with every number traceable to a source row.

### The three features

| Feature | Job it does | Emotional payoff |
|---|---|---|
| **Reconciler** | Computes expected vs. counted inventory per commodity, flags variance, drafts the required cause explanation | "I won't fail the audit" |
| **Data Quality** | Surfaces duplicates, bad dates, missing required fields, orphan records | "I know what's broken before someone else finds it" |
| **Report Generator** | Produces the monthly packet from the same verified data | "I got my Sunday back" |

They share one pipeline. That is the point — upload once, three outputs.

### The product principle

> **Deterministic code does all arithmetic. The model does mapping, wording, and narrative only.**

If a number appears anywhere in the output, JavaScript produced it. The LLM never computes a variance, never sums a column, never counts households.

This is not an engineering preference. It is the product. A tool that hallucinates a figure on a compliance filing is worse than no tool, and a director will test exactly that in the first five minutes. Every team member should be able to state this principle and point at where it is enforced in their own layer.

### What we are not building

- Not a replacement for PantrySoft, Link2Feed, Ceres, or Primarius.
- Not a chatbot over a database.
- Not an autonomous case manager. No eligibility decisions, ever.
- Not a new source of truth.
- Not an MCP server. MCP is a technical-user channel; our user will not install one.

---

## 4. User flow

### Entry

Denise opens a URL. No signup, no account, no install.

### The nine steps

1. **Land.** Single page. One drop zone. One line of copy explaining what to drop.
2. **Drop.** She drags in 1–3 files. Whatever she already has — an inventory sheet, a visits export, a household list.
3. **Recognition.** The app shows what it read: file names, row counts, date range, sites detected, columns mapped. *Before she asks for anything.*
4. **Confirm.** She corrects the column mapping in a handful of dropdowns. Prefilled. Six maximum.
5. **Choose.** Three tabs appear: Reconcile, Data Quality, Report.
6. **Reconcile.** Variance per commodity. Flagged rows highlighted. Each flagged row expands to a drafted cause explanation, stamped DRAFT — REQUIRES SIGN-OFF.
7. **Data Quality.** Exceptions grouped by severity, each expandable to the offending rows.
8. **Report.** The monthly packet. Every figure has a "show rows" toggle.
9. **Take it.** Copy to clipboard or download markdown.

### The two moments that matter

**Step 3 is the demo.** A non-technical user decides this is magic or garbage before typing a single thing. If the app correctly reads a messy spreadsheet without being told the format, everything after is easy. Build this early.

**Step 8's "show rows" is the trust argument.** A confident paragraph that can't be audited destroys credibility. Every number must be one click from its source. Build this early too — not as polish at the end.

### Session model

Nothing persists. No login, no database, no data leaves the browser except column headers and computed aggregates sent to the API. Say this on screen — it removes the biggest objection from an organization holding client PII.

---

## 5. Architecture blocks

Five blocks. Each has one owner. Interfaces between blocks are agreed before any of them is built.

```
  [1] INGEST  →  [2] NORMALIZE  →  [3] ENGINES  →  [4] PRESENT
                                         ↑
                                    [5] NARRATE
```

### Block 1 — Ingest

**Does:** Accepts dropped files. Parses .xlsx and .csv into raw headers and rows. Guesses which kind of file each one is.

**Owns:** File handling, parser libraries, the drop zone, rejection of unsupported types.

**Must not:** Interpret meaning. It produces rows, not records.

### Block 2 — Normalize

**Does:** Maps arbitrary column names onto our fixed fields. Converts units to pounds and dates to ISO. Attaches source file and row number to every record. Renders the confirmation screen and the manual override dropdowns.

**Owns:** The one LLM call for column mapping. The correctness of the confirmation screen.

**Must not:** Compute anything. It relabels and converts, nothing else.

**Critical constraint:** must work with the LLM entirely unavailable. Mapping failure means unset dropdowns, not a broken app.

### Block 3 — Engines

**Does:** All arithmetic and all rule checking. Reconciliation math. Variance flagging. Data quality checks. Deduplication.

**Owns:** Every number in the product.

**Must not:** Touch the DOM. Make network calls. Import anything with side effects.

Pure functions in, pure data out. Fully testable the moment the interface is agreed — this block is never blocked by anyone.

### Block 4 — Present

**Does:** Renders the variance table, the exception list, the report packet, the tab shell, and the show-rows provenance component. Handles copy and download.

**Owns:** Everything the user sees.

**Must not:** Recompute. If it needs a number that Block 3 doesn't provide, that's a Block 3 gap, not a place for inline arithmetic.

### Block 5 — Narrate

**Does:** Turns computed results into prose. Drafts cause explanations for flagged variances. Writes the report's narrative section.

**Owns:** All prompts except the column mapper.

**Must not:** Receive raw data. It receives *computed results only*. It cannot invent a number it was never given, and it must be instructed never to assert a cause as fact.

**Critical constraint:** every output must degrade to a static template. The reconciler and the report must be fully usable with the API down.

### Cross-cutting: Provenance

Not a block. A rule every block enforces.

- Ingest records the row number.
- Normalize carries it through mapping.
- Engines carry it into every result.
- Present exposes it behind a toggle.

If any block drops provenance, the product's central claim fails. This is the one requirement that cannot be traded for speed.

---

## 6. How we'll know it worked

| Signal | What it tells us |
|---|---|
| Denise uploads a *second* month unprompted | It saved her real time |
| She uses an output in an actual TEFAP filing or board meeting | It cleared the trust bar |
| She corrects the column mapping and continues | The confirmation screen worked |
| She expands "show rows" during the demo | Provenance is doing its job |
| She asks whether it can read her PantrySoft export | We found the integration to build next |

Anti-signal: she says it's impressive and never uploads again. That means we built a demo.

---

## 7. Known risks

**No real pantry data.** The test fixture is synthetic, shaped from public TEFAP guidance. Column mapping will break on first contact with a real export. That break is the most valuable thing we'll learn, so plan to get a real file rather than plan around not having one.

**Cold start on distribution.** No pantry relationship yet. The compliance deadline is the reason a stranger might take the call; nothing else in the product creates that urgency.

**Trust is the whole product and it is asymmetric.** One wrong number on a compliance report costs more credibility than fifty correct ones earn. This is why arithmetic is deterministic, why drafts stay drafts, and why nothing gets an approve button in v1.

**Open source burnout is the historical pattern here.** Every prior open-source pantry tool died when its volunteers left. Scope accordingly — a small, sharp tool that one person can maintain beats a platform that needs a team.

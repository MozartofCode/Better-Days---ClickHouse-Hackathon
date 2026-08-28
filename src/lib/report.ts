import type { Contract, Variance, QualityException } from "./schema";
import { unduplicatedCount } from "./engines/dedupe";
import { findDuplicates } from "./engines/dedupe";
import { draftReportNarrative, severityLabel, type ReportAggregates } from "./narrate";

export interface ReportModel {
  markdown: string;
  aggregates: ReportAggregates;
  bySite: { site: string; visits: number; poundsLb: number }[];
}

export function buildReport(contract: Contract, variances: Variance[], exceptions: QualityException[]): ReportModel {
  const clusters = findDuplicates(contract.households);
  const unduplicated = unduplicatedCount(contract.households, clusters);

  const totalVisits = contract.visits.length;
  const tefapVisits = contract.visits.filter((v) => v.program === "TEFAP").length;
  const tefapPct = totalVisits === 0 ? 0 : Math.round((tefapVisits / totalVisits) * 1000) / 10;
  const totalPoundsLb = contract.visits.reduce((sum, v) => sum + (v.poundsLb ?? 0), 0);
  const flagged = variances.filter((v) => v.flagged);
  const { errors, warns } = severityLabel(exceptions);

  const siteMap = new Map<string, { visits: number; poundsLb: number }>();
  for (const v of contract.visits) {
    const site = v.site ?? "Unspecified site";
    const entry = siteMap.get(site) ?? { visits: 0, poundsLb: 0 };
    entry.visits += 1;
    entry.poundsLb += v.poundsLb ?? 0;
    siteMap.set(site, entry);
  }
  const bySite = Array.from(siteMap.entries()).map(([site, v]) => ({ site, ...v }));

  const aggregates: ReportAggregates = {
    unduplicatedHouseholds: unduplicated,
    totalHouseholds: contract.households.length,
    totalVisits,
    tefapVisits,
    tefapPct,
    totalPoundsLb,
    flaggedVarianceCount: flagged.length,
    reconciledCount: variances.filter((v) => v.physicalCountLb !== null).length,
    errorCount: errors,
    warnCount: warns,
  };

  const notes = draftReportNarrative(aggregates);
  const files = contract.meta.files.map((f) => f.name).join(", ");
  const dateRange = `${contract.meta.dateRange.start ?? "unknown"} to ${contract.meta.dateRange.end ?? "unknown"}`;
  const sites = contract.meta.sites.length ? contract.meta.sites.join(", ") : "Not specified";

  const varianceRows = variances
    .filter((v) => v.physicalCountLb !== null)
    .map((v) => `| ${v.commodity} | ${v.expectedEndingLb} | ${v.physicalCountLb} | ${v.varianceLb} | ${v.flagged ? "⚠ Flagged" : "OK"} |`)
    .join("\n");

  const exceptionRows = exceptions.map((e) => `| ${e.severity === "error" ? "Error" : "Warning"} | ${e.message} |`).join("\n");

  const bySiteRows = bySite.map((s) => `| ${s.site} | ${s.visits} | ${Math.round(s.poundsLb).toLocaleString()} |`).join("\n");

  const markdown = `# Monthly Operations Report
## ${sites} — ${dateRange}

## Households served
Unduplicated: **${unduplicated}** (of ${contract.households.length} records)

| Site | Visits | Pounds |
|---|---|---|
${bySiteRows || "| — | 0 | 0 |"}

## Visits
Total: **${totalVisits}**
TEFAP: ${tefapVisits} (${tefapPct}%)
Non-TEFAP: ${totalVisits - tefapVisits} (${(100 - tefapPct).toFixed(1)}%)

## Pounds distributed
Total: **${Math.round(totalPoundsLb).toLocaleString()} lb**

## Inventory reconciliation
${aggregates.reconciledCount} commodities reconciled. ${aggregates.flaggedVarianceCount} flagged above threshold.

| Commodity | Expected (lb) | Counted (lb) | Variance (lb) | Status |
|---|---|---|---|---|
${varianceRows || "| — | — | — | — | — |"}

## Data quality
${errors} errors, ${warns} warnings.

| Type | Message |
|---|---|
${exceptionRows || "| — | No issues found |"}

## Notes
${notes}

---
Generated ${new Date().toISOString()}. Sources: ${files || "none"}.
All figures computed from uploaded data. Review before submission.
`;

  return { markdown, aggregates, bySite };
}

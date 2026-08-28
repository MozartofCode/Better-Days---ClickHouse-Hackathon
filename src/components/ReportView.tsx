"use client";

import { useMemo, useState } from "react";
import type { Contract, Variance, QualityException } from "@/lib/schema";
import { buildReport } from "@/lib/report";
import Button from "./Button";
import ShowRows from "./ShowRows";

interface Props {
  contract: Contract;
  variances: Variance[];
  exceptions: QualityException[];
}

export default function ReportView({ contract, variances, exceptions }: Props) {
  const report = useMemo(() => buildReport(contract, variances, exceptions), [contract, variances, exceptions]);
  const [copied, setCopied] = useState(false);

  const householdRows = contract.households.map((h) => ({ sourceFile: h.sourceFile, sourceRow: h.sourceRow }));
  const visitRows = contract.visits.map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow }));
  const poundsRows = contract.visits.filter((v) => v.poundsLb !== null).map((v) => ({ sourceFile: v.sourceFile, sourceRow: v.sourceRow }));
  const flaggedRows = variances.filter((v) => v.flagged).flatMap((v) => v.sourceRows.map((r) => ({ sourceFile: v.sourceFile, sourceRow: r })));

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — user can still select the text below.
    }
  }

  function handleDownload() {
    const blob = new Blob([report.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pana-monthly-report.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--color-text-muted)">Your monthly report packet, ready to share.</p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </Button>
          <Button onClick={handleDownload}>Download markdown</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="Unduplicated households" value={report.aggregates.unduplicatedHouseholds} rows={householdRows} />
        <Metric label="Total visits" value={report.aggregates.totalVisits} rows={visitRows} />
        <Metric
          label="Pounds distributed"
          value={`${Math.round(report.aggregates.totalPoundsLb).toLocaleString()} lb`}
          rows={poundsRows}
        />
        <Metric
          label="TEFAP visits"
          value={`${report.aggregates.tefapVisits} (${report.aggregates.tefapPct}%)`}
          rows={visitRows.filter((_, i) => contract.visits[i]?.program === "TEFAP")}
        />
        <Metric label="Flagged variances" value={report.aggregates.flaggedVarianceCount} rows={flaggedRows} />
        <Metric
          label="Data quality issues"
          value={`${report.aggregates.errorCount} errors, ${report.aggregates.warnCount} warnings`}
          rows={exceptions.flatMap((e) => e.affectedRows)}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--color-text-muted)">
          Full report
        </h2>
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-2xl border border-(--color-border) bg-(--color-surface) p-6 text-sm text-(--color-text)">
          {report.markdown}
        </pre>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  rows,
}: {
  label: string;
  value: string | number;
  rows: { sourceFile: string; sourceRow: number }[];
}) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
      <p className="text-sm font-medium text-(--color-text-muted)">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-(--color-text)">{value}</p>
      <ShowRows rows={rows} />
    </div>
  );
}

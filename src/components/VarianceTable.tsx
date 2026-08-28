"use client";

import { useState } from "react";
import type { Variance } from "@/lib/schema";
import { draftCauseExplanation } from "@/lib/narrate";
import ShowRows from "./ShowRows";

export default function VarianceTable({ variances }: { variances: Variance[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (variances.length === 0) {
    return (
      <EmptyState
        title="No inventory to reconcile"
        body="Upload an inventory file with beginning, received, distributed, and physical count amounts to see a reconciliation here."
      />
    );
  }

  const flaggedCount = variances.filter((v) => v.flagged).length;

  return (
    <div>
      <p className="mb-4 text-sm text-(--color-text-muted)">
        {variances.length} commodities reconciled. {flaggedCount} flagged for review.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-(--color-text-muted)">
              <th className="px-4 py-3 font-medium">Commodity</th>
              <th className="px-4 py-3 font-medium">Expected (lb)</th>
              <th className="px-4 py-3 font-medium">Counted (lb)</th>
              <th className="px-4 py-3 font-medium">Variance</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {variances.map((v) => (
              <VarianceRow key={v.id} v={v} open={expanded.has(v.id)} onToggle={() => toggle(v.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VarianceRow({ v, open, onToggle }: { v: Variance; open: boolean; onToggle: () => void }) {
  const borderClass =
    v.direction === "impossible" ? "border-l-4 border-l-(--color-error)" : v.flagged ? "border-l-4 border-l-(--color-warn)" : "";

  return (
    <>
      <tr className={`border-b border-(--color-border) last:border-0 ${borderClass}`}>
        <td className="px-4 py-3 font-medium text-(--color-text)">{v.commodity}</td>
        <td className="px-4 py-3 text-(--color-text)">{v.expectedEndingLb.toLocaleString()}</td>
        <td className="px-4 py-3 text-(--color-text)">{v.physicalCountLb === null ? "—" : v.physicalCountLb.toLocaleString()}</td>
        <td className="px-4 py-3 text-(--color-text)">
          {v.varianceLb === null ? "—" : `${v.varianceLb > 0 ? "+" : ""}${v.varianceLb.toLocaleString()} lb (${v.variancePct}%)`}
        </td>
        <td className="px-4 py-3">
          <StatusPill v={v} />
        </td>
      </tr>
      {v.flagged && (
        <tr className="border-b border-(--color-border) bg-(--color-bg)">
          <td colSpan={5} className="px-4 py-3">
            <button
              onClick={onToggle}
              className="text-sm font-medium text-(--color-primary) hover:underline cursor-pointer"
            >
              {open ? "Hide drafted explanation" : "View drafted explanation"}
            </button>
            {open && (
              <div className="mt-3 rounded-xl border border-(--color-warn) bg-(--color-warn-soft) p-4">
                <p className="mb-2 inline-block rounded-full bg-white px-3 py-1 text-xs font-bold tracking-wide text-(--color-warn)">
                  DRAFT — REQUIRES SIGN-OFF
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-(--color-text)">
                  <dt className="text-(--color-text-muted)">Date</dt>
                  <dd>{new Date().toISOString().slice(0, 10)}</dd>
                  <dt className="text-(--color-text-muted)">Commodity</dt>
                  <dd>{v.commodity}</dd>
                  <dt className="text-(--color-text-muted)">Quantity</dt>
                  <dd>{Math.abs(v.varianceLb ?? 0).toLocaleString()} lb {v.direction === "over" ? "over" : "short"}</dd>
                </dl>
                <p className="mt-3 text-sm text-(--color-text)">{draftCauseExplanation(v)}</p>
                <div className="mt-4 border-t border-dashed border-(--color-warn) pt-3 text-sm text-(--color-text-muted)">
                  Supervisor sign-off: ________________________
                </div>
                <ShowRows rows={v.sourceRows.map((r) => ({ sourceFile: v.sourceFile, sourceRow: r }))} label="Show source rows" />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ v }: { v: Variance }) {
  if (v.direction === "no-count") {
    return <Pill tone="muted">No count</Pill>;
  }
  if (v.direction === "impossible") {
    return <Pill tone="error">Check inventory</Pill>;
  }
  if (v.flagged) {
    return <Pill tone="warn">Flagged</Pill>;
  }
  return <Pill tone="success">Balanced</Pill>;
}

function Pill({ tone, children }: { tone: "muted" | "error" | "warn" | "success"; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    muted: "bg-(--color-bg) text-(--color-text-muted)",
    error: "bg-(--color-error-soft) text-(--color-error)",
    warn: "bg-(--color-warn-soft) text-(--color-warn)",
    success: "bg-(--color-success-soft) text-(--color-success)",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${classes[tone]}`}>{children}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-(--color-border) bg-(--color-surface) p-10 text-center">
      <p className="font-medium text-(--color-text)">{title}</p>
      <p className="mt-1 text-sm text-(--color-text-muted)">{body}</p>
    </div>
  );
}

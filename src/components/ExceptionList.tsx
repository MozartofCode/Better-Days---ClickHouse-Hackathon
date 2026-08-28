"use client";

import { useState } from "react";
import type { QualityException } from "@/lib/schema";
import ShowRows from "./ShowRows";

const TYPE_LABELS: Record<string, string> = {
  DUPLICATE_HOUSEHOLD: "Duplicate records",
  DATE_OUT_OF_RANGE: "Dates outside the reporting period",
  INVALID_DATE: "Invalid dates",
  INVALID_QUANTITY: "Invalid quantities",
  MISSING_HOUSEHOLD_SIZE: "Missing required fields",
  ORPHAN_VISIT: "Orphan records",
  MISSING_PHYSICAL_COUNT: "Missing physical counts",
  IMPOSSIBLE_INVENTORY: "Numbers that don't add up",
};

export default function ExceptionList({ exceptions, totalRows }: { exceptions: QualityException[]; totalRows: number }) {
  const [open, setOpen] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  if (exceptions.length === 0) {
    return (
      <div className="rounded-2xl border border-(--color-border) bg-(--color-success-soft) p-10 text-center">
        <p className="font-medium text-(--color-success)">No issues found in {totalRows} rows.</p>
      </div>
    );
  }

  const errors = exceptions.filter((e) => e.severity === "error");
  const warns = exceptions.filter((e) => e.severity === "warn");

  return (
    <div className="space-y-8">
      {errors.length > 0 && (
        <Group title="Needs attention" tone="error" items={errors} open={open} onToggle={toggle} offset={0} />
      )}
      {warns.length > 0 && (
        <Group title="Worth a look" tone="warn" items={warns} open={open} onToggle={toggle} offset={errors.length} />
      )}
    </div>
  );
}

function Group({
  title,
  tone,
  items,
  open,
  onToggle,
  offset,
}: {
  title: string;
  tone: "error" | "warn";
  items: QualityException[];
  open: Set<number>;
  onToggle: (i: number) => void;
  offset: number;
}) {
  const count = items.reduce((n, e) => n + e.count, 0);
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-(--color-text-muted)">
        {title}
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            tone === "error" ? "bg-(--color-error-soft) text-(--color-error)" : "bg-(--color-warn-soft) text-(--color-warn)"
          }`}
        >
          {count}
        </span>
      </h3>
      <div className="space-y-3">
        {items.map((exc, i) => {
          const idx = offset + i;
          const isOpen = open.has(idx);
          return (
            <div key={idx} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
              <button
                onClick={() => onToggle(idx)}
                className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
              >
                <div>
                  <p className="font-medium text-(--color-text)">
                    {TYPE_LABELS[exc.type] ?? exc.type}{" "}
                    <span className="font-normal text-(--color-text-muted)">— {exc.count}</span>
                  </p>
                  <p className="mt-1 text-sm text-(--color-text-muted)">{exc.message}</p>
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 12 12"
                  className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {isOpen && <ShowRows rows={exc.affectedRows} label="Show affected rows" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

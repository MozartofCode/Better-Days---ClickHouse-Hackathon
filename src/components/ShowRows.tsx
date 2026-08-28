"use client";

import { useState } from "react";
import type { AffectedRow } from "@/lib/schema";

export default function ShowRows({ rows, label = "Show rows" }: { rows: AffectedRow[]; label?: string }) {
  const [open, setOpen] = useState(false);

  if (rows.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-sm font-medium text-(--color-primary) hover:underline cursor-pointer"
      >
        {open ? "Hide rows" : label} ({rows.length})
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-(--color-border) bg-(--color-bg)">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-(--color-text-muted)">
                <th className="px-3 py-2 font-medium">Source file</th>
                <th className="px-3 py-2 font-medium">Row</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-(--color-border) last:border-0">
                  <td className="px-3 py-2 text-(--color-text)">{r.sourceFile}</td>
                  <td className="px-3 py-2 text-(--color-text)">{r.sourceRow}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

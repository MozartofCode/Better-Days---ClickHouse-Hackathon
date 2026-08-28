"use client";

import type { ColumnMapping, ParsedFile } from "@/lib/schema";
import { FIELD_LABELS } from "@/lib/schema";
import Button from "./Button";

interface Props {
  files: ParsedFile[];
  mappings: ColumnMapping[];
  dateRange: { start: string | null; end: string | null };
  sites: string[];
  onContinue: () => void;
}

const KIND_LABEL: Record<string, string> = {
  inventory: "Inventory",
  visits: "Visits",
  households: "Households",
  unknown: "Not sure yet",
};

export default function RecognitionScreen({ files, mappings, dateRange, sites, onContinue }: Props) {
  return (
    <div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-(--color-text)">Here&apos;s what we found</h1>
        <p className="mt-2 text-(--color-text-muted)">Take a look before we continue.</p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-text-muted)">Date range</h2>
          <p className="mt-2 text-lg font-medium text-(--color-text)">
            {dateRange.start && dateRange.end ? `${dateRange.start} — ${dateRange.end}` : "Not detected"}
          </p>
        </div>
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-(--color-text-muted)">Sites detected</h2>
          <p className="mt-2 text-lg font-medium text-(--color-text)">
            {sites.length ? sites.join(", ") : "None found"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {files.map((file, i) => {
          const mapping = mappings[i];
          const mappedCount = mapping ? Object.values(mapping.mapping).filter((v) => v !== null).length : 0;
          const totalFields = mapping ? Object.keys(mapping.mapping).length : 0;
          return (
            <div key={file.name} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-(--color-text)">{file.name}</p>
                  <p className="text-sm text-(--color-text-muted)">
                    {file.rowCount} rows · {KIND_LABEL[file.kind]}
                  </p>
                </div>
                <ConfidenceBadge confidence={mapping?.confidence ?? 0} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {file.headers.map((h) => (
                  <span
                    key={h}
                    className="rounded-full bg-(--color-bg) px-3 py-1 text-xs font-medium text-(--color-text-muted)"
                  >
                    {h || "(blank column)"}
                  </span>
                ))}
              </div>

              <p className="mt-3 text-sm text-(--color-text-muted)">
                We matched {mappedCount} of {totalFields} fields automatically. You&apos;ll confirm them next.
              </p>
              {mapping && <MappingPreview mapping={mapping} headers={file.headers} />}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <Button onClick={onContinue} className="px-10">
          Continue
        </Button>
      </div>
    </div>
  );
}

function MappingPreview({ mapping, headers }: { mapping: ColumnMapping; headers: string[] }) {
  const rows = Object.entries(mapping.mapping).filter(([, idx]) => idx !== null);
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 border-t border-(--color-border) pt-4 sm:grid-cols-2">
      {rows.map(([field, idx]) => (
        <div key={field} className="flex items-center justify-between text-sm">
          <span className="text-(--color-text-muted)">{FIELD_LABELS[field] ?? field}</span>
          <span className="font-medium text-(--color-text)">{headers[idx as number]}</span>
        </div>
      ))}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.8
      ? { bg: "bg-(--color-success-soft)", text: "text-(--color-success)", label: "Looks good" }
      : confidence >= 0.6
        ? { bg: "bg-(--color-warn-soft)", text: "text-(--color-warn)", label: "Mostly matched" }
        : { bg: "bg-(--color-error-soft)", text: "text-(--color-error)", label: "Needs a look" };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.bg} ${tone.text}`}>
      {tone.label} · {pct}%
    </span>
  );
}

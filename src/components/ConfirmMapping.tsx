"use client";

import { useState } from "react";
import type { ColumnMapping, FileKind, ParsedFile } from "@/lib/schema";
import { FIELD_LABELS, MANUAL_FIELDS } from "@/lib/schema";
import Button from "./Button";

interface Props {
  files: ParsedFile[];
  mappings: ColumnMapping[];
  onConfirm: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
}

const NOT_PRESENT = "__none__";

export default function ConfirmMapping({ files, mappings: initial, onConfirm, onBack }: Props) {
  const [mappings, setMappings] = useState<ColumnMapping[]>(initial);

  function setField(fileIdx: number, field: string, value: string) {
    setMappings((prev) => {
      const next = [...prev];
      const m = { ...next[fileIdx], mapping: { ...next[fileIdx].mapping } };
      m.mapping[field] = value === NOT_PRESENT ? null : Number(value);
      // Manual correction resets confidence to 1 for this file — the user just verified it.
      m.confidence = 1;
      next[fileIdx] = m;
      return next;
    });
  }

  const totalConfirmed = mappings.reduce(
    (n, m) => n + Object.values(m.mapping).filter((v) => v !== null).length,
    0
  );

  return (
    <div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-(--color-text)">Confirm your column mapping</h1>
        <p className="mt-2 text-(--color-text-muted)">
          We matched these automatically. Fix anything that looks wrong.
        </p>
      </div>

      <div className="mt-8 space-y-6">
        {files.map((file, fileIdx) => {
          const mapping = mappings[fileIdx];
          const kind: FileKind = mapping.kind === "unknown" ? "inventory" : mapping.kind;
          const fields = MANUAL_FIELDS[kind as Exclude<FileKind, "unknown">] ?? [];
          return (
            <div key={file.name} className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <p className="font-medium text-(--color-text)">{file.name}</p>
              <p className="mb-5 text-sm text-(--color-text-muted)">{file.rowCount} rows</p>

              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => {
                  const idx = mapping.mapping[field];
                  const confirmed = idx !== null && idx !== undefined;
                  return (
                    <div key={field}>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-(--color-text)">
                        {FIELD_LABELS[field] ?? field}
                        {confirmed && (
                          <span className="text-(--color-success)" title="Confirmed" aria-label="Confirmed">
                            ✓
                          </span>
                        )}
                      </label>
                      <select
                        value={idx === null || idx === undefined ? NOT_PRESENT : String(idx)}
                        onChange={(e) => setField(fileIdx, field, e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-sm outline-none focus:border-(--color-primary)"
                      >
                        <option value={NOT_PRESENT}>Not present in this file</option>
                        {file.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm text-(--color-text-muted)">{totalConfirmed} fields mapped</p>

      <div className="mt-8 flex justify-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onConfirm(mappings)} className="px-10">
          Continue
        </Button>
      </div>
    </div>
  );
}

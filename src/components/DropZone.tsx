"use client";

import { useCallback, useRef, useState } from "react";
import Button from "./Button";

const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];
const MAX_FILES = 1;

interface Props {
  onFiles: (files: File[]) => void;
  onUseSample: () => void;
  error: string | null;
}

function isAccepted(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export default function DropZone({ onFiles, onUseSample, error }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = Array.from(fileList).slice(0, MAX_FILES);
      onFiles(files);
    },
    [onFiles]
  );

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-colors ${
          dragOver
            ? "border-(--color-primary) bg-(--color-primary-soft)"
            : "border-(--color-border) bg-(--color-surface) hover:border-(--color-primary)"
        }`}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-(--color-primary-soft)">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 16V4M12 4L7 9M12 4L17 9"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p className="text-lg font-medium text-(--color-text)">Drag and drop your file here</p>
        <p className="mt-1 text-sm text-(--color-text-muted)">.xlsx or .csv</p>
        <Button
          variant="secondary"
          className="mt-5"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>
      )}

      <div className="mt-3 text-center">
        <button
          onClick={onUseSample}
          className="text-sm font-medium text-(--color-primary) hover:underline cursor-pointer"
        >
          Or try it with a sample file
        </button>
      </div>
    </div>
  );
}

export { isAccepted, ACCEPTED_EXTENSIONS, MAX_FILES };

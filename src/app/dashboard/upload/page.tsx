"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DropZone, { isAccepted } from "@/components/DropZone";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { parseFile, buildXlsxFile } from "@/lib/parse";
import { SAMPLE_INVENTORY_ROWS } from "@/lib/inventorySchema";

interface Pending {
  name: string;
  headers: string[];
  rows: string[][];
}

export default function UploadPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    setUploadError(null);
    setSaveError(null);

    const file = files[0];
    if (!file) return;

    if (!isAccepted(file)) {
      setUploadError(`${file.name} isn't a supported file type. Please upload an .xlsx or .csv file.`);
      return;
    }

    setProcessing(true);
    try {
      const parsed = await parseFile(file);
      setPending({ name: parsed.name, headers: parsed.headers, rows: parsed.rows });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "We couldn't read that file. Please check the format and try again.");
    } finally {
      setProcessing(false);
    }
  }

  function handleUseSample() {
    setUploadError(null);
    setSaveError(null);
    setPending({ name: "sample_inventory.xlsx", headers: [...SAMPLE_INVENTORY_ROWS.headers], rows: SAMPLE_INVENTORY_ROWS.rows.map((r) => [...r]) });
  }

  function updateHeader(colIndex: number, value: string) {
    setPending((prev) => {
      if (!prev) return prev;
      const headers = [...prev.headers];
      headers[colIndex] = value;
      return { ...prev, headers };
    });
  }

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    setPending((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) => [...r]);
      rows[rowIndex][colIndex] = value;
      return { ...prev, rows };
    });
  }

  function cancelPending() {
    setPending(null);
  }

  async function confirmPending() {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    try {
      const file = buildXlsxFile(pending.name, pending.headers, pending.rows);
      await api.uploadFile(file);
      setPending(null);
      router.push("/dashboard");
    } catch {
      setSaveError("We couldn't save this to your account. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-(--color-text)">Upload a new file</h1>
          <p className="mt-2 text-(--color-text-muted)">
            Bring the spreadsheet you already have, exactly as it is. Any columns work.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-xl">
          <DropZone onFiles={handleFiles} onUseSample={handleUseSample} error={uploadError} />
        </div>

        {processing && <p className="mt-4 text-center text-sm text-(--color-text-muted)">Reading your file…</p>}
      </main>

      {pending && (
        <Modal onClose={cancelPending} wide>
          <h2 className="text-lg font-semibold text-(--color-text)">Is this what you uploaded?</h2>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            {pending.name} · {pending.rows.length} row{pending.rows.length === 1 ? "" : "s"}. You can fix anything
            below before saving.
          </p>

          {saveError && (
            <p className="mt-3 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{saveError}</p>
          )}

          <div className="mt-4 w-full overflow-x-auto rounded-2xl border border-(--color-border)">
            <table className="text-left text-sm">
              <thead>
                <tr className="border-b border-(--color-border) bg-(--color-bg)">
                  {pending.headers.map((h, c) => (
                    <th key={c} className="p-1.5">
                      <input
                        value={h}
                        onChange={(e) => updateHeader(c, e.target.value)}
                        className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-xs font-semibold uppercase text-(--color-text-muted) outline-none focus:border-(--color-primary) focus:bg-(--color-surface)"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.rows.map((row, r) => (
                  <tr key={r} className="border-b border-(--color-border) last:border-0">
                    {pending.headers.map((_, c) => (
                      <td key={c} className="p-1.5">
                        <input
                          value={row[c] ?? ""}
                          onChange={(e) => updateCell(r, c, e.target.value)}
                          className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm text-(--color-text) outline-none focus:border-(--color-primary) focus:bg-(--color-bg)"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={cancelPending} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={confirmPending} disabled={saving}>
              {saving ? "Saving…" : "Yes, save this"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

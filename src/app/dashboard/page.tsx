"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DropZone, { isAccepted } from "@/components/DropZone";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import InventoryTable from "@/components/InventoryTable";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { parseFile, rowsToRecords } from "@/lib/parse";
import { SAMPLE_INVENTORY_ROWS } from "@/lib/inventorySchema";

interface Inventory {
  source: string;
  headers: string[];
  rows: Record<string, string>[];
}

function fromRaw(name: string, headers: string[], rows: string[][]): Inventory {
  return { source: name, headers, rows: rowsToRecords(headers, rows) };
}

export default function DashboardPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [recentUploads, setRecentUploads] = useState<{ id: string; filename: string; row_count: number; uploaded_at: string }[]>([]);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingInventory, setPendingInventory] = useState<Inventory | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    api
      .dashboardSummary()
      .then(async (summary) => {
        setRecentUploads(summary.recentUploads);
        if (!summary.currentInventory) return;
        const detail = await api.uploadDetail(summary.currentInventory.fromUpload.id);
        setInventory((prev) =>
          prev ?? {
            source: detail.upload.filename,
            headers: detail.upload.columns,
            rows: detail.rows.map((r) => r.data),
          }
        );
      })
      .catch(() => {
        // Dashboard history is a nice-to-have; don't block the upload flow if the API is down.
      })
      .finally(() => setLoadingExisting(false));
  }, [user]);

  async function handleFiles(files: File[]) {
    setUploadError(null);
    setUploadWarning(null);

    const file = files[0];
    if (!file) return;

    if (!isAccepted(file)) {
      setUploadError(`${file.name} isn't a supported file type. Please upload an .xlsx or .csv file.`);
      return;
    }

    setProcessing(true);
    try {
      const parsed = await parseFile(file);
      setPendingInventory(fromRaw(parsed.name, parsed.headers, parsed.rows));
      setPendingFile(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "We couldn't read that file. Please check the format and try again.");
    } finally {
      setProcessing(false);
    }
  }

  function cancelPending() {
    setPendingFile(null);
    setPendingInventory(null);
  }

  async function confirmPending() {
    if (!pendingInventory || !pendingFile) return;
    setInventory(pendingInventory);
    setShowUpload(false);
    const file = pendingFile;
    setPendingFile(null);
    setPendingInventory(null);

    setSaving(true);
    try {
      const saved = await api.uploadFile(file);
      setRecentUploads((prev) => [{ id: saved.id, filename: saved.filename, row_count: saved.rowCount, uploaded_at: new Date().toISOString() }, ...prev]);
    } catch {
      setUploadWarning("We saved this to your view, but couldn't save it to your account. You can try uploading again.");
    } finally {
      setSaving(false);
    }
  }

  function handleUseSample() {
    setUploadError(null);
    setUploadWarning(null);
    setInventory(fromRaw("sample_inventory.xlsx", SAMPLE_INVENTORY_ROWS.headers, SAMPLE_INVENTORY_ROWS.rows));
    setShowUpload(false);
  }

  if (!ready || !user || loadingExisting) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  const showingUpload = showUpload || !inventory;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {showingUpload ? (
          <div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-(--color-text)">Upload your inventory</h1>
              <p className="mt-2 text-(--color-text-muted)">
                Bring the spreadsheet you already have, exactly as it is. Any columns work.
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-xl">
              <DropZone onFiles={handleFiles} onUseSample={handleUseSample} error={uploadError} />
            </div>

            {processing && <p className="mt-4 text-center text-sm text-(--color-text-muted)">Reading your file…</p>}

            {recentUploads.length > 0 && (
              <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
                <h2 className="text-sm font-semibold text-(--color-text)">Recent uploads</h2>
                <ul className="mt-3 space-y-2 text-sm text-(--color-text-muted)">
                  {recentUploads.slice(0, 5).map((u) => (
                    <li key={u.id} className="flex items-center justify-between">
                      <span>{u.filename}</span>
                      <span>{u.row_count} rows</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          inventory && (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-(--color-text)">Your inventory</h1>
                  <p className="text-sm text-(--color-text-muted)">
                    From {inventory.source}
                    {saving ? " — saving…" : ""}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setShowUpload(true)}>
                  Upload a different file
                </Button>
              </div>

              {uploadWarning && (
                <p className="mb-4 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{uploadWarning}</p>
              )}

              <InventoryTable headers={inventory.headers} rows={inventory.rows} />
            </div>
          )
        )}
      </main>

      {pendingInventory && (
        <Modal onClose={cancelPending}>
          <h2 className="text-lg font-semibold text-(--color-text)">Is this what you uploaded?</h2>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            {pendingInventory.source} · {pendingInventory.rows.length} row{pendingInventory.rows.length === 1 ? "" : "s"}
          </p>

          <div className="mt-4">
            <InventoryTable headers={pendingInventory.headers} rows={pendingInventory.rows.slice(0, 5)} />
            {pendingInventory.rows.length > 5 && (
              <p className="mt-2 text-xs text-(--color-text-muted)">
                +{pendingInventory.rows.length - 5} more row{pendingInventory.rows.length - 5 === 1 ? "" : "s"} not shown here.
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={cancelPending}>
              Cancel
            </Button>
            <Button onClick={confirmPending}>Yes, save this</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

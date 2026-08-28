"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DropZone, { isAccepted } from "@/components/DropZone";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { parseFile, rowsToRecords } from "@/lib/parse";
import {
  SAMPLE_INVENTORY_ROWS,
  classifyExpiry,
  classifyStockStatus,
  mapInventoryColumns,
  normalizeInventoryRow,
  type InventoryItem,
} from "@/lib/inventorySchema";

interface Inventory {
  source: string;
  headers: string[];
  rows: Record<string, string>[];
  items: InventoryItem[];
}

function summarize(items: InventoryItem[]) {
  let expiringSoon = 0;
  let expired = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const categoryCounts = new Map<string, number>();

  for (const item of items) {
    const expiry = classifyExpiry(item.expirationDate);
    if (expiry === "expired") expired++;
    if (expiry === "soon") expiringSoon++;

    const status = classifyStockStatus(item.restockingStatus);
    if (status === "low") lowStock++;
    if (status === "out") outOfStock++;

    if (item.category) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }
  }

  const categories = [...categoryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const matched = items.some(
    (i) => i.itemName || i.category || i.quantity !== null || i.expirationDate || i.restockingStatus
  );

  return { totalItems: items.length, expiringSoon, expired, lowStock, outOfStock, categories, matched };
}

function fromFile(name: string, headers: string[], rows: string[][]): Inventory {
  const mapping = mapInventoryColumns(headers);
  const records = rowsToRecords(headers, rows);
  const items = records.map((r) => normalizeInventoryRow(r, mapping));
  return { source: name, headers, rows: records, items };
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
            items: detail.items,
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
      setInventory(fromFile(parsed.name, parsed.headers, parsed.rows));
      setShowUpload(false);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "We couldn't read that file. Please check the format and try again.");
      setProcessing(false);
      return;
    }
    setProcessing(false);

    try {
      const saved = await api.uploadFile(file);
      setRecentUploads((prev) => [{ id: saved.id, filename: saved.filename, row_count: saved.rowCount, uploaded_at: new Date().toISOString() }, ...prev]);
    } catch {
      setUploadWarning(`We read your file, but couldn't save it to your account. You can still view it below.`);
    }
  }

  function handleUseSample() {
    setUploadError(null);
    setUploadWarning(null);
    setInventory(fromFile("sample_inventory.xlsx", SAMPLE_INVENTORY_ROWS.headers, SAMPLE_INVENTORY_ROWS.rows));
    setShowUpload(false);
  }

  const stats = useMemo(() => (inventory ? summarize(inventory.items) : null), [inventory]);

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

            <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <h2 className="text-sm font-semibold text-(--color-text)">What you&apos;ll see</h2>
              <p className="mt-2 text-sm text-(--color-text-muted)">
                We show your file exactly as you uploaded it — same columns, same values. If we can also
                recognize things like expiration date or stock status, we&apos;ll add a few quick stats on top,
                but your data never gets rewritten to fit a template.
              </p>
            </div>

            {recentUploads.length > 0 && (
              <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
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
          inventory &&
          stats && (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-semibold text-(--color-text)">Your inventory</h1>
                  <p className="text-sm text-(--color-text-muted)">From {inventory.source}</p>
                </div>
                <Button variant="ghost" onClick={() => setShowUpload(true)}>
                  Upload a different file
                </Button>
              </div>

              {uploadWarning && (
                <p className="mb-4 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{uploadWarning}</p>
              )}

              {stats.matched && (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <StatTile label="Total rows" value={stats.totalItems} />
                    <StatTile label="Expiring soon" value={stats.expiringSoon} tone={stats.expiringSoon > 0 ? "warn" : "default"} />
                    <StatTile label="Low stock" value={stats.lowStock} tone={stats.lowStock > 0 ? "warn" : "default"} />
                    <StatTile label="Out of stock" value={stats.outOfStock} tone={stats.outOfStock > 0 ? "error" : "default"} />
                  </div>

                  {stats.categories.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {stats.categories.map((c) => (
                        <span key={c.name} className="rounded-full border border-(--color-border) bg-(--color-surface) px-3 py-1 text-xs text-(--color-text-muted)">
                          {c.name} · {c.count}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase text-(--color-text-muted)">
                      {inventory.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.rows.map((row, i) => (
                      <tr key={i} className="border-b border-(--color-border) last:border-0">
                        {inventory.headers.map((h) => (
                          <Cell key={h} value={row[h]} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </main>
    </div>
  );
}

function StatTile({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warn" | "error" }) {
  const toneClass =
    tone === "error" ? "text-(--color-error)" : tone === "warn" ? "text-(--color-primary)" : "text-(--color-text)";
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
      <p className="text-xs font-medium uppercase text-(--color-text-muted)">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Cell({ value }: { value: string | undefined }) {
  const trimmed = value?.trim();
  return (
    <td className="whitespace-nowrap px-4 py-3 text-(--color-text)">
      {trimmed ? trimmed : <span className="text-(--color-text-muted)">—</span>}
    </td>
  );
}

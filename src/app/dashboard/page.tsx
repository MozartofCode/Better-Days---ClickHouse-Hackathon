"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DropZone, { isAccepted } from "@/components/DropZone";
import Button from "@/components/Button";
import Link from "next/link";
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
  const [recentUploads, setRecentUploads] = useState<{ id: string; filename: string; row_count: number; uploaded_at: string; tag?: string }[]>([]);
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const [uploadTag, setUploadTag] = useState("");
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const [switchingUpload, setSwitchingUpload] = useState(false);

  async function handleSelectUpload(id: string) {
    setSwitchingUpload(true);
    try {
      const detail = await api.uploadDetail(id);
      setInventory({
        source: detail.upload.filename,
        headers: detail.upload.columns,
        rows: detail.rows.map((r) => r.data),
        items: detail.items,
      });
      setSelectedUploadId(id);
      setShowUpload(false);
    } catch {
      setUploadWarning("Couldn't load that upload. Try again.");
    } finally {
      setSwitchingUpload(false);
    }
  }

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    api
      .getOrgProfile()
      .then((profile) => setShowSetupBanner(!profile.profileSetupCompleted))
      .catch(() => {
        // Non-critical — the profile-setup nudge just won't show if this fails.
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api
      .listUploads()
      .then((result) => setRecentUploads(result.uploads.map((u) => ({ ...u, row_count: u.row_count }))))
      .catch(() => {
        // Non-critical — the uploads list just won't populate if this fails.
      });
    api
      .dashboardSummary()
      .then(async (summary) => {
        if (!summary.currentInventory) return;
        const uploadId = summary.currentInventory.fromUpload.id;
        const detail = await api.uploadDetail(uploadId);
        setSelectedUploadId((prev) => prev ?? uploadId);
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
      const saved = await api.uploadFile(file, uploadTag.trim() || undefined);
      setRecentUploads((prev) => [
        { id: saved.id, filename: saved.filename, row_count: saved.rowCount, uploaded_at: new Date().toISOString(), tag: saved.tag },
        ...prev,
      ]);
      setSelectedUploadId(saved.id);
      setUploadTag("");
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
        {showSetupBanner && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-(--color-primary)/30 bg-(--color-primary)/10 px-5 py-3 text-sm">
            <span className="text-(--color-text)">Finish setting up your organization profile.</span>
            <div className="flex items-center gap-3">
              <Link href="/settings/profile" className="font-medium text-(--color-primary) hover:underline">
                Go to profile setup
              </Link>
              <button
                type="button"
                onClick={() => setShowSetupBanner(false)}
                className="text-(--color-text-muted) hover:text-(--color-text)"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {showingUpload ? (
          <div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-(--color-text)">Upload your inventory</h1>
              <p className="mt-2 text-(--color-text-muted)">
                Bring the spreadsheet you already have, exactly as it is. Any columns work.
              </p>
            </div>

            <div className="mx-auto mt-8 max-w-xl">
              <label className="mb-1 block text-xs font-medium text-(--color-text-muted)">
                Tag this upload (optional)
              </label>
              <input
                value={uploadTag}
                onChange={(e) => setUploadTag(e.target.value)}
                placeholder="e.g. August Week 1 Count"
                className="mb-3 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm text-(--color-text)"
              />
              <DropZone onFiles={handleFiles} onUseSample={handleUseSample} error={uploadError} />
              <p className="mt-3 text-center text-xs text-(--color-text-muted)">
                Uploading a new file doesn&apos;t replace previous ones — every upload is kept and combined.{" "}
                <Link href="/dashboard/data" className="font-medium text-(--color-primary) hover:underline">
                  See all uploaded data →
                </Link>
              </p>
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
                <h2 className="text-sm font-semibold text-(--color-text)">
                  Your uploads <span className="font-normal text-(--color-text-muted)">({recentUploads.length})</span>
                </h2>
                <ul className="mt-3 divide-y divide-(--color-border) text-sm">
                  {recentUploads.map((u) => (
                    <li key={u.id}>
                      <button
                        onClick={() => handleSelectUpload(u.id)}
                        disabled={switchingUpload}
                        className="flex w-full items-center justify-between gap-3 py-2 text-left cursor-pointer text-(--color-text) hover:text-(--color-primary) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="truncate">
                          {u.filename}
                          {u.tag && <span className="ml-2 text-xs text-(--color-text-muted)">({u.tag})</span>}
                        </span>
                        <span className="shrink-0 text-xs text-(--color-text-muted)">{u.row_count} rows</span>
                      </button>
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
                <div className="flex items-center gap-3">
                  <Link href="/dashboard/data" className="text-sm font-medium text-(--color-primary) hover:underline">
                    All Data →
                  </Link>
                  <Link href="/dashboard/operations" className="text-sm font-medium text-(--color-primary) hover:underline">
                    Operations Intelligence →
                  </Link>
                  <Button variant="ghost" onClick={() => setShowUpload(true)}>
                    Upload a different file
                  </Button>
                </div>
              </div>

              {uploadWarning && (
                <p className="mb-4 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{uploadWarning}</p>
              )}

              {recentUploads.length > 0 && (
                <div className="mb-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
                  <h2 className="text-sm font-semibold text-(--color-text)">
                    Your uploads <span className="font-normal text-(--color-text-muted)">({recentUploads.length})</span>
                  </h2>
                  <ul className="mt-2 divide-y divide-(--color-border)">
                    {recentUploads.map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => handleSelectUpload(u.id)}
                          disabled={switchingUpload}
                          className={`flex w-full items-center justify-between gap-3 py-2 text-left text-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                            selectedUploadId === u.id ? "text-(--color-primary)" : "text-(--color-text)"
                          }`}
                        >
                          <span className="truncate">
                            {u.filename}
                            {u.tag && <span className="ml-2 text-xs text-(--color-text-muted)">({u.tag})</span>}
                          </span>
                          <span className="shrink-0 text-xs text-(--color-text-muted)">
                            {u.row_count} rows · {new Date(u.uploaded_at).toLocaleDateString()}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
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

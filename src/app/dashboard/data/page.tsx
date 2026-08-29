"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth";
import {
  api,
  ApiError,
  UploadSummary,
  DataSourceSummary,
  DistributionEvent,
  InventoryTransaction,
  VolunteerShift,
} from "@/lib/api";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-(--color-border) bg-(--color-bg) px-2.5 py-0.5 text-xs font-medium text-(--color-text-muted)">
      {children}
    </span>
  );
}

function SectionCard({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-(--color-text)">{title}</h2>
        <span className="text-sm text-(--color-text-muted)">{count} total</span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-(--color-text-muted)">{children}</p>;
}

export default function DataSourcesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceSummary[]>([]);
  const [events, setEvents] = useState<DistributionEvent[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [shifts, setShifts] = useState<VolunteerShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uploadsResult, dataSourcesResult, eventsResult, transactionsResult, shiftsResult] = await Promise.all([
        api.listUploads(),
        api.listDataSources(),
        api.listDistributionEvents(),
        api.listInventoryTransactions(),
        api.listVolunteerShifts(),
      ]);
      setUploads(uploadsResult.uploads);
      setDataSources(dataSourcesResult);
      setEvents(eventsResult);
      setTransactions(transactionsResult);
      setShifts(shiftsResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!ready || !user || loading) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-(--color-text)">All Data</h1>
            <p className="mt-1 text-sm text-(--color-text-muted)">
              Every upload and manual entry for your organization — nothing is replaced, everything is kept and
              combined.
            </p>
          </div>
          <Link href="/dashboard/operations" className="text-sm font-medium text-(--color-primary) hover:underline">
            Operations Intelligence →
          </Link>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-(--color-error)/30 bg-(--color-error-soft) p-4 text-sm text-(--color-error)">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <SectionCard title="Uploaded spreadsheets" count={uploads.length}>
            {uploads.length === 0 ? (
              <EmptyRow>
                No files uploaded yet. <Link href="/dashboard" className="font-medium text-(--color-primary) hover:underline">Upload one →</Link>
              </EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="py-2 pr-4 font-medium">File</th>
                      <th className="py-2 pr-4 font-medium">Tag</th>
                      <th className="py-2 pr-4 font-medium">Rows</th>
                      <th className="py-2 pr-4 font-medium">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploads.map((u) => (
                      <tr key={u.id} className="border-b border-(--color-border) last:border-0">
                        <td className="py-2 pr-4">{u.filename}</td>
                        <td className="py-2 pr-4">{u.tag ? <Badge>{u.tag}</Badge> : <span className="text-(--color-text-muted)">—</span>}</td>
                        <td className="py-2 pr-4">{u.row_count}</td>
                        <td className="py-2 pr-4 text-(--color-text-muted)">{new Date(u.uploaded_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Distribution events" count={events.length}>
            {events.length === 0 ? (
              <EmptyRow>No distribution events logged yet — add one from Operations Intelligence.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Site</th>
                      <th className="py-2 pr-4 font-medium">Planned households</th>
                      <th className="py-2 pr-4 font-medium">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.distributionEventId} className="border-b border-(--color-border) last:border-0">
                        <td className="py-2 pr-4">{e.distributionDate}</td>
                        <td className="py-2 pr-4">{e.siteName ?? "—"}</td>
                        <td className="py-2 pr-4">{e.plannedHouseholds ?? "—"}</td>
                        <td className="py-2 pr-4">{e.lines.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Inventory transactions" count={transactions.length}>
            {transactions.length === 0 ? (
              <EmptyRow>No inventory transactions logged yet — add one from Operations Intelligence.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="py-2 pr-4 font-medium">Type</th>
                      <th className="py-2 pr-4 font-medium">Item</th>
                      <th className="py-2 pr-4 font-medium">Quantity</th>
                      <th className="py-2 pr-4 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.transactionId} className="border-b border-(--color-border) last:border-0">
                        <td className="py-2 pr-4">{t.transactionType.replace(/_/g, " ")}</td>
                        <td className="py-2 pr-4">{t.itemName}</td>
                        <td className="py-2 pr-4">
                          {t.quantity} {t.unitOfMeasure}
                        </td>
                        <td className="py-2 pr-4 text-(--color-text-muted)">{t.transactionDate.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Volunteer shifts" count={shifts.length}>
            {shifts.length === 0 ? (
              <EmptyRow>No volunteer shifts scheduled yet — add one from Operations Intelligence.</EmptyRow>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Site</th>
                      <th className="py-2 pr-4 font-medium">Confirmed / Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s) => (
                      <tr key={s.shiftId} className="border-b border-(--color-border) last:border-0">
                        <td className="py-2 pr-4">{s.shiftStart.slice(0, 10)}</td>
                        <td className="py-2 pr-4">{s.role ?? "—"}</td>
                        <td className="py-2 pr-4">{s.siteName ?? "—"}</td>
                        <td className="py-2 pr-4">
                          {s.confirmedCount ?? "—"} / {s.requiredCount ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </main>
    </div>
  );
}

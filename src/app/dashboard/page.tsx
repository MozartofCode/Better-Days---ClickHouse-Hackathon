"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import InventoryTable from "@/components/InventoryTable";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface Inventory {
  source: string;
  headers: string[];
  rows: Record<string, string>[];
}

export default function DashboardPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api
      .dashboardSummary()
      .then(async (summary) => {
        if (!summary.currentInventory) return;
        const detail = await api.uploadDetail(summary.currentInventory.fromUpload.id);
        setInventory({
          source: detail.upload.filename,
          headers: detail.upload.columns,
          rows: detail.rows.map((r) => r.data),
        });
      })
      .catch(() => {
        // If the API is down there's just nothing to show yet.
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (!ready || !user || loading) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {!inventory ? (
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-2xl font-semibold text-(--color-text)">No inventory yet</h1>
            <p className="mt-2 text-(--color-text-muted)">Upload a spreadsheet to see it here.</p>
            <Link href="/dashboard/upload" className="mt-6 inline-block">
              <Button>Upload a file</Button>
            </Link>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-(--color-text)">Your inventory</h1>
                <p className="text-sm text-(--color-text-muted)">From {inventory.source}</p>
              </div>
              <Link href="/dashboard/upload">
                <Button variant="ghost">Upload a different file</Button>
              </Link>
            </div>

            <InventoryTable headers={inventory.headers} rows={inventory.rows} />
          </div>
        )}
      </main>
    </div>
  );
}

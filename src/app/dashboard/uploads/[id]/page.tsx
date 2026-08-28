"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import InventoryTable from "@/components/InventoryTable";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export default function UploadDetailPage() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [data, setData] = useState<{ filename: string; uploadedAt: string; headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !params.id) return;
    api
      .uploadDetail(params.id)
      .then((detail) =>
        setData({
          filename: detail.upload.filename,
          uploadedAt: detail.upload.uploaded_at,
          headers: detail.upload.columns,
          rows: detail.rows.map((r) => r.data),
        })
      )
      .catch(() => setError("Couldn't load this file. It may have been removed."))
      .finally(() => setLoading(false));
  }, [user, params.id]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Link href="/dashboard/uploads" className="text-sm font-medium text-(--color-primary) hover:underline">
          ← Uploaded files
        </Link>

        {loading && <p className="mt-6 text-sm text-(--color-text-muted)">Loading…</p>}
        {error && <p className="mt-6 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>}

        {data && (
          <div>
            <div className="mb-6 mt-4">
              <h1 className="text-2xl font-semibold text-(--color-text)">{data.filename}</h1>
              <p className="text-sm text-(--color-text-muted)">
                Uploaded {new Date(data.uploadedAt).toLocaleString()} · {data.rows.length} row{data.rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <InventoryTable headers={data.headers} rows={data.rows} />
          </div>
        )}
      </main>
    </div>
  );
}

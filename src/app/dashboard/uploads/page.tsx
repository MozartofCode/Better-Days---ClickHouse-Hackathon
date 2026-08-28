"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

interface UploadRow {
  id: string;
  filename: string;
  columns: string[];
  row_count: number;
  uploaded_at: string;
}

export default function UploadedFilesPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .listUploads()
      .then((res) => setUploads(res.uploads))
      .catch(() => setError("Couldn't load your uploaded files. Please try again."))
      .finally(() => setLoading(false));
  }, [user]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="text-2xl font-semibold text-(--color-text)">Uploaded files</h1>
        <p className="mt-2 text-sm text-(--color-text-muted)">Every file your food bank has uploaded.</p>

        {loading && <p className="mt-6 text-sm text-(--color-text-muted)">Loading…</p>}
        {error && <p className="mt-6 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{error}</p>}

        {!loading && !error && uploads.length === 0 && (
          <p className="mt-6 text-sm text-(--color-text-muted)">
            No files uploaded yet. Go to{" "}
            <Link href="/dashboard" className="font-medium text-(--color-primary) hover:underline">
              Inventory
            </Link>{" "}
            to upload one.
          </p>
        )}

        {uploads.length > 0 && (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-xs uppercase text-(--color-text-muted)">
                  <th className="px-4 py-3 font-medium">Filename</th>
                  <th className="px-4 py-3 font-medium">Rows</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u) => (
                  <tr key={u.id} className="border-b border-(--color-border) last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/uploads/${u.id}`} className="font-medium text-(--color-primary) hover:underline">
                        {u.filename}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-(--color-text)">{u.row_count}</td>
                    <td className="px-4 py-3 text-(--color-text-muted)">{new Date(u.uploaded_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

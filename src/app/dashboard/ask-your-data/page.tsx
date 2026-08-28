"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import DropZone from "@/components/DropZone";
import { useAuth } from "@/lib/auth";
import { api, ApiError, type DemandAskResult, type DemandIngestSummary, type DemandMetric } from "@/lib/api";

// Mirrors api/src/modules/demand-data/ask.service.ts METRICS — kept in sync
// by hand since this list is tiny and rarely changes. The backend is still
// the source of truth for what each metric actually returns.
const SUGGESTED: { metric: DemandMetric; question: string }[] = [
  { metric: "topSites", question: "Which pantry sites had the highest demand this month?" },
  { metric: "trend", question: "How has demand changed over the last three months?" },
  { metric: "commodities", question: "Which commodities have the largest recorded demand?" },
  { metric: "increasing", question: "Show me the sites with increasing demand." },
  { metric: "momChange", question: "What changed compared with last month?" },
];

// Small built-in dataset so "try it with a sample file" works without a real
// export on hand — spans this month and last month across 3 sites so every
// suggested question has something to show.
function sampleRecords(): Record<string, unknown>[] {
  const now = new Date();
  const thisMonth = (day: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 10);
  const lastMonth = (day: number) => {
    const d = new Date(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  return [
    { site: "Main", date: thisMonth(5), commodity: "Produce", visits: 12, households: 10, quantity: 300, unit: "lb" },
    { site: "Main", date: thisMonth(12), commodity: "Canned Goods", visits: 15, households: 13, quantity: 250, unit: "lb" },
    { site: "North", date: thisMonth(6), commodity: "Produce", visits: 8, households: 7, quantity: 150, unit: "lb" },
    { site: "North", date: thisMonth(20), commodity: "Dairy", visits: 20, households: 18, quantity: 400, unit: "lb" },
    { site: "Mobile", date: thisMonth(15), commodity: "Canned Goods", visits: 5, households: 5, quantity: 100, unit: "lb" },
    { site: "Main", date: lastMonth(5), commodity: "Produce", visits: 9, households: 8, quantity: 220, unit: "lb" },
    { site: "North", date: lastMonth(10), commodity: "Dairy", visits: 14, households: 12, quantity: 300, unit: "lb" },
    { site: "Mobile", date: lastMonth(18), commodity: "Canned Goods", visits: 4, households: 4, quantity: 90, unit: "lb" },
  ];
}

interface HistoryEntry extends DemandAskResult {
  question: string;
}

export default function AskYourDataPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastIngest, setLastIngest] = useState<DemandIngestSummary | null>(null);

  async function handleUpload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const result = await api.demandUpload(file);
      setLastIngest(result);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Couldn't read that file. Please check the format and try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUseSample() {
    setUploadError(null);
    setUploading(true);
    try {
      const result = await api.demandIngestJson("sample-demand-data.json", sampleRecords());
      setLastIngest(result);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Couldn't load the sample data.");
    } finally {
      setUploading(false);
    }
  }

  async function runQuestion(question: string, run: () => Promise<DemandAskResult>) {
    setAskError(null);
    setAsking(true);
    try {
      const result = await run();
      setHistory((prev) => [{ ...result, question }, ...prev]);
      setInput("");
    } catch (err) {
      setAskError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setAsking(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || asking) return;
    runQuestion(trimmed, () => api.askDemandQuestion(trimmed));
  }

  function handleSuggested(metric: DemandMetric, question: string) {
    if (asking) return;
    runQuestion(question, () => api.runSuggestedDemandQuestion(metric));
  }

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-(--color-text)">Ask Your Data</h1>
          <p className="mt-2 text-sm text-(--color-text-muted)">
            Ask about community demand across your sites — visits, households served, and commodities.
            Every answer is backed by a real query you can see below it.
          </p>
        </div>

        <details className="mb-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
          <summary className="cursor-pointer text-sm font-medium text-(--color-text)">
            Upload demand data {lastIngest && <span className="font-normal text-(--color-text-muted)">— last upload: {lastIngest.rowCount} rows, {lastIngest.normalizedCount} usable</span>}
          </summary>
          <div className="mt-4">
            <DropZone onFiles={handleUpload} onUseSample={handleUseSample} error={uploadError} />
            {uploading && <p className="mt-3 text-center text-sm text-(--color-text-muted)">Reading your file…</p>}
            {lastIngest && !uploading && (
              <p className="mt-3 text-center text-sm text-(--color-text-muted)">
                {lastIngest.filename}: {lastIngest.rowCount} rows read, {lastIngest.normalizedCount} usable
                {lastIngest.errorCount > 0 && `, ${lastIngest.errorCount} skipped (missing date or site/commodity)`}.
              </p>
            )}
          </div>
        </details>

        <div className="mb-6 flex flex-wrap gap-2">
          {SUGGESTED.map((s) => (
            <button
              key={s.metric}
              type="button"
              disabled={asking}
              onClick={() => handleSuggested(s.metric, s.question)}
              className="rounded-full border border-(--color-border) bg-(--color-surface) px-4 py-2 text-sm text-(--color-text) hover:border-(--color-primary) disabled:opacity-50"
            >
              {s.question}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mb-6 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your community demand data…"
            className="flex-1 rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none focus:border-(--color-primary)"
          />
          <Button type="submit" disabled={asking || !input.trim()}>
            {asking ? "Asking…" : "Ask"}
          </Button>
        </form>

        {askError && (
          <p className="mb-6 rounded-lg bg-(--color-error-soft) px-4 py-3 text-sm text-(--color-error)">{askError}</p>
        )}

        {asking && (
          <p className="mb-6 text-sm text-(--color-text-muted)">Running your query…</p>
        )}

        {history.length === 0 && !asking && (
          <p className="text-center text-sm text-(--color-text-muted)">
            Try one of the questions above, or upload your demand data first if you haven&apos;t yet.
          </p>
        )}

        <div className="space-y-6">
          {history.map((entry, i) => (
            <AnswerCard key={i} entry={entry} />
          ))}
        </div>
      </main>
    </div>
  );
}

function AnswerCard({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
      <p className="text-sm font-medium text-(--color-text-muted)">{entry.question}</p>
      <p className="mt-2 text-(--color-text)">{entry.answer}</p>
      {!entry.narratedByAi && (
        <p className="mt-1 text-xs text-(--color-text-muted)">Templated answer (AI narration unavailable) — the numbers below are unaffected.</p>
      )}
      <ResultTable data={entry.data} />
    </div>
  );
}

function ResultTable({ data }: { data: unknown }) {
  if (data === null || data === undefined) return null;

  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) {
    return <p className="mt-4 text-sm text-(--color-text-muted)">No rows in the underlying data.</p>;
  }

  const columns = Object.keys(rows[0] as Record<string, unknown>);

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-(--color-border)">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-(--color-border) text-xs uppercase text-(--color-text-muted)">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-(--color-border) last:border-0">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 text-(--color-text)">
                  {String((row as Record<string, unknown>)[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

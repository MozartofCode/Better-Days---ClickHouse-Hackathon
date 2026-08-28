"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import DropZone, { isAccepted, MAX_FILES } from "@/components/DropZone";
import StepProgress from "@/components/StepProgress";
import RecognitionScreen from "@/components/RecognitionScreen";
import ConfirmMapping from "@/components/ConfirmMapping";
import ResultsTabs from "@/components/ResultsTabs";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { parseFiles } from "@/lib/parse";
import { mapColumns, buildContract } from "@/lib/mapping";
import { reconcile } from "@/lib/engines/reconcile";
import { runChecks } from "@/lib/engines/quality";
import { SAMPLE_CONTRACT } from "@/lib/mockData";
import type { ColumnMapping, Contract, ParsedFile } from "@/lib/schema";

type Step = "upload" | "recognition" | "confirm" | "results";

export default function DashboardPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace("/signin");
  }, [ready, user, router]);

  const [step, setStep] = useState<Step>("upload");
  const [parsedFiles, setParsedFiles] = useState<ParsedFile[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [lbPerCase, setLbPerCase] = useState(30);
  const [contract, setContract] = useState<Contract | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [recentUploads, setRecentUploads] = useState<{ id: string; filename: string; row_count: number; uploaded_at: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    api
      .dashboardSummary()
      .then((summary) => setRecentUploads(summary.recentUploads))
      .catch(() => {
        // Dashboard history is a nice-to-have; don't block the upload flow if the API is down.
      });
  }, [user]);

  const needsCaseInput = mappings.some((m) => m.unitHint === "cases");

  async function handleFiles(files: File[]) {
    setUploadError(null);
    setUploadWarning(null);

    if (files.length === 0) return;

    const rejected = files.filter((f) => !isAccepted(f));
    if (rejected.length > 0) {
      setUploadError(
        `${rejected.map((f) => f.name).join(", ")} isn't a supported file type. Please upload .xlsx or .csv files only.`
      );
      return;
    }
    if (files.length > MAX_FILES) {
      setUploadError(`Please upload up to ${MAX_FILES} files at a time.`);
      return;
    }

    setProcessing(true);
    try {
      const parsed = await parseFiles(files);
      const newMappings = parsed.map(mapColumns);
      setParsedFiles(parsed);
      setMappings(newMappings);
      setStep("recognition");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "We couldn't read one of those files. Please check the format and try again.");
      setProcessing(false);
      return;
    }
    setProcessing(false);

    const failures: string[] = [];
    for (const file of files) {
      try {
        const saved = await api.uploadFile(file);
        setRecentUploads((prev) => [{ id: saved.id, filename: saved.filename, row_count: saved.rowCount, uploaded_at: new Date().toISOString() }, ...prev]);
      } catch {
        failures.push(file.name);
      }
    }
    if (failures.length > 0) {
      setUploadWarning(`We reconciled your files, but couldn't save ${failures.join(", ")} to your account. You can still view your results below.`);
    }
  }

  function handleUseSample() {
    setContract(SAMPLE_CONTRACT);
    setStep("results");
  }

  function handleConfirmMapping(finalMappings: ColumnMapping[]) {
    const inputs = parsedFiles.map((file, i) => ({ file, mapping: finalMappings[i], lbPerCase }));
    const built = buildContract(inputs);
    setContract(built);
    setStep("results");
  }

  function startOver() {
    setStep("upload");
    setParsedFiles([]);
    setMappings([]);
    setContract(null);
    setUploadError(null);
  }

  const variances = useMemo(() => (contract ? reconcile(contract) : []), [contract]);
  const exceptions = useMemo(() => (contract ? runChecks(contract) : []), [contract]);

  // Preview built from the automatic mapping, purely to populate the
  // recognition screen's date range / sites before the user confirms anything.
  const previewContract = useMemo(() => {
    if (parsedFiles.length === 0) return null;
    const inputs = parsedFiles.map((file, i) => ({ file, mapping: mappings[i], lbPerCase }));
    return buildContract(inputs);
  }, [parsedFiles, mappings, lbPerCase]);

  if (!ready || !user) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  const stepNumber = { upload: 1, recognition: 2, confirm: 3, results: 4 }[step];

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-10">
          <StepProgress current={stepNumber} />
        </div>

        {step === "upload" && (
          <div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-(--color-text)">Upload your files</h1>
              <p className="mt-2 text-(--color-text-muted)">
                Bring the spreadsheets you already have. We&apos;ll take it from here.
              </p>
            </div>

            <div className="mt-8">
              <DropZone onFiles={handleFiles} onUseSample={handleUseSample} error={uploadError} />
            </div>

            {processing && <p className="mt-4 text-center text-sm text-(--color-text-muted)">Reading your files…</p>}
            {uploadWarning && (
              <p className="mt-4 text-center text-sm text-(--color-error)">{uploadWarning}</p>
            )}

            <div className="mt-10 rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <h2 className="text-sm font-semibold text-(--color-text)">What happens after you upload</h2>
              <ol className="mt-3 space-y-2 text-sm text-(--color-text-muted)">
                <li>1. We read your files and create your reconciliation right here in the browser.</li>
                <li>2. We check the data for quality issues.</li>
                <li>3. Your files are saved to {user.foodBankName}&apos;s account so your team can see them later.</li>
              </ol>
            </div>

            <div className="mt-4 rounded-2xl bg-(--color-primary-soft) p-6">
              <h2 className="text-sm font-semibold text-(--color-primary)">Your data, scoped to your food bank</h2>
              <ul className="mt-3 space-y-1.5 text-sm text-(--color-text)">
                <li>• Uploaded files are saved to your account so you can revisit them later.</li>
                <li>• Only your food bank&apos;s staff can see your uploads — never other organizations.</li>
                <li>• Reconciliation and quality checks run locally in your browser before anything is sent.</li>
              </ul>
            </div>

            {recentUploads.length > 0 && (
              <div className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
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
        )}

        {step === "recognition" && (
          <RecognitionScreen
            files={parsedFiles}
            mappings={mappings}
            dateRange={previewContract?.meta.dateRange ?? { start: null, end: null }}
            sites={previewContract?.meta.sites ?? []}
            onContinue={() => setStep("confirm")}
          />
        )}

        {step === "confirm" && (
          <div>
            <ConfirmMapping
              files={parsedFiles}
              mappings={mappings}
              onBack={() => setStep("recognition")}
              onConfirm={handleConfirmMapping}
            />
            {needsCaseInput && (
              <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-(--color-border) bg-(--color-surface) p-5 text-center">
                <label className="block text-sm font-medium text-(--color-text)">
                  One of your files uses cases instead of pounds. How many pounds per case?
                </label>
                <input
                  type="number"
                  min={1}
                  value={lbPerCase}
                  onChange={(e) => setLbPerCase(Number(e.target.value) || 30)}
                  className="mt-2 w-32 rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2 text-center text-sm outline-none focus:border-(--color-primary)"
                />
              </div>
            )}
          </div>
        )}

        {step === "results" && contract && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-(--color-text)">Your results</h1>
              <Button variant="ghost" onClick={startOver}>
                Upload different files
              </Button>
            </div>
            <ResultsTabs contract={contract} variances={variances} exceptions={exceptions} />
          </div>
        )}
      </main>
    </div>
  );
}

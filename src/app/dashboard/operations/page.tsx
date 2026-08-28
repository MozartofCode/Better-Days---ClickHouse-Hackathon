"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Button from "@/components/Button";
import { useAuth } from "@/lib/auth";
import {
  api,
  ApiError,
  OperationsDashboard,
  OperationsRecommendation,
  ReconciliationException,
  GeneratedReportRow,
  DataQualityIssue,
  INVENTORY_TRANSACTION_TYPES,
} from "@/lib/api";

const inputClass =
  "w-full rounded-xl border border-(--color-border) bg-(--color-bg) px-3 py-2 text-sm text-(--color-text) focus:outline-none focus:border-(--color-primary)";
const labelClass = "block text-xs font-medium text-(--color-text-muted)";
const fieldClass = "space-y-1";

const READINESS_LABEL: Record<OperationsDashboard["readiness"]["status"], string> = {
  green: "Ready",
  yellow: "Attention Needed",
  red: "High Risk",
  unknown: "Unknown",
};

const READINESS_CLASS: Record<OperationsDashboard["readiness"]["status"], string> = {
  green: "bg-(--color-success-soft) text-(--color-success) border-(--color-success)/30",
  yellow: "bg-(--color-warn-soft) text-(--color-warn) border-(--color-warn)/30",
  red: "bg-(--color-error-soft) text-(--color-error) border-(--color-error)/30",
  unknown: "bg-(--color-border)/40 text-(--color-text-muted) border-(--color-border)",
};

const PRIORITY_CLASS: Record<OperationsRecommendation["priority"], string> = {
  Critical: "bg-(--color-error-soft) text-(--color-error) border-(--color-error)/30",
  High: "bg-(--color-warn-soft) text-(--color-warn) border-(--color-warn)/30",
  Medium: "bg-(--color-primary-soft) text-(--color-primary) border-(--color-primary)/30",
};

const SEVERITY_CLASS: Record<ReconciliationException["severity"], string> = {
  critical: "bg-(--color-error-soft) text-(--color-error) border-(--color-error)/30",
  high: "bg-(--color-error-soft) text-(--color-error) border-(--color-error)/30",
  medium: "bg-(--color-warn-soft) text-(--color-warn) border-(--color-warn)/30",
  low: "bg-(--color-border)/40 text-(--color-text-muted) border-(--color-border)",
};

const REPORT_TEMPLATES: { id: string; label: string }[] = [
  { id: "distribution_readiness_brief", label: "Distribution Readiness Brief" },
  { id: "monthly_operations_reconciliation", label: "Monthly Operations & Reconciliation" },
];

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
      <div className="text-sm text-(--color-text-muted)">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-(--color-text)">{value}</div>
      {hint && <div className="mt-1 text-xs text-(--color-text-muted)">{hint}</div>}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: OperationsRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--color-primary-soft) text-xs font-semibold text-(--color-primary)">
          {rec.rank}
        </span>
        <Badge className={PRIORITY_CLASS[rec.priority]}>{rec.priority}</Badge>
        <span className="text-xs uppercase tracking-wide text-(--color-text-muted)">
          {rec.recommendationType.replace(/_/g, " ")}
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold text-(--color-text)">{rec.title}</h3>
      <p className="mt-2 text-sm text-(--color-text)">{rec.recommendedAction}</p>
      <p className="mt-2 text-sm text-(--color-text-muted)">{rec.whyNow}</p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-(--color-text-muted)">
        <span>
          Owner: <span className="font-medium text-(--color-text)">{rec.ownerRole}</span>
        </span>
        {rec.dueBy && (
          <span>
            Due: <span className="font-medium text-(--color-text)">{rec.dueBy}</span>
          </span>
        )}
        <span>
          Confidence: <span className="font-medium text-(--color-text)">{rec.confidence}</span>
        </span>
        <span>
          Evidence: <span className="font-medium text-(--color-text)">{rec.evidence.length}</span>
        </span>
      </div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-sm font-medium text-(--color-primary) hover:underline cursor-pointer"
      >
        {expanded ? "Hide evidence" : "View evidence"}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 rounded-xl bg-(--color-bg) p-3 text-xs text-(--color-text-muted)">
          {rec.evidence.map((ev, i) => (
            <div key={i}>
              {ev.description}
              {ev.sourceReferences.length > 0 && (
                <span className="text-(--color-text-muted)"> — {ev.sourceReferences.join(", ")}</span>
              )}
            </div>
          ))}
          <div className="pt-1 italic">{rec.confidenceRationale}</div>
        </div>
      )}
    </div>
  );
}

function ExceptionRow({
  exception,
  onUpdate,
}: {
  exception: ReconciliationException;
  onUpdate: (id: string, action: "resolve" | "not_applicable") => void;
}) {
  return (
    <tr className="border-b border-(--color-border) last:border-0">
      <td className="py-3 pr-4">
        <Badge className={SEVERITY_CLASS[exception.severity]}>{exception.severity}</Badge>
      </td>
      <td className="py-3 pr-4 text-sm">{exception.exceptionType.replace(/_/g, " ")}</td>
      <td className="py-3 pr-4 text-sm text-(--color-text-muted)">{exception.explanation}</td>
      <td className="py-3 pr-4 text-sm">
        {exception.affectedQuantity ?? "—"} {exception.unitOfMeasure ?? ""}
      </td>
      <td className="py-3 pr-4">
        <div className="flex gap-2">
          <button
            onClick={() => onUpdate(exception.exceptionId, "resolve")}
            className="text-xs font-medium text-(--color-primary) hover:underline cursor-pointer"
          >
            Mark Resolved
          </button>
          <button
            onClick={() => onUpdate(exception.exceptionId, "not_applicable")}
            className="text-xs font-medium text-(--color-text-muted) hover:underline cursor-pointer"
          >
            Not Applicable
          </button>
        </div>
      </td>
    </tr>
  );
}

function DataQualityNotice({ issues }: { issues: DataQualityIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-(--color-bg) p-3 text-xs">
      {issues.map((issue, i) => (
        <div
          key={i}
          className={
            issue.severity === "blocking"
              ? "text-(--color-error)"
              : issue.severity === "warning"
                ? "text-(--color-warn)"
                : "text-(--color-text-muted)"
          }
        >
          [{issue.severity.toUpperCase()}] {issue.message}
        </div>
      ))}
    </div>
  );
}

interface DistributionLineDraft {
  itemName: string;
  unit: string;
  quantityPlanned: string;
}

function emptyLine(): DistributionLineDraft {
  return { itemName: "", unit: "", quantityPlanned: "" };
}

function DistributionEventForm({ onCreated }: { onCreated: () => void }) {
  const [distributionDate, setDistributionDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [siteName, setSiteName] = useState("");
  const [programName, setProgramName] = useState("");
  const [plannedHouseholds, setPlannedHouseholds] = useState("");
  const [plannedBoxes, setPlannedBoxes] = useState("");
  const [lines, setLines] = useState<DistributionLineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<DistributionLineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.createDistributionEvent({
        distributionDate,
        startTime: startTime ? new Date(`${distributionDate}T${startTime}`).toISOString() : undefined,
        siteName: siteName || undefined,
        programName: programName || undefined,
        plannedHouseholds: plannedHouseholds ? Number(plannedHouseholds) : undefined,
        plannedBoxes: plannedBoxes ? Number(plannedBoxes) : undefined,
        lines: lines
          .filter((l) => l.itemName.trim())
          .map((l) => ({
            itemName: l.itemName,
            unit: l.unit || undefined,
            quantityPlanned: l.quantityPlanned ? Number(l.quantityPlanned) : undefined,
          })),
      });
      setDistributionDate("");
      setStartTime("");
      setSiteName("");
      setProgramName("");
      setPlannedHouseholds("");
      setPlannedBoxes("");
      setLines([emptyLine()]);
      setMessage("Distribution event logged.");
      onCreated();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to log distribution event");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldClass}>
          <label className={labelClass}>Distribution date</label>
          <input type="date" required value={distributionDate} onChange={(e) => setDistributionDate(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Start time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Site</label>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Main Site" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Program</label>
          <input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Optional" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Planned households</label>
          <input type="number" min="0" value={plannedHouseholds} onChange={(e) => setPlannedHouseholds(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Planned boxes</label>
          <input type="number" min="0" value={plannedBoxes} onChange={(e) => setPlannedBoxes(e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Planned items</label>
        <div className="mt-1 space-y-2">
          {lines.map((line, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                value={line.itemName}
                onChange={(e) => updateLine(i, { itemName: e.target.value })}
                placeholder="Item name"
                className={`flex-1 min-w-[140px] ${inputClass}`}
              />
              <input
                value={line.unit}
                onChange={(e) => updateLine(i, { unit: e.target.value })}
                placeholder="Unit"
                className={`w-24 ${inputClass}`}
              />
              <input
                type="number"
                min="0"
                value={line.quantityPlanned}
                onChange={(e) => updateLine(i, { quantityPlanned: e.target.value })}
                placeholder="Qty planned"
                className={`w-28 ${inputClass}`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine()])}
          className="mt-2 text-xs font-medium text-(--color-primary) hover:underline cursor-pointer"
        >
          + Add another item
        </button>
      </div>

      {message && <p className="text-xs text-(--color-text-muted)">{message}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Log distribution event"}
      </Button>
    </form>
  );
}

function InventoryTransactionForm({ onCreated }: { onCreated: () => void }) {
  const [transactionType, setTransactionType] = useState<(typeof INVENTORY_TRANSACTION_TYPES)[number]>("receipt");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("");
  const [quantity, setQuantity] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [siteName, setSiteName] = useState("");
  const [weightLbs, setWeightLbs] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.createInventoryTransaction({
        transactionType,
        itemName,
        unit: unit || undefined,
        quantity: Number(quantity),
        transactionDate: new Date(transactionDate).toISOString(),
        siteName: siteName || undefined,
        weightLbs: weightLbs ? Number(weightLbs) : undefined,
        notes: notes || undefined,
      });
      setItemName("");
      setUnit("");
      setQuantity("");
      setTransactionDate("");
      setSiteName("");
      setWeightLbs("");
      setNotes("");
      setMessage("Transaction logged.");
      onCreated();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to log transaction");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldClass}>
          <label className={labelClass}>Type</label>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value as (typeof INVENTORY_TRANSACTION_TYPES)[number])}
            className={inputClass}
          >
            {INVENTORY_TRANSACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Date</label>
          <input type="date" required value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Item name</label>
          <input required value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Unit</label>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="lbs, cases…" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Quantity</label>
          <input type="number" required value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Weight (lbs)</label>
          <input type="number" min="0" value={weightLbs} onChange={(e) => setWeightLbs(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Site</label>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Main Site" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className={inputClass} />
        </div>
      </div>

      {message && <p className="text-xs text-(--color-text-muted)">{message}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Log transaction"}
      </Button>
    </form>
  );
}

function VolunteerShiftForm({ onCreated }: { onCreated: () => void }) {
  const [siteName, setSiteName] = useState("");
  const [programName, setProgramName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [role, setRole] = useState("");
  const [requiredCount, setRequiredCount] = useState("");
  const [confirmedCount, setConfirmedCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api.createVolunteerShift({
        siteName: siteName || undefined,
        programName: programName || undefined,
        shiftStart: new Date(`${date}T${startTime}`).toISOString(),
        shiftEnd: new Date(`${date}T${endTime}`).toISOString(),
        role: role || undefined,
        requiredCount: requiredCount ? Number(requiredCount) : undefined,
        confirmedCount: confirmedCount ? Number(confirmedCount) : undefined,
      });
      setDate("");
      setStartTime("");
      setEndTime("");
      setRole("");
      setRequiredCount("");
      setConfirmedCount("");
      setMessage("Volunteer shift scheduled.");
      onCreated();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Failed to schedule shift");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className={fieldClass}>
          <label className={labelClass}>Date</label>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Warehouse, driver…" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Start time</label>
          <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>End time</label>
          <input type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Required volunteers</label>
          <input type="number" min="0" value={requiredCount} onChange={(e) => setRequiredCount(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Confirmed volunteers</label>
          <input type="number" min="0" value={confirmedCount} onChange={(e) => setConfirmedCount(e.target.value)} className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Site</label>
          <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Main Site" className={inputClass} />
        </div>
        <div className={fieldClass}>
          <label className={labelClass}>Program</label>
          <input value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Optional" className={inputClass} />
        </div>
      </div>

      {message && <p className="text-xs text-(--color-text-muted)">{message}</p>}
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Schedule shift"}
      </Button>
    </form>
  );
}

function LogOperationsData({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left cursor-pointer"
      >
        <span className="text-sm font-medium text-(--color-text)">
          Log Operations Data
          <span className="ml-2 font-normal text-(--color-text-muted)">
            Distribution events, inventory transactions, and volunteer shifts — required for the reports below to generate.
          </span>
        </span>
        <span className="text-(--color-text-muted)">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="text-sm font-semibold text-(--color-text)">Distribution event</h3>
            <p className="mt-1 text-xs text-(--color-text-muted)">A scheduled or completed distribution.</p>
            <div className="mt-3">
              <DistributionEventForm onCreated={onCreated} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-(--color-text)">Inventory transaction</h3>
            <p className="mt-1 text-xs text-(--color-text-muted)">A receipt, distribution, waste, or other inventory movement.</p>
            <div className="mt-3">
              <InventoryTransactionForm onCreated={onCreated} />
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-(--color-text)">Volunteer shift</h3>
            <p className="mt-1 text-xs text-(--color-text-muted)">Staffing plan for a shift.</p>
            <div className="mt-3">
              <VolunteerShiftForm onCreated={onCreated} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperationsDashboardPage() {
  const { user, ready } = useAuth();
  const router = useRouter();

  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<GeneratedReportRow[]>([]);
  const [generating, setGenerating] = useState<string | null>(null);
  const [reportIssues, setReportIssues] = useState<Record<string, DataQualityIssue[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboardResult, reportsResult] = await Promise.all([
        api.operationsDashboard(),
        api.listGeneratedReports(),
      ]);
      setDashboard(dashboardResult);
      setReports(reportsResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load dashboard");
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

  async function handleExceptionUpdate(id: string, action: "resolve" | "not_applicable") {
    await api.updateException(id, { action });
    load();
  }

  async function handleGenerate(templateId: string, forceIncomplete = false) {
    setGenerating(templateId);
    try {
      const result = await api.generateReport(templateId, forceIncomplete ? { forceIncomplete: true } : {});
      if (result.status === "blocked") {
        setReportIssues((prev) => ({ ...prev, [templateId]: result.dataQuality.issues }));
      } else {
        setReportIssues((prev) => ({ ...prev, [templateId]: result.dataQuality.issues }));
        await api.downloadReport(result.report.reportId, result.report.filename);
        const reportsResult = await api.listGeneratedReports();
        setReports(reportsResult);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Report generation failed");
    } finally {
      setGenerating(null);
    }
  }

  if (!ready || !user || loading) {
    return <div className="min-h-screen bg-(--color-bg)" />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-(--color-bg)">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-(--color-text)">Operations Intelligence</h1>
            {dashboard && (
              <p className="mt-1 text-sm text-(--color-text-muted)">
                As of {new Date(dashboard.asOf).toLocaleString()} — data status:{" "}
                <span className="font-medium text-(--color-text)">{dashboard.dataStatus.replace(/_/g, " ")}</span>
                {dashboard.syncedUploads > 0 && ` — ${dashboard.syncedUploads} upload(s) synced this load`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {REPORT_TEMPLATES.map((t) => (
              <Button
                key={t.id}
                variant="secondary"
                disabled={generating === t.id}
                onClick={() => handleGenerate(t.id)}
              >
                {generating === t.id ? "Generating…" : `Generate ${t.label}`}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-(--color-error)/30 bg-(--color-error-soft) p-4 text-sm text-(--color-error)">
            {error}
          </div>
        )}

        {Object.entries(reportIssues).map(
          ([templateId, issues]) =>
            issues.length > 0 && (
              <div key={templateId} className="mt-4 rounded-2xl border border-(--color-border) bg-(--color-surface) p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-(--color-text)">
                    {REPORT_TEMPLATES.find((t) => t.id === templateId)?.label}: data quality
                  </span>
                  {issues.some((i) => i.severity === "blocking") && (
                    <Button variant="ghost" onClick={() => handleGenerate(templateId, true)}>
                      Generate incomplete draft anyway
                    </Button>
                  )}
                </div>
                <DataQualityNotice issues={issues} />
              </div>
            )
        )}

        {dashboard && (
          <>
            {/* Readiness */}
            <div className="mt-6 rounded-2xl border border-(--color-border) bg-(--color-surface) p-6">
              <div className="flex items-center gap-3">
                <Badge className={READINESS_CLASS[dashboard.readiness.status]}>
                  {READINESS_LABEL[dashboard.readiness.status]}
                </Badge>
                <span className="text-sm font-medium text-(--color-text)">Next Distribution Readiness</span>
              </div>
              <p className="mt-2 text-sm text-(--color-text-muted)">{dashboard.readiness.explanation}</p>
            </div>

            {/* Top three recommendations */}
            <h2 className="mt-8 text-lg font-semibold text-(--color-text)">Top Three Recommendations</h2>
            {dashboard.topThreeRecommendations.length === 0 ? (
              <p className="mt-2 text-sm text-(--color-text-muted)">
                No recommendations — no risks detected in the current data, or insufficient data to assess.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {dashboard.topThreeRecommendations.map((rec) => (
                  <RecommendationCard key={rec.rank} rec={rec} />
                ))}
              </div>
            )}

            {/* Metric cards */}
            <h2 className="mt-8 text-lg font-semibold text-(--color-text)">Metrics</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Items tracked" value={String(dashboard.metrics.totalItems)} />
              <MetricCard label="Inventory lots" value={String(dashboard.metrics.totalInventoryLots)} />
              <MetricCard
                label="Unresolved exceptions"
                value={String(dashboard.metrics.unresolvedExceptionCount)}
                hint={Object.entries(dashboard.metrics.exceptionSeverityCounts)
                  .filter(([, count]) => count > 0)
                  .map(([sev, count]) => `${count} ${sev}`)
                  .join(", ")}
              />
              <MetricCard
                label="Data freshness"
                value={
                  dashboard.metrics.dataFreshnessAgeMinutes === null
                    ? "Insufficient data"
                    : `${dashboard.metrics.dataFreshnessAgeMinutes} min old`
                }
              />
            </div>

            {/* Near-expiry */}
            <h2 className="mt-8 text-lg font-semibold text-(--color-text)">Near-Expiry Inventory</h2>
            {dashboard.nearExpiry.length === 0 ? (
              <p className="mt-2 text-sm text-(--color-text-muted)">No items expiring within the next 7 days.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="px-4 py-3 font-medium">Quantity</th>
                      <th className="px-4 py-3 font-medium">Unit</th>
                      <th className="px-4 py-3 font-medium">Days to expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.nearExpiry.map((n) => (
                      <tr key={n.lotId} className="border-b border-(--color-border) last:border-0 text-sm">
                        <td className="px-4 py-3">{n.quantityOnHand}</td>
                        <td className="px-4 py-3">{n.unit}</td>
                        <td className="px-4 py-3">{n.daysToExpiry}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Exception queue */}
            <h2 className="mt-8 text-lg font-semibold text-(--color-text)">Reconciliation Exceptions</h2>
            {dashboard.exceptions.length === 0 ? (
              <p className="mt-2 text-sm text-(--color-text-muted)">No issues found.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface) px-4">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                      <th className="py-3 pr-4 font-medium">Severity</th>
                      <th className="py-3 pr-4 font-medium">Type</th>
                      <th className="py-3 pr-4 font-medium">Why it matters</th>
                      <th className="py-3 pr-4 font-medium">Quantity</th>
                      <th className="py-3 pr-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.exceptions.map((e) => (
                      <ExceptionRow key={e.exceptionId} exception={e} onUpdate={handleExceptionUpdate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Generated reports */}
        <h2 className="mt-8 text-lg font-semibold text-(--color-text)">Generated Reports</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-(--color-text-muted)">No reports generated yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-(--color-border) bg-(--color-surface)">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-(--color-border) text-xs uppercase tracking-wide text-(--color-text-muted)">
                  <th className="px-4 py-3 font-medium">Report</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Generated</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.reportId} className="border-b border-(--color-border) last:border-0 text-sm">
                    <td className="px-4 py-3">{REPORT_TEMPLATES.find((t) => t.id === r.templateId)?.label ?? r.templateId}</td>
                    <td className="px-4 py-3">
                      {r.blocked ? (
                        <Badge className={SEVERITY_CLASS.medium}>incomplete draft</Badge>
                      ) : (
                        <Badge className={READINESS_CLASS.unknown}>{r.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-(--color-text-muted)">{new Date(r.generatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => api.downloadReport(r.reportId, r.filename)}
                        className="text-sm font-medium text-(--color-primary) hover:underline cursor-pointer"
                      >
                        Download
                      </button>
                    </td>
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

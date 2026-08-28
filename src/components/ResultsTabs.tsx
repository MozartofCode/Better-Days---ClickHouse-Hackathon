"use client";

import { useState } from "react";
import type { Contract, QualityException, Variance } from "@/lib/schema";
import VarianceTable from "./VarianceTable";
import ExceptionList from "./ExceptionList";
import ReportView from "./ReportView";

type Tab = "reconcile" | "quality" | "report";

interface Props {
  contract: Contract;
  variances: Variance[];
  exceptions: QualityException[];
}

export default function ResultsTabs({ contract, variances, exceptions }: Props) {
  const hasInventory = contract.inventory.length > 0;
  const hasVisits = contract.visits.length > 0;
  const [tab, setTab] = useState<Tab>(hasInventory ? "reconcile" : "quality");

  const errorCount = exceptions.filter((e) => e.severity === "error").reduce((n, e) => n + e.count, 0);
  const totalRows = contract.inventory.length + contract.visits.length + contract.households.length;

  const tabs: { id: Tab; label: string; visible: boolean; badge?: number }[] = [
    { id: "reconcile", label: "Reconcile", visible: hasInventory, badge: variances.filter((v) => v.flagged).length },
    { id: "quality", label: "Data Quality", visible: true, badge: errorCount },
    { id: "report", label: "Report", visible: hasVisits },
  ];

  return (
    <div>
      <div className="flex gap-1 border-b border-(--color-border)">
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium cursor-pointer ${
                tab === t.id
                  ? "border-(--color-primary) text-(--color-primary)"
                  : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
              }`}
            >
              {t.label}
              {!!t.badge && (
                <span className="rounded-full bg-(--color-warn-soft) px-2 py-0.5 text-xs font-bold text-(--color-warn)">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
      </div>

      <div className="mt-6">
        {tab === "reconcile" && hasInventory && <VarianceTable variances={variances} />}
        {tab === "quality" && <ExceptionList exceptions={exceptions} totalRows={totalRows} />}
        {tab === "report" && hasVisits && <ReportView contract={contract} variances={variances} exceptions={exceptions} />}
      </div>
    </div>
  );
}

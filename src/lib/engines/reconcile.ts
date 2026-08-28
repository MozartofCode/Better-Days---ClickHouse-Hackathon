// Pure function. No DOM, no fetch, no side effects.
// This file performs every unit of arithmetic behind the Reconcile tab.
// The AI layer never touches these numbers.

import type { Contract, Variance } from "../schema";

export interface ReconcileOptions {
  thresholdPct: number; // default 2
}

export function reconcile(contract: Contract, opts: ReconcileOptions = { thresholdPct: 2 }): Variance[] {
  return contract.inventory.map((row) => {
    const expectedEndingLb =
      row.beginningLb + row.receivedLb - row.distributedLb - row.transferredLb - row.documentedLossLb;

    if (row.physicalCountLb === null) {
      return {
        id: row.id,
        commodity: row.commodity,
        lot: row.lot,
        beginningLb: row.beginningLb,
        receivedLb: row.receivedLb,
        distributedLb: row.distributedLb,
        transferredLb: row.transferredLb,
        documentedLossLb: row.documentedLossLb,
        expectedEndingLb: round1(expectedEndingLb),
        physicalCountLb: null,
        varianceLb: null,
        variancePct: null,
        flagged: false,
        direction: "no-count",
        sourceFile: row.sourceFile,
        sourceRows: row.sourceRows,
      };
    }

    const varianceLb = expectedEndingLb - row.physicalCountLb;
    const variancePct = expectedEndingLb === 0 ? 0 : (Math.abs(varianceLb) / Math.abs(expectedEndingLb)) * 100;

    let direction: Variance["direction"];
    let flagged: boolean;

    if (expectedEndingLb < 0) {
      direction = "impossible";
      flagged = true;
    } else if (expectedEndingLb === 0) {
      direction = row.physicalCountLb === 0 ? "balanced" : varianceLb < 0 ? "over" : "short";
      flagged = row.physicalCountLb !== 0;
    } else if (Math.abs(varianceLb) < 0.05) {
      direction = "balanced";
      flagged = false;
    } else {
      direction = varianceLb > 0 ? "short" : "over";
      flagged = variancePct > opts.thresholdPct;
    }

    return {
      id: row.id,
      commodity: row.commodity,
      lot: row.lot,
      beginningLb: round1(row.beginningLb),
      receivedLb: round1(row.receivedLb),
      distributedLb: round1(row.distributedLb),
      transferredLb: round1(row.transferredLb),
      documentedLossLb: round1(row.documentedLossLb),
      expectedEndingLb: round1(expectedEndingLb),
      physicalCountLb: round1(row.physicalCountLb),
      varianceLb: round1(varianceLb),
      variancePct: round1(variancePct),
      flagged,
      direction,
      sourceFile: row.sourceFile,
      sourceRows: row.sourceRows,
    };
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

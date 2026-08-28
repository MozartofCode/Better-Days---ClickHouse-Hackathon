// Persists exceptions.ts's freshly-detected DetectedException[] into
// reconciliation_exceptions, and serves the exception queue / status
// updates. Every query is scoped by organization_id from the caller
// (always req.user.foodBankId at the route layer — never a client param),
// matching the pattern in operations.service.ts.

import { pgPool } from "../../db/postgres";
import { HttpError } from "../../utils/http-error";
import { DetectedException } from "./exceptions";
import { ReconciliationException } from "./types";

function toReconciliationException(row: any): ReconciliationException {
  return {
    exceptionId: row.exception_id,
    organizationId: row.organization_id,
    siteId: row.site_id,
    programId: row.program_id,
    exceptionType: row.exception_type,
    severity: row.severity,
    status: row.status,
    affectedItemId: row.affected_item_id,
    affectedInventoryLotId: row.affected_inventory_lot_id,
    affectedDistributionEventId: row.affected_distribution_event_id,
    affectedQuantity: row.affected_quantity === null ? null : Number(row.affected_quantity),
    unitOfMeasure: row.unit_of_measure,
    affectedWeightLbs: row.affected_weight_lbs === null ? null : Number(row.affected_weight_lbs),
    detectedAt: row.detected_at,
    sourceSystems: row.source_systems,
    sourceReferences: row.source_references,
    explanation: row.explanation,
    likelyCauses: row.likely_causes,
    assignedOwner: row.assigned_owner,
    resolvedAt: row.resolved_at,
    resolutionNote: row.resolution_note,
    materialityScore: row.materiality_score === null ? null : Number(row.materiality_score),
  };
}

// Only inserts an exception if NO row already exists for the same (org,
// type, affected item, affected lot) — in ANY status, resolved/not_applicable
// included. detection re-runs on every dashboard read (etl.service.ts syncs
// lazily on GET), and the underlying data condition (e.g. "this lot still
// has no lot number") often doesn't change just because staff resolved it —
// so once staff has acted on an instance, re-detecting the same unchanged
// condition must never reopen or duplicate it. A genuinely new occurrence
// (different lot/item) still gets its own row since the key includes the
// affected ids.
export async function persistDetectedExceptions(
  foodBankId: string,
  detected: DetectedException[]
): Promise<void> {
  for (const e of detected) {
    const existing = await pgPool.query(
      `SELECT 1 FROM reconciliation_exceptions
       WHERE organization_id = $1
         AND exception_type = $2
         AND affected_item_id IS NOT DISTINCT FROM $3
         AND affected_inventory_lot_id IS NOT DISTINCT FROM $4
       LIMIT 1`,
      [foodBankId, e.exceptionType, e.affectedItemId, e.affectedInventoryLotId]
    );
    if (existing.rows.length > 0) continue;

    await pgPool.query(
      `INSERT INTO reconciliation_exceptions
         (organization_id, site_id, program_id, exception_type, severity, status,
          affected_item_id, affected_inventory_lot_id, affected_distribution_event_id,
          affected_quantity, unit_of_measure, affected_weight_lbs,
          source_systems, source_references, explanation, likely_causes)
       VALUES ($1, $2, $3, $4, $5, 'new', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        foodBankId,
        e.siteId,
        e.programId,
        e.exceptionType,
        e.severity,
        e.affectedItemId,
        e.affectedInventoryLotId,
        e.affectedDistributionEventId,
        e.affectedQuantity,
        e.unitOfMeasure,
        e.affectedWeightLbs,
        e.sourceSystems ? JSON.stringify(e.sourceSystems) : null,
        e.sourceReferences ? JSON.stringify(e.sourceReferences) : null,
        e.explanation,
        e.likelyCauses ? JSON.stringify(e.likelyCauses) : null,
      ]
    );
  }
}

export async function listActiveExceptions(foodBankId: string): Promise<ReconciliationException[]> {
  const result = await pgPool.query(
    `SELECT * FROM reconciliation_exceptions
     WHERE organization_id = $1 AND status NOT IN ('resolved', 'not_applicable')
     ORDER BY
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       detected_at DESC`,
    [foodBankId]
  );
  return result.rows.map(toReconciliationException);
}

export interface UpdateExceptionInput {
  action: "assign" | "resolve" | "not_applicable";
  assignedOwner?: string;
  resolutionNote?: string;
}

export async function updateException(
  foodBankId: string,
  exceptionId: string,
  input: UpdateExceptionInput
): Promise<ReconciliationException> {
  let result;
  if (input.action === "assign") {
    result = await pgPool.query(
      `UPDATE reconciliation_exceptions
       SET status = 'assigned', assigned_owner = $3
       WHERE exception_id = $1 AND organization_id = $2
       RETURNING *`,
      [exceptionId, foodBankId, input.assignedOwner ?? null]
    );
  } else if (input.action === "resolve") {
    result = await pgPool.query(
      `UPDATE reconciliation_exceptions
       SET status = 'resolved', resolved_at = now(), resolution_note = $3
       WHERE exception_id = $1 AND organization_id = $2
       RETURNING *`,
      [exceptionId, foodBankId, input.resolutionNote ?? null]
    );
  } else {
    result = await pgPool.query(
      `UPDATE reconciliation_exceptions
       SET status = 'not_applicable', resolved_at = now(), resolution_note = $3
       WHERE exception_id = $1 AND organization_id = $2
       RETURNING *`,
      [exceptionId, foodBankId, input.resolutionNote ?? null]
    );
  }

  // Same 404 whether the exception doesn't exist or belongs to another food
  // bank — never let a caller distinguish the two across a tenant boundary.
  if (result.rows.length === 0) throw new HttpError(404, "Exception not found");
  return toReconciliationException(result.rows[0]);
}

import { pgPool } from "../db/postgres";

export interface IngestionRunResult {
  source: string;
  rowCount: number;
  status: "success" | "error";
  error?: string;
}

// Wraps an ingestion function with a row in ingestion_runs so every run is
// auditable: when it ran, how many rows landed, and what failed if anything.
export async function withIngestionRun(
  source: string,
  fn: () => Promise<number>
): Promise<IngestionRunResult> {
  const { rows } = await pgPool.query(
    `INSERT INTO ingestion_runs (source, started_at, status)
     VALUES ($1, now(), 'running')
     RETURNING id`,
    [source]
  );
  const runId = rows[0].id;

  try {
    const rowCount = await fn();
    await pgPool.query(
      `UPDATE ingestion_runs
       SET finished_at = now(), row_count = $2, status = 'success'
       WHERE id = $1`,
      [runId, rowCount]
    );
    return { source, rowCount, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pgPool.query(
      `UPDATE ingestion_runs
       SET finished_at = now(), status = 'error', error = $2
       WHERE id = $1`,
      [runId, message]
    );
    return { source, rowCount: 0, status: "error", error: message };
  }
}

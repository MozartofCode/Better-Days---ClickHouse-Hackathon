import { Router } from "express";
import { ingestCalich } from "../../ingest/calich";
import { ingestChhsBhCountyProfile } from "../../ingest/chhsBhCountyProfile";

export const ingestRouter = Router();

const SOURCES: Record<string, () => Promise<unknown>> = {
  calich: ingestCalich,
  chhs: ingestChhsBhCountyProfile,
};

// POST /api/ingest/:source  where source is 'calich' or 'chhs'.
// Runs the one-time ingestion synchronously and returns the run summary.
// Note: does not run the ClickHouse ETL — call `npm run etl:clickhouse`
// (or scripts/ingest-all.ts) after ingesting to refresh reporting tables.
ingestRouter.post("/ingest/:source", async (req, res) => {
  const fn = SOURCES[req.params.source];
  if (!fn) {
    res.status(404).json({ error: `Unknown source. Valid: ${Object.keys(SOURCES).join(", ")}` });
    return;
  }
  try {
    const result = await fn();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

import { Request, Response, NextFunction } from "express";
import { clickhouse } from "../../db/clickhouse";
import { HttpError } from "../../utils/http-error";
import { ingestCalich } from "./ingest/calich";
import { ingestChhsBhCountyProfile } from "./ingest/chhsBhCountyProfile";
import {
  searchFoodBanksByZip,
  searchFoodBanksByState,
  getFoodBankDetails,
  upsertFoodBank,
} from "./ingest/feedingAmerica";

// GET /api/community/demand-proxy/counties
// Aggregated view over demand_proxy_by_county: one row per county/CoC + source.
export async function demandProxyCountiesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const resultSet = await clickhouse.query({
      query: `
        SELECT
          county_or_coc,
          metric_source,
          count() AS metric_count,
          sum(value) AS total_value
        FROM demand_proxy_by_county
        GROUP BY county_or_coc, metric_source
        ORDER BY county_or_coc, metric_source
      `,
      format: "JSONEachRow",
    });
    res.json(await resultSet.json());
  } catch (err) {
    next(err);
  }
}

// GET /api/community/demand-proxy/counties/:county
// Full detail rows for one county or CoC id.
export async function demandProxyCountyDetailHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const resultSet = await clickhouse.query({
      query: `
        SELECT county_or_coc, metric_source, dimension, dimension_detail, period, value, value_raw, synced_at
        FROM demand_proxy_by_county
        WHERE county_or_coc = {county:String}
        ORDER BY metric_source, period
      `,
      query_params: { county: req.params.county },
      format: "JSONEachRow",
    });
    res.json(await resultSet.json());
  } catch (err) {
    next(err);
  }
}

// GET /api/community/food-banks?zip=94110  or  ?state=CA
// Always hits the live Feeding America API (per the "real-time" requirement)
// and upserts results into Postgres as a cache/audit trail — Postgres is not
// the source of truth here.
export async function searchFoodBanksHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { zip, state } = req.query;
    if (typeof zip === "string") {
      res.json(await searchFoodBanksByZip(zip));
      return;
    }
    if (typeof state === "string") {
      res.json(await searchFoodBanksByState(state));
      return;
    }
    throw new HttpError(400, "Provide either ?zip= or ?state=");
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(502, (err as Error).message));
  }
}

// GET /api/community/food-banks/:slug
export async function foodBankDetailsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const details = await getFoodBankDetails(req.params.slug);
    await upsertFoodBank(details);
    res.json(details);
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(502, (err as Error).message));
  }
}

const INGEST_SOURCES: Record<string, () => Promise<unknown>> = {
  calich: ingestCalich,
  chhs: ingestChhsBhCountyProfile,
};

// POST /api/community/ingest/:source  where source is 'calich' or 'chhs'.
// Runs the one-time ingestion synchronously and returns the run summary.
// Note: does not run the ClickHouse ETL — call `npm run etl:clickhouse`
// (or `npm run ingest:all`) after ingesting to refresh reporting tables.
export async function ingestHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const fn = INGEST_SOURCES[req.params.source];
    if (!fn) {
      throw new HttpError(404, `Unknown source. Valid: ${Object.keys(INGEST_SOURCES).join(", ")}`);
    }
    res.json(await fn());
  } catch (err) {
    next(err);
  }
}

import { Router } from "express";
import { clickhouse } from "../../db/clickhouse";

export const demandProxyRouter = Router();

// GET /api/demand-proxy/counties
// Aggregated view over demand_proxy_by_county: one row per county/CoC + source.
demandProxyRouter.get("/demand-proxy/counties", async (_req, res) => {
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
});

// GET /api/demand-proxy/counties/:county
// Full detail rows for one county or CoC id.
demandProxyRouter.get("/demand-proxy/counties/:county", async (req, res) => {
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
});

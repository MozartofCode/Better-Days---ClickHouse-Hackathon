-- Reporting/analytics store. Populated only by src/etl/syncClickhouse.ts
-- from the Postgres operational tables (truncate + reload).

CREATE TABLE IF NOT EXISTS demand_proxy_by_county
(
    county_or_coc   String,
    metric_source   LowCardinality(String),  -- 'calich_homelessness' | 'calich_spm' | 'chhs_bh_county_profile'
    dimension       String,
    dimension_detail String,
    period          String,
    value           Nullable(Float64),
    value_raw       String,
    synced_at       DateTime
)
ENGINE = MergeTree
ORDER BY (county_or_coc, metric_source, period);

CREATE TABLE IF NOT EXISTS food_bank_summary
(
    food_bank_id       String,
    name               String,
    county             String,
    meals_provided     Nullable(Int64),
    pounds_distributed Nullable(Int64),
    synced_at          DateTime
)
ENGINE = MergeTree
ORDER BY county;

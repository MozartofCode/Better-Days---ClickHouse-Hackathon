-- Community/demand activity for a food bank's own sites: visits, households
-- served, and commodities distributed. Distinct from `demand_proxy_by_county`
-- (002_clickhouse_community_data.sql), which is public county-level data —
-- this table is per-tenant, uploaded by a food bank's own staff, the same way
-- `uploads`/`upload_rows` (001_clickhouse_init.sql) hold inventory uploads.
--
-- Raw vs. normalized split, per product spec:
--   demand_uploads    -- one row per ingested file/batch
--   demand_raw_rows   -- raw ingestion data, verbatim source columns (never rejected)
--   demand_records    -- normalized/analytics-ready rows the query layer reads

CREATE TABLE IF NOT EXISTS demand_uploads (
  id UUID DEFAULT generateUUIDv4(),
  food_bank_id UUID,
  uploaded_by_user_id UUID,
  filename String,
  source LowCardinality(String),  -- 'csv' | 'xlsx' | 'json' | 'api'
  columns Array(String),
  row_count UInt32,
  normalized_count UInt32,        -- rows that produced a usable normalized record
  error_count UInt32,             -- rows that failed validation (bad/missing date, etc.)
  uploaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (food_bank_id, uploaded_at);

CREATE TABLE IF NOT EXISTS demand_raw_rows (
  upload_id UUID,
  food_bank_id UUID,
  row_number UInt32,
  data Map(String, String),
  uploaded_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (food_bank_id, upload_id, row_number);

CREATE TABLE IF NOT EXISTS demand_records (
  id UUID DEFAULT generateUUIDv4(),
  upload_id UUID,
  food_bank_id UUID,
  site Nullable(String),
  record_date Nullable(Date),
  commodity Nullable(String),
  visit_count Nullable(Int32),
  household_count Nullable(Int32),
  quantity Nullable(Float64),
  unit Nullable(String),
  source_file String,
  source_row UInt32,
  ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (food_bank_id, site, record_date);

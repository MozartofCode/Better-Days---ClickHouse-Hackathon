-- Operational store. Raw ingested rows plus the Feeding America live cache.
-- ClickHouse (db/clickhouse/001_init.sql) is fed from these tables by the ETL job
-- and is never written to directly by ingestion.

CREATE TABLE IF NOT EXISTS ca_homelessness_counts (
    id BIGSERIAL PRIMARY KEY,
    calendar_year TEXT NOT NULL,
    location_id TEXT NOT NULL,          -- Continuum of Care number, e.g. "CA-500"
    dimension_type TEXT NOT NULL,       -- 'gender' | 'race' | 'age'
    dimension_value TEXT NOT NULL,
    count_raw TEXT,                     -- kept as text: source uses "*" for suppressed cells
    source_resource_id TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_homelessness_counts_location_year
    ON ca_homelessness_counts (location_id, calendar_year);

CREATE TABLE IF NOT EXISTS ca_system_performance_measures (
    id BIGSERIAL PRIMARY KEY,
    coc_or_state TEXT,                  -- source "Location" column
    metric TEXT,                        -- source "Metric" column (e.g. "M1a"); one row per period column, see raw
    raw JSONB NOT NULL,                 -- full source row: wide format, one column per reporting period
    source_resource_id TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chhs_bh_county_profile (
    id BIGSERIAL PRIMARY KEY,
    county_name TEXT NOT NULL,
    data_type TEXT,
    dimension TEXT,
    dimension_dtl TEXT,
    value_raw TEXT,                     -- kept as text: source uses "*" for suppressed cells
    annotation_code TEXT,
    annotation_desc TEXT,
    source_resource_id TEXT NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chhs_bh_county_profile_county
    ON chhs_bh_county_profile (county_name);

CREATE TABLE IF NOT EXISTS food_banks (
    id TEXT PRIMARY KEY,
    name TEXT,
    address TEXT,
    phone TEXT,
    website TEXT,
    meals_provided BIGINT,
    pounds_distributed BIGINT,
    counties_served JSONB,
    raw JSONB NOT NULL,                 -- full API response for the profile
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
    id BIGSERIAL PRIMARY KEY,
    source TEXT NOT NULL,               -- 'calich' | 'chhs' | 'feeding_america'
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    row_count INT,
    status TEXT NOT NULL,               -- 'running' | 'success' | 'error'
    error TEXT
);

-- Community/demand data: California homelessness demand-proxy data (CalICH,
-- CHHS) and a Feeding America food bank directory cache. Operational store —
-- raw ingested rows. ClickHouse (002_clickhouse_community_data.sql) is fed
-- from these tables by the ETL job and is never written to directly by
-- ingestion.

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

-- Feeding America directory cache. Deliberately NOT named `food_banks` —
-- that table (001_postgres_init.sql) is this app's own tenant orgs (the food
-- banks whose staff register/log in/upload spreadsheets). This is an
-- unrelated cache-aside of the public Feeding America directory, keyed by
-- their `slug`, refreshed on every live lookup rather than being a source of
-- truth in its own right.
CREATE TABLE IF NOT EXISTS feeding_america_food_banks (
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
    source TEXT NOT NULL,               -- 'calich_homelessness_demographics' | 'calich_system_performance_measures' | 'chhs_bh_county_profile'
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ,
    row_count INT,
    status TEXT NOT NULL,               -- 'running' | 'success' | 'error'
    error TEXT
);

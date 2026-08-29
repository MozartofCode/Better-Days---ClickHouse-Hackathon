-- Carries the ClickHouse upload's tag (see 003_clickhouse_uploads_tag.sql)
-- through to the canonical-schema side, so the same label shows up whether
-- you're looking at the raw uploads list or the operations data-sources view.
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS tag TEXT;

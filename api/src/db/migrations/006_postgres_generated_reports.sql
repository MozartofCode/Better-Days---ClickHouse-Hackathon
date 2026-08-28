-- Metadata for PDFs written by api/src/modules/operations/reports/generateReport.ts.
-- organization_id exists specifically so the download route can check the
-- requesting user's food_bank_id against it before serving a file — without
-- this table, a report path/filename alone would have no tenant check.

CREATE TABLE IF NOT EXISTS generated_reports (
  report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'approved', 'finalized')),
  period_start TEXT,
  period_end TEXT,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT false,
  data_quality_summary JSONB,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_reports_organization_id ON generated_reports(organization_id);

-- Canonical operations schema: reconciled inventory, distribution, and
-- reconciliation-exception data that the Operations Intelligence dashboard
-- and report generator read from. Populated by a future ETL from the raw
-- uploads pipeline (api/src/modules/uploads) — these tables start empty.
--
-- `food_banks` (001_postgres_init.sql) is already the tenant/organization
-- table referenced by `users.food_bank_id`; it is extended here in place
-- rather than duplicated, so every FK below to "organization" points at
-- food_banks(id).

ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS organization_type TEXT;
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS reporting_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS primary_contact TEXT;
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS active_status BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- SITE
-- ============================================================

CREATE TABLE IF NOT EXISTS sites (
  site_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  site_name TEXT NOT NULL,
  site_type TEXT,
  address TEXT,
  operating_days JSONB,
  storage_capabilities JSONB,
  active_status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sites_organization_id ON sites(organization_id);

-- ============================================================
-- PROGRAM
-- ============================================================

CREATE TABLE IF NOT EXISTS programs (
  program_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  program_name TEXT NOT NULL,
  program_type TEXT,
  funding_source TEXT,
  compliance_configuration_id UUID,
  active_status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_programs_organization_id ON programs(organization_id);

-- ============================================================
-- ITEM
-- ============================================================

CREATE TABLE IF NOT EXISTS items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  canonical_item_name TEXT NOT NULL,
  item_category TEXT,
  subcategory TEXT,
  food_group TEXT,
  unit_of_measure TEXT NOT NULL,
  pounds_per_unit NUMERIC,
  perishable_flag BOOLEAN NOT NULL DEFAULT false,
  refrigerated_flag BOOLEAN NOT NULL DEFAULT false,
  frozen_flag BOOLEAN NOT NULL DEFAULT false,
  barcode TEXT,
  active_status BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_organization_id ON items(organization_id);

-- ============================================================
-- INVENTORY LOT
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_lots (
  inventory_lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  source_type TEXT,
  donor_or_vendor_id TEXT,
  lot_number TEXT,
  received_date DATE,
  expiry_date DATE,
  storage_location TEXT,
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  quantity_reserved NUMERIC NOT NULL DEFAULT 0,
  quantity_damaged NUMERIC NOT NULL DEFAULT 0,
  quantity_disposed NUMERIC NOT NULL DEFAULT 0,
  -- usable_quantity is derived (see calculations.ts) and NOT stored here to
  -- avoid it drifting out of sync with the four columns above.
  unit_of_measure TEXT NOT NULL,
  weight_lbs NUMERIC,
  temperature_status TEXT,
  food_safety_status TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('reconciled', 'partially_reconciled', 'unreconciled', 'insufficient_data')),
  last_verified_at TIMESTAMPTZ,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lots_item_id ON inventory_lots(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_site_id ON inventory_lots(site_id);
CREATE INDEX IF NOT EXISTS idx_inventory_lots_expiry_date ON inventory_lots(expiry_date);

-- ============================================================
-- INVENTORY TRANSACTION
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_transactions (
  transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'opening_balance', 'receipt', 'adjustment', 'reservation',
    'transfer_out', 'transfer_in', 'distribution', 'waste',
    'spoilage', 'donation_return', 'correction'
  )),
  transaction_date TIMESTAMPTZ NOT NULL,
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  inventory_lot_id UUID REFERENCES inventory_lots(inventory_lot_id) ON DELETE SET NULL,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(program_id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  unit_of_measure TEXT NOT NULL,
  weight_lbs NUMERIC,
  source_type TEXT,
  source_reference TEXT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('reconciled', 'partially_reconciled', 'unreconciled', 'insufficient_data')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_transactions_item_id ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_site_id ON inventory_transactions(site_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_lot_id ON inventory_transactions(inventory_lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_date ON inventory_transactions(transaction_date);

-- ============================================================
-- DISTRIBUTION EVENT
-- ============================================================

CREATE TABLE IF NOT EXISTS distribution_events (
  distribution_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(program_id) ON DELETE SET NULL,
  distribution_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  planned_households INTEGER,
  actual_households_served INTEGER,
  planned_boxes INTEGER,
  actual_boxes_distributed INTEGER,
  planned_volunteers INTEGER,
  confirmed_volunteers INTEGER,
  event_status TEXT NOT NULL DEFAULT 'planned'
    CHECK (event_status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  source_reference TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('reconciled', 'partially_reconciled', 'unreconciled', 'insufficient_data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_events_site_id ON distribution_events(site_id);
CREATE INDEX IF NOT EXISTS idx_distribution_events_date ON distribution_events(distribution_date);

-- ============================================================
-- DISTRIBUTION LINE
-- ============================================================

CREATE TABLE IF NOT EXISTS distribution_lines (
  distribution_line_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  distribution_event_id UUID NOT NULL REFERENCES distribution_events(distribution_event_id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
  inventory_lot_id UUID REFERENCES inventory_lots(inventory_lot_id) ON DELETE SET NULL,
  quantity_planned NUMERIC,
  quantity_distributed NUMERIC,
  quantity_returned NUMERIC,
  quantity_wasted NUMERIC,
  unit_of_measure TEXT NOT NULL,
  weight_lbs NUMERIC,
  source_reference TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('reconciled', 'partially_reconciled', 'unreconciled', 'insufficient_data'))
);

CREATE INDEX IF NOT EXISTS idx_distribution_lines_event_id ON distribution_lines(distribution_event_id);
CREATE INDEX IF NOT EXISTS idx_distribution_lines_item_id ON distribution_lines(item_id);

-- ============================================================
-- HOUSEHOLD SERVICE AGGREGATE
-- Aggregate-only by design — no household-level PII in this schema.
-- ============================================================

CREATE TABLE IF NOT EXISTS household_service_aggregates (
  aggregate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(program_id) ON DELETE SET NULL,
  reporting_period TEXT NOT NULL,
  unique_households_served INTEGER,
  individuals_served INTEGER,
  visits INTEGER,
  new_households INTEGER,
  returning_households INTEGER,
  source_coverage_percentage NUMERIC,
  calculation_definition TEXT,
  source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_household_service_aggregates_org_period
  ON household_service_aggregates(organization_id, reporting_period);

-- ============================================================
-- VOLUNTEER SHIFT
-- ============================================================

CREATE TABLE IF NOT EXISTS volunteer_shifts (
  shift_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(site_id) ON DELETE CASCADE,
  program_id UUID REFERENCES programs(program_id) ON DELETE SET NULL,
  shift_start TIMESTAMPTZ NOT NULL,
  shift_end TIMESTAMPTZ NOT NULL,
  role TEXT,
  required_count INTEGER,
  confirmed_count INTEGER,
  checked_in_count INTEGER,
  -- gap_count is derived (required_count - confirmed_count); not stored, see calculations.ts.
  source_reference TEXT
);

CREATE INDEX IF NOT EXISTS idx_volunteer_shifts_site_id ON volunteer_shifts(site_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_shifts_shift_start ON volunteer_shifts(shift_start);

-- ============================================================
-- RECONCILIATION EXCEPTION
-- ============================================================

CREATE TABLE IF NOT EXISTS reconciliation_exceptions (
  exception_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  site_id UUID REFERENCES sites(site_id) ON DELETE SET NULL,
  program_id UUID REFERENCES programs(program_id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN (
    'missing_receiving_record', 'inventory_distribution_mismatch', 'unit_conversion_mismatch',
    'duplicate_inventory_item', 'unmapped_item', 'missing_expiry_date', 'missing_lot_number',
    'stale_inventory_source', 'unconfirmed_outbound_distribution', 'negative_inventory',
    'duplicate_distribution_record', 'unknown_site_location', 'data_not_mapped_to_canonical_schema'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'assigned', 'in_review', 'resolved', 'not_applicable')),
  affected_item_id UUID REFERENCES items(item_id) ON DELETE SET NULL,
  affected_inventory_lot_id UUID REFERENCES inventory_lots(inventory_lot_id) ON DELETE SET NULL,
  affected_distribution_event_id UUID REFERENCES distribution_events(distribution_event_id) ON DELETE SET NULL,
  affected_quantity NUMERIC,
  unit_of_measure TEXT,
  affected_weight_lbs NUMERIC,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_systems JSONB,
  source_references JSONB,
  explanation TEXT NOT NULL,
  likely_causes JSONB,
  assigned_owner UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  materiality_score NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_org ON reconciliation_exceptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_status ON reconciliation_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_exceptions_severity ON reconciliation_exceptions(severity);

-- ============================================================
-- DATA SOURCE AND PROVENANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS data_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  source_type TEXT,
  source_name TEXT,
  file_name TEXT,
  file_hash TEXT,
  import_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  reporting_period TEXT,
  data_freshness_timestamp TIMESTAMPTZ,
  mapping_version TEXT,
  source_row_reference TEXT,
  extraction_confidence NUMERIC,
  reconciliation_run_id UUID
);

CREATE INDEX IF NOT EXISTS idx_data_sources_organization_id ON data_sources(organization_id);

-- ============================================================
-- REPORT CONFIGURATION
-- ============================================================

CREATE TABLE IF NOT EXISTS report_configurations (
  report_config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL CHECK (template_id IN (
    'distribution_readiness_brief', 'monthly_operations_reconciliation', 'board_impact_report',
    'grant_progress_report', 'tefap_draft_review_packet', 'network_partner_allocation_report'
  )),
  report_name TEXT NOT NULL,
  branding_logo TEXT,
  primary_color TEXT,
  included_sites JSONB,
  included_programs JSONB,
  metric_definitions JSONB,
  custom_sections JSONB,
  approved_template_file TEXT,
  report_disclaimer TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_configurations_organization_id ON report_configurations(organization_id);

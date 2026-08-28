-- Org profile setup: link a tenant food_bank (001_postgres_init.sql) to its
-- real-world entry in the Feeding America directory cache
-- (feeding_america_food_banks, 002_postgres_community_data.sql), and let
-- admins invite teammates into the same tenant via a shareable link (no
-- email-sending infra exists in this app, so invites are token links an
-- admin copies out manually rather than emailed).

ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS feeding_america_slug TEXT
  REFERENCES feeding_america_food_banks(id);
ALTER TABLE food_banks ADD COLUMN IF NOT EXISTS profile_setup_completed BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_bank_id UUID NOT NULL REFERENCES food_banks(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days'
);

CREATE INDEX IF NOT EXISTS idx_org_invites_food_bank_id ON org_invites(food_bank_id);

-- One live pending invite per (org, email) at a time — re-inviting revokes
-- the old row (see org.service.ts createInvite) rather than colliding here.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_pending_email
  ON org_invites(food_bank_id, email) WHERE status = 'pending';

-- OAuth 2.1 Authorization Server storage for the MCP server (api/src/modules/mcp).
-- Access tokens are stateless JWTs (signed with env.jwtSecret, verified via
-- jwt.verify) and are NOT stored here. Only what must be checkable/revocable
-- server-side lives in Postgres: registered clients, single-use authorization
-- codes (with their PKCE challenge), and refresh tokens (hashed at rest).

-- Dynamically registered OAuth clients (RFC 7591). Not tenant-scoped — a
-- client (e.g. "Claude Desktop") is used by users across many food banks;
-- the food bank a given token can act on is determined at /oauth/authorize
-- login time, not by which client is calling.
--
-- client_data stores the SDK's full OAuthClientInformationFull object
-- (redirect_uris, grant_types, token_endpoint_auth_method, client_secret,
-- etc.) verbatim as JSONB rather than as typed columns, so this table
-- doesn't drift out of sync with the SDK's own client-metadata schema.
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Short-lived authorization codes; each row is consumed exactly once
-- (enforced by checking/setting used_at inside a transaction).
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  resource TEXT,
  scopes JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_authorization_codes(expires_at);

-- Refresh tokens (opaque, hashed at rest — never store the raw token).
-- Rotated on every use: the old row is marked revoked_at and points at its
-- replacement via replaced_by_token_hash.
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource TEXT,
  scopes JSONB NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens(user_id);

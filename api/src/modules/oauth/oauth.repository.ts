import { pgPool } from "../../db/postgres";
import { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

export async function getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
  const result = await pgPool.query("SELECT client_data FROM oauth_clients WHERE client_id = $1", [clientId]);
  return result.rows[0]?.client_data;
}

export async function insertClient(client: OAuthClientInformationFull): Promise<void> {
  await pgPool.query(
    "INSERT INTO oauth_clients (client_id, client_data) VALUES ($1, $2)",
    [client.client_id, client]
  );
}

interface AuthorizationCodeRow {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scopes: string[];
  expiresAt: Date;
}

export async function insertAuthorizationCode(row: AuthorizationCodeRow): Promise<void> {
  await pgPool.query(
    `INSERT INTO oauth_authorization_codes
       (code, client_id, user_id, redirect_uri, code_challenge, resource, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.code,
      row.clientId,
      row.userId,
      row.redirectUri,
      row.codeChallenge,
      row.resource,
      JSON.stringify(row.scopes),
      row.expiresAt,
    ]
  );
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scopes: string[];
  expiresAt: Date;
  usedAt: Date | null;
}

export async function findAuthorizationCode(code: string): Promise<AuthorizationCode | undefined> {
  const result = await pgPool.query(
    `SELECT code, client_id, user_id, redirect_uri, code_challenge, resource, scopes, expires_at, used_at
     FROM oauth_authorization_codes WHERE code = $1`,
    [code]
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    code: row.code,
    clientId: row.client_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    resource: row.resource,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}

/**
 * Marks a code used, but only if it hasn't been used already — makes
 * consumption atomic and single-use under concurrent requests.
 */
export async function consumeAuthorizationCode(code: string): Promise<boolean> {
  const result = await pgPool.query(
    "UPDATE oauth_authorization_codes SET used_at = now() WHERE code = $1 AND used_at IS NULL",
    [code]
  );
  return (result.rowCount ?? 0) > 0;
}

interface RefreshTokenRow {
  tokenHash: string;
  clientId: string;
  userId: string;
  resource: string | null;
  scopes: string[];
  expiresAt: Date;
}

export async function insertRefreshToken(row: RefreshTokenRow): Promise<void> {
  await pgPool.query(
    `INSERT INTO oauth_refresh_tokens (token_hash, client_id, user_id, resource, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.tokenHash, row.clientId, row.userId, row.resource, JSON.stringify(row.scopes), row.expiresAt]
  );
}

export interface RefreshToken {
  tokenHash: string;
  clientId: string;
  userId: string;
  resource: string | null;
  scopes: string[];
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function findRefreshToken(tokenHash: string): Promise<RefreshToken | undefined> {
  const result = await pgPool.query(
    `SELECT token_hash, client_id, user_id, resource, scopes, expires_at, revoked_at
     FROM oauth_refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    tokenHash: row.token_hash,
    clientId: row.client_id,
    userId: row.user_id,
    resource: row.resource,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export async function revokeRefreshToken(tokenHash: string, replacedByTokenHash?: string): Promise<void> {
  await pgPool.query(
    "UPDATE oauth_refresh_tokens SET revoked_at = now(), replaced_by_token_hash = $2 WHERE token_hash = $1",
    [tokenHash, replacedByTokenHash ?? null]
  );
}

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Response } from "express";
import { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { pgPool } from "../../db/postgres";
import { env } from "../../config/env";
import { AuthUser } from "../../types";
import { clientsStore } from "./oauth.clientsStore";
import * as oauthRepository from "./oauth.repository";
import { signAccessToken, generateOpaqueToken, hashToken, verifyAccessToken as verifyMcpJwt } from "./oauth.tokens";

const DEFAULT_SCOPES = ["mcp:read", "mcp:write"];

/**
 * Short-lived, signed "pending authorization" token — carries the
 * /oauth/authorize params through the browser to /oauth/login and back,
 * without needing a server-side session store.
 */
export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  state?: string;
}

export function signPendingAuthorization(pending: PendingAuthorization): string {
  return jwt.sign(pending, env.jwtSecret, { expiresIn: env.mcp.authCodeTtlSeconds * 10 });
}

export function verifyPendingAuthorization(token: string): PendingAuthorization {
  return jwt.verify(token, env.jwtSecret) as PendingAuthorization;
}

async function loadAuthUser(userId: string): Promise<AuthUser> {
  const result = await pgPool.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.food_bank_id, f.name AS food_bank_name
     FROM users u JOIN food_banks f ON f.id = u.food_bank_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) throw new InvalidGrantError("User no longer exists");
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    foodBankId: row.food_bank_id,
    foodBankName: row.food_bank_name,
  };
}

async function issueTokens(client: OAuthClientInformationFull, user: AuthUser, scopes: string[], resource?: string): Promise<OAuthTokens> {
  const { token: accessToken, expiresIn } = signAccessToken(user, { clientId: client.client_id, scopes, resource });

  const refreshTokenRaw = generateOpaqueToken();
  await oauthRepository.insertRefreshToken({
    tokenHash: hashToken(refreshTokenRaw),
    clientId: client.client_id,
    userId: user.id,
    resource: resource ?? null,
    scopes,
    expiresAt: new Date(Date.now() + env.mcp.refreshTokenTtlSeconds * 1000),
  });

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresIn,
    refresh_token: refreshTokenRaw,
    scope: scopes.join(" "),
  };
}

export const oauthProvider: OAuthServerProvider = {
  clientsStore: clientsStore as OAuthRegisteredClientsStore,

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    // No consent UI in v1 — logging in as a user *is* the consent, scoped to
    // that user's own food bank. /oauth/login handles the actual credential
    // check (reusing auth.service.login) and issues the code.
    const pending: PendingAuthorization = {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes && params.scopes.length > 0 ? params.scopes : DEFAULT_SCOPES,
      resource: params.resource?.toString(),
      state: params.state,
    };
    const pendingToken = signPendingAuthorization(pending);
    res.redirect(302, `/oauth/login?pending=${encodeURIComponent(pendingToken)}`);
  },

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const code = await oauthRepository.findAuthorizationCode(authorizationCode);
    if (!code || code.usedAt || code.expiresAt < new Date()) {
      throw new InvalidGrantError("Invalid or expired authorization code");
    }
    return code.codeChallenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const code = await oauthRepository.findAuthorizationCode(authorizationCode);
    if (!code || code.usedAt || code.expiresAt < new Date()) {
      throw new InvalidGrantError("Invalid or expired authorization code");
    }
    if (code.clientId !== client.client_id) {
      throw new InvalidGrantError("Authorization code was not issued to this client");
    }
    if (redirectUri && code.redirectUri !== redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the authorization request");
    }
    if (code.resource && resource && code.resource !== resource.toString()) {
      throw new InvalidGrantError("resource does not match the authorization request");
    }

    const consumed = await oauthRepository.consumeAuthorizationCode(authorizationCode);
    if (!consumed) {
      // Lost a race with a concurrent exchange of the same code — reject
      // both, as OAuth 2.1 requires codes to be single-use.
      throw new InvalidGrantError("Authorization code already used");
    }

    const user = await loadAuthUser(code.userId);
    return issueTokens(client, user, code.scopes, code.resource ?? undefined);
  },

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const stored = await oauthRepository.findRefreshToken(tokenHash);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new InvalidGrantError("Invalid, expired, or revoked refresh token");
    }
    if (stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token was not issued to this client");
    }

    // Re-derive AuthUser fresh from the DB (not from the original token) so
    // role/food-bank changes since the original login take effect on refresh.
    const user = await loadAuthUser(stored.userId);
    const effectiveScopes = scopes && scopes.length > 0 ? scopes : stored.scopes;
    const effectiveResource = resource?.toString() ?? stored.resource ?? undefined;

    const tokens = await issueTokens(client, user, effectiveScopes, effectiveResource);
    // Rotate: revoke the old refresh token, pointing at its replacement.
    await oauthRepository.revokeRefreshToken(tokenHash, hashToken(tokens.refresh_token!));
    return tokens;
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const claims = verifyMcpJwt(token);
    const { foodBankId, foodBankName, ...rest } = claims;
    return {
      token,
      clientId: claims.client_id,
      scopes: claims.scope.split(" "),
      expiresAt: (claims as any).exp,
      resource: claims.resource ? new URL(claims.resource) : undefined,
      extra: {
        user: {
          id: rest.id,
          email: rest.email,
          firstName: rest.firstName,
          lastName: rest.lastName,
          role: rest.role,
          foodBankId,
          foodBankName,
        } satisfies AuthUser,
      },
    };
  },

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    await oauthRepository.revokeRefreshToken(hashToken(request.token));
  },
};

export function generateAuthorizationCode(): string {
  return crypto.randomBytes(32).toString("hex");
}

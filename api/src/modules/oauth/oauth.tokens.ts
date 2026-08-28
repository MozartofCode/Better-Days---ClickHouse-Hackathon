import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { AuthUser } from "../../types";

export const MCP_TOKEN_USE = "mcp" as const;

interface McpAccessTokenClaims extends AuthUser {
  client_id: string;
  scope: string;
  resource?: string;
  token_use: typeof MCP_TOKEN_USE;
}

export function signAccessToken(
  user: AuthUser,
  opts: { clientId: string; scopes: string[]; resource?: string }
): { token: string; expiresIn: number } {
  const claims: McpAccessTokenClaims = {
    ...user,
    client_id: opts.clientId,
    scope: opts.scopes.join(" "),
    resource: opts.resource,
    token_use: MCP_TOKEN_USE,
  };
  const expiresIn = env.mcp.accessTokenTtlSeconds;
  const token = jwt.sign(claims, env.jwtSecret, { expiresIn });
  return { token, expiresIn };
}

export function verifyAccessToken(token: string): McpAccessTokenClaims {
  const payload = jwt.verify(token, env.jwtSecret) as McpAccessTokenClaims;
  if (payload.token_use !== MCP_TOKEN_USE) {
    throw new Error("Not an MCP access token");
  }
  return payload;
}

export function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

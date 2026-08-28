import { NextFunction, Request, Response } from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { env } from "../../config/env";
import { oauthProvider } from "../oauth/oauth.provider";
import { AuthUser } from "../../types";

const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(env.mcp.resourceUrl));

export const requireMcpAuth = requireBearerAuth({
  verifier: oauthProvider,
  resourceMetadataUrl,
});

/**
 * Copies the AuthUser carried in the verified token's `extra.user` (set by
 * oauthProvider.verifyAccessToken) onto req.user, so MCP tool handlers can
 * use the exact same AuthUser shape as the rest of the app — and so
 * foodBankId always comes from the verified token, never from tool input.
 */
export function attachAuthUser(req: Request, _res: Response, next: NextFunction) {
  const user = req.auth?.extra?.user as AuthUser | undefined;
  if (user) {
    req.user = user;
  }
  next();
}

import { Router } from "express";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { env } from "../../config/env";
import { oauthProvider } from "./oauth.provider";
import { oauthLoginRouter } from "./oauth.login.routes";

export const oauthRouter = Router();

// Installs /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource,
// /register (DCR), /authorize, /token, /revoke. Must be mounted at the
// application root (RFC 8414 requires /.well-known/* to live at the origin root).
oauthRouter.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(env.mcp.issuerUrl),
    resourceServerUrl: new URL(env.mcp.resourceUrl),
    scopesSupported: ["mcp:read", "mcp:write"],
    resourceName: "Pana Food Bank Data",
  })
);

oauthRouter.use(oauthLoginRouter);

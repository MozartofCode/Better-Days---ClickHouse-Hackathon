import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { env } from "./config/env";
import { HttpError } from "./utils/http-error";
import { authRouter } from "./modules/auth/auth.routes";
import { uploadsRouter } from "./modules/uploads/uploads.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { actionsRouter } from "./modules/actions/actions.routes";
import { communityRouter } from "./modules/community-data/community.routes";
import { oauthRouter } from "./modules/oauth/oauth.routes";
import { mcpRouter } from "./modules/mcp/mcp.routes";
import { orgRouter } from "./modules/org/org.routes";
import { operationsRouter } from "./modules/operations/operations.routes";

export const app = express();

app.use(cors({ origin: env.corsOrigin }));

// Must be mounted before express.json() and at the application root: RFC 8414
// requires /.well-known/oauth-authorization-server to live at the origin
// root, and the SDK's auth sub-routers parse their own request bodies.
app.use(oauthRouter);

app.use(express.json());

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/dashboard", dashboardRouter);
// Deprecated in favor of /mcp — kept running only until LibreChat is cut
// over to talking MCP (see services LibreChat mcpServers config).
app.use("/api/actions", actionsRouter);
app.use("/api/community", communityRouter);
app.use("/api/org", orgRouter);
app.use("/api/operations", operationsRouter);
app.use("/mcp", mcpRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.errors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

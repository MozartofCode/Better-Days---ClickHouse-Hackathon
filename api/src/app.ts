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

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/actions", actionsRouter);
app.use("/api/community", communityRouter);

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

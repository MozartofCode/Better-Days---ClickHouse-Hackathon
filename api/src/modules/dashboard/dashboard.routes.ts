import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { summaryHandler, uploadRowsHandler } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/summary", summaryHandler);
dashboardRouter.get("/uploads/:id", uploadRowsHandler);

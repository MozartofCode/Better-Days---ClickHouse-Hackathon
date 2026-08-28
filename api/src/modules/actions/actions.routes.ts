import { Router } from "express";
import { requireServiceKey } from "../../middleware/serviceAuth";
import {
  listFoodBanksHandler,
  dashboardSummaryHandler,
  listUploadsHandler,
  uploadRowsHandler,
} from "./actions.controller";

export const actionsRouter = Router();

actionsRouter.use(requireServiceKey);
actionsRouter.get("/food-banks", listFoodBanksHandler);
actionsRouter.get("/dashboard-summary", dashboardSummaryHandler);
actionsRouter.get("/uploads", listUploadsHandler);
actionsRouter.get("/uploads/:id/rows", uploadRowsHandler);

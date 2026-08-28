import { Router } from "express";
import { requireServiceKey } from "../../middleware/serviceAuth";
import {
  listFoodBanksHandler,
  dashboardSummaryHandler,
  listUploadsHandler,
  uploadRowsHandler,
  suggestedDemandQuestionsHandler,
  askDemandQuestionHandler,
} from "./actions.controller";

export const actionsRouter = Router();

actionsRouter.use(requireServiceKey);
actionsRouter.get("/food-banks", listFoodBanksHandler);
actionsRouter.get("/dashboard-summary", dashboardSummaryHandler);
actionsRouter.get("/uploads", listUploadsHandler);
actionsRouter.get("/uploads/:id/rows", uploadRowsHandler);
actionsRouter.get("/demand/suggested-questions", suggestedDemandQuestionsHandler);
actionsRouter.post("/demand/ask", askDemandQuestionHandler);

import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import {
  dashboardHandler,
  listExceptionsHandler,
  updateExceptionHandler,
  generateReportHandler,
  listReportsHandler,
  downloadReportHandler,
  listDistributionEventsHandler,
  createDistributionEventHandler,
  listInventoryTransactionsHandler,
  createInventoryTransactionHandler,
  listVolunteerShiftsHandler,
  createVolunteerShiftHandler,
} from "./operations.controller";

export const operationsRouter = Router();

operationsRouter.use(requireAuth);

operationsRouter.get("/dashboard", dashboardHandler);
operationsRouter.get("/exceptions", listExceptionsHandler);
operationsRouter.patch("/exceptions/:id", updateExceptionHandler);
operationsRouter.post("/reports/:templateId", generateReportHandler);
operationsRouter.get("/reports", listReportsHandler);
operationsRouter.get("/reports/:id/download", downloadReportHandler);
operationsRouter.get("/distribution-events", listDistributionEventsHandler);
operationsRouter.post("/distribution-events", createDistributionEventHandler);
operationsRouter.get("/inventory-transactions", listInventoryTransactionsHandler);
operationsRouter.post("/inventory-transactions", createInventoryTransactionHandler);
operationsRouter.get("/volunteer-shifts", listVolunteerShiftsHandler);
operationsRouter.post("/volunteer-shifts", createVolunteerShiftHandler);

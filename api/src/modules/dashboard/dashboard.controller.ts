import { Request, Response, NextFunction } from "express";
import * as dashboardService from "./dashboard.service";

export async function summaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const summary = await dashboardService.getSummary(user.foodBankId);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}

export async function uploadRowsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(String(req.query.pageSize ?? "50"), 10) || 50));
    const result = await dashboardService.getUploadRows(user.foodBankId, req.params.id, page, pageSize);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

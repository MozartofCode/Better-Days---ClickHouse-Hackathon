import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as actionsService from "./actions.service";

const foodBankNameQuery = z.object({
  foodBankName: z.string().min(1, "foodBankName is required"),
});

const uploadRowsQuery = foodBankNameQuery.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

const askDemandBody = foodBankNameQuery.extend({
  question: z.string().min(1, "question is required").max(500),
});

export async function listFoodBanksHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const foodBanks = await actionsService.listFoodBanks();
    res.status(200).json({ foodBanks });
  } catch (err) {
    next(err);
  }
}

export async function dashboardSummaryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { foodBankName } = foodBankNameQuery.parse(req.query);
    const summary = await actionsService.getDashboardSummary(foodBankName);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
}

export async function listUploadsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { foodBankName } = foodBankNameQuery.parse(req.query);
    const uploads = await actionsService.listUploads(foodBankName);
    res.status(200).json({ uploads });
  } catch (err) {
    next(err);
  }
}

export async function uploadRowsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { foodBankName, page, pageSize } = uploadRowsQuery.parse(req.query);
    const result = await actionsService.getUploadRows(foodBankName, req.params.id, page, pageSize);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export function suggestedDemandQuestionsHandler(_req: Request, res: Response) {
  res.status(200).json({ questions: actionsService.listSuggestedDemandQuestions() });
}

// POST (not GET) because LibreChat Actions send the question as a JSON body,
// and the question text itself shouldn't end up in server access logs via a
// query string.
export async function askDemandQuestionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { foodBankName, question } = askDemandBody.parse(req.body);
    const result = await actionsService.askDemandQuestion(foodBankName, question);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

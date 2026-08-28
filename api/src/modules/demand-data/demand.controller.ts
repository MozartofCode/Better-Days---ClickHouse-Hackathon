import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../../utils/http-error";
import * as demandService from "./demand.service";
import { askQuestion, runSuggestedQuestion, SUGGESTED_QUESTIONS, METRICS, type MetricKey } from "./ask.service";

export async function ingestFileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new HttpError(400, "No file uploaded. Send a multipart field named 'file'.");
    }
    const user = req.user!;
    const result = await demandService.ingestDemandFile({
      foodBankId: user.foodBankId,
      uploadedByUserId: user.id,
      filename: req.file.originalname,
      buffer: req.file.buffer,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

const ingestJsonSchema = z.object({
  filename: z.string().min(1).default("api-import.json"),
  records: z.array(z.record(z.unknown())).min(1, "records must be a non-empty array"),
});

export async function ingestJsonHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const { filename, records } = ingestJsonSchema.parse(req.body);
    const result = await demandService.ingestDemandJson({
      foodBankId: user.foodBankId,
      uploadedByUserId: user.id,
      filename,
      records,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listUploadsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const uploads = await demandService.listDemandUploads(user.foodBankId);
    res.status(200).json({ uploads });
  } catch (err) {
    next(err);
  }
}

const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function uploadRecordsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const { page, pageSize } = pageQuery.parse(req.query);
    const records = await demandService.getRecordsForUpload(user.foodBankId, req.params.id, page, pageSize);
    res.status(200).json({ records, page, pageSize });
  } catch (err) {
    next(err);
  }
}

export function suggestedQuestionsHandler(_req: Request, res: Response) {
  res.status(200).json({ questions: SUGGESTED_QUESTIONS });
}

const askSchema = z.object({ question: z.string().min(1, "question is required").max(500) });

export async function askHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const { question } = askSchema.parse(req.body);
    const result = await askQuestion(user.foodBankId, question);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function suggestedAskHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const metric = req.params.metric as MetricKey;
    if (!(metric in METRICS)) {
      throw new HttpError(404, `Unknown metric. Valid: ${Object.keys(METRICS).join(", ")}`);
    }
    const result = await runSuggestedQuestion(user.foodBankId, metric);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

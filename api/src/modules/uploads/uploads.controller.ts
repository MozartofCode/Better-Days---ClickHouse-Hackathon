import { Request, Response, NextFunction } from "express";
import * as uploadsService from "./uploads.service";
import { HttpError } from "../../utils/http-error";

export async function uploadHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw new HttpError(400, "No file uploaded. Send a multipart field named 'file'.");
    }
    const user = req.user!;
    const result = await uploadsService.createUpload({
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

export async function listUploadsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user!;
    const uploads = await uploadsService.listUploads(user.foodBankId);
    res.status(200).json({ uploads });
  } catch (err) {
    next(err);
  }
}

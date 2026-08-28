import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

export function requireServiceKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header("X-API-Key");
  if (!key || key !== env.libreChatServiceApiKey) {
    return res.status(401).json({ error: "Missing or invalid X-API-Key header" });
  }
  next();
}

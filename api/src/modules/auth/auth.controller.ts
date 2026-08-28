import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as authService from "./auth.service";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["admin", "staff"]),
  foodBankName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = registerSchema.parse(req.body);
    const { token, user } = await authService.register(input);
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = loginSchema.parse(req.body);
    const { token, user } = await authService.login(input);
    res.status(200).json({ token, user });
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response) {
  res.status(200).json({ user: req.user });
}

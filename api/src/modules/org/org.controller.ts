import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as orgService from "./org.service";
import * as authService from "../auth/auth.service";
import * as operationsService from "../operations/operations.service";
import { HttpError } from "../../utils/http-error";

export async function getProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgService.getOrgProfile(req.user!.foodBankId));
  } catch (err) {
    next(err);
  }
}

const updateProfileSchema = z.object({
  address: z.string().optional(),
  primaryContact: z.string().optional(),
  timezone: z.string().optional(),
});

export async function updateProfileHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const patch = updateProfileSchema.parse(req.body);
    const organization = await operationsService.updateFoodBankProfile(req.user!.foodBankId, patch);
    res.json(organization);
  } catch (err) {
    next(err);
  }
}

const searchSchema = z.object({ query: z.string().min(1) });

export async function searchHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { query } = searchSchema.parse(req.body);
    res.json(await orgService.searchFoodBanks(query));
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(502, (err as Error).message));
  }
}

const linkSchema = z.object({ slug: z.string().min(1) });

export async function linkHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { slug } = linkSchema.parse(req.body);
    res.json(await orgService.linkFoodBank(req.user!.foodBankId, slug));
  } catch (err) {
    next(err instanceof HttpError ? err : new HttpError(502, (err as Error).message));
  }
}

export async function listMembersHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgService.listMembers(req.user!.foodBankId));
  } catch (err) {
    next(err);
  }
}

export async function listInvitesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgService.listPendingInvites(req.user!.foodBankId));
  } catch (err) {
    next(err);
  }
}

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "staff"]),
});

export async function createInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, role } = createInviteSchema.parse(req.body);
    const invite = await orgService.createInvite(req.user!.foodBankId, req.user!.id, email, role);
    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
}

export async function revokeInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    await orgService.revokeInvite(req.user!.foodBankId, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getInvitePublicHandler(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await orgService.getInviteByToken(req.params.token));
  } catch (err) {
    next(err);
  }
}

const acceptInviteSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export async function acceptInviteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const input = acceptInviteSchema.parse(req.body);
    const { token, user } = await authService.registerViaInvite({ token: req.params.token, ...input });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
}

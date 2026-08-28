import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  getProfileHandler,
  updateProfileHandler,
  searchHandler,
  linkHandler,
  listMembersHandler,
  listInvitesHandler,
  createInviteHandler,
  revokeInviteHandler,
  getInvitePublicHandler,
  acceptInviteHandler,
} from "./org.controller";

export const orgRouter = Router();

// Public — token-based, unauthenticated (an invited teammate has no
// account/JWT yet).
orgRouter.get("/invites/:token", getInvitePublicHandler);
orgRouter.post("/invites/:token/accept", acceptInviteHandler);

orgRouter.use(requireAuth);

orgRouter.get("/profile", getProfileHandler);
orgRouter.patch("/profile", requireRole("admin"), updateProfileHandler);
orgRouter.post("/food-bank-search", requireRole("admin"), searchHandler);
orgRouter.post("/food-bank-link", requireRole("admin"), linkHandler);
orgRouter.get("/members", requireRole("admin"), listMembersHandler);
orgRouter.get("/invites", requireRole("admin"), listInvitesHandler);
orgRouter.post("/invites", requireRole("admin"), createInviteHandler);
orgRouter.delete("/invites/:id", requireRole("admin"), revokeInviteHandler);

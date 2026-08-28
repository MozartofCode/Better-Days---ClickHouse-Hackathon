import crypto from "crypto";
import { pgPool } from "../../db/postgres";
import { HttpError } from "../../utils/http-error";
import { UserRole } from "../../types";
import * as operationsService from "../operations/operations.service";
import {
  searchFoodBanksByZip,
  searchFoodBanksByState,
  getFoodBankDetails,
  upsertFoodBank,
} from "../community-data/ingest/feedingAmerica";
import { extractSearchParams, rankCandidates, RankedFoodBankResult } from "./searchAssist";

export async function searchFoodBanks(freeText: string): Promise<RankedFoodBankResult[]> {
  const params = await extractSearchParams(freeText);
  if (!params.zip && !params.state) {
    throw new HttpError(
      422,
      "Include a state (e.g. CA) or ZIP code so we can search the Feeding America directory."
    );
  }

  const results = params.zip
    ? await searchFoodBanksByZip(params.zip)
    : await searchFoodBanksByState(params.state!);

  return rankCandidates(results, params);
}

export async function linkFoodBank(foodBankId: string, slug: string) {
  const details = await getFoodBankDetails(slug);
  await upsertFoodBank(details);

  const result = await pgPool.query(
    `UPDATE food_banks
     SET feeding_america_slug = $2,
         organization_type = COALESCE(organization_type, 'food_bank'),
         address = COALESCE(address, $3),
         primary_contact = COALESCE(primary_contact, $4),
         profile_setup_completed = true
     WHERE id = $1
     RETURNING id`,
    [foodBankId, slug, details.address ?? null, details.chief_executive?.name ?? null]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Food bank not found");

  return getOrgProfile(foodBankId);
}

export async function getOrgProfile(foodBankId: string) {
  const organization = await operationsService.getFoodBankProfile(foodBankId);

  const linked = await pgPool.query(
    `SELECT f.feeding_america_slug, f.profile_setup_completed, fa.name, fa.website,
            fa.meals_provided, fa.pounds_distributed, fa.counties_served, fa.phone
     FROM food_banks f
     LEFT JOIN feeding_america_food_banks fa ON fa.id = f.feeding_america_slug
     WHERE f.id = $1`,
    [foodBankId]
  );
  const row = linked.rows[0] ?? {};

  return {
    organization,
    profileSetupCompleted: row.profile_setup_completed ?? false,
    feedingAmerica: row.feeding_america_slug
      ? {
          slug: row.feeding_america_slug,
          name: row.name,
          website: row.website,
          phone: row.phone,
          mealsProvided: row.meals_provided !== null ? Number(row.meals_provided) : null,
          poundsDistributed: row.pounds_distributed !== null ? Number(row.pounds_distributed) : null,
          countiesServed: row.counties_served ?? [],
        }
      : null,
  };
}

export async function listMembers(foodBankId: string) {
  const result = await pgPool.query(
    `SELECT id, email, first_name, last_name, role, created_at
     FROM users WHERE food_bank_id = $1 ORDER BY created_at`,
    [foodBankId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role as UserRole,
    createdAt: r.created_at,
  }));
}

export async function listPendingInvites(foodBankId: string) {
  const result = await pgPool.query(
    `SELECT id, email, role, token, created_at, expires_at
     FROM org_invites WHERE food_bank_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
    [foodBankId]
  );
  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role as UserRole,
    token: r.token,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

export async function createInvite(foodBankId: string, invitedByUserId: string, email: string, role: UserRole) {
  const normalizedEmail = email.trim().toLowerCase();

  const existingUser = await pgPool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
  if (existingUser.rows.length > 0) {
    throw new HttpError(409, "That email already has an account");
  }

  // Re-inviting the same address revokes any prior pending invite (the
  // partial unique index on (food_bank_id, email) WHERE status='pending'
  // would otherwise reject the insert).
  await pgPool.query(
    `UPDATE org_invites SET status = 'revoked'
     WHERE food_bank_id = $1 AND email = $2 AND status = 'pending'`,
    [foodBankId, normalizedEmail]
  );

  const token = crypto.randomBytes(24).toString("hex");
  const result = await pgPool.query(
    `INSERT INTO org_invites (food_bank_id, email, role, token, invited_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, role, token, created_at, expires_at`,
    [foodBankId, normalizedEmail, role, token, invitedByUserId]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    role: row.role as UserRole,
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function revokeInvite(foodBankId: string, inviteId: string) {
  const result = await pgPool.query(
    `UPDATE org_invites SET status = 'revoked'
     WHERE id = $1 AND food_bank_id = $2 AND status = 'pending'
     RETURNING id`,
    [inviteId, foodBankId]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Invite not found");
}

export interface InviteLookup {
  id: string;
  foodBankId: string;
  foodBankName: string;
  email: string;
  role: UserRole;
}

export async function getInviteByToken(token: string): Promise<InviteLookup> {
  const result = await pgPool.query(
    `SELECT i.id, i.food_bank_id, i.email, i.role, i.status, i.expires_at, f.name AS food_bank_name
     FROM org_invites i
     JOIN food_banks f ON f.id = i.food_bank_id
     WHERE i.token = $1`,
    [token]
  );
  if (result.rows.length === 0) throw new HttpError(404, "Invite not found");

  const row = result.rows[0];
  if (row.status !== "pending") throw new HttpError(410, "This invite has already been used or revoked");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new HttpError(410, "This invite has expired");

  return {
    id: row.id,
    foodBankId: row.food_bank_id,
    foodBankName: row.food_bank_name,
    email: row.email,
    role: row.role as UserRole,
  };
}

export async function markInviteAccepted(inviteId: string) {
  await pgPool.query("UPDATE org_invites SET status = 'accepted', accepted_at = now() WHERE id = $1", [inviteId]);
}

// Typed client for the Feeding America data exposed via the parse.bot proxy:
// https://parse.bot/marketplace/5d4ee58e-0f17-4eae-953f-d6b940eec137/feedingamerica-org-api
//
// This is a Parse API key (starts with pmx_), not an official Feeding America
// API — Feeding America doesn't offer one. Auth: X-API-Key header. Metered
// (free tier: 200 credits/mo, 5 req/min) — treat every call as billable.
//
// Every response is wrapped as { status: "success", data: {...} }. Profiles
// are keyed by `slug` (e.g. "greater-chicago-food-depository"), not a
// numeric/opaque id.
//
// Stored in Postgres as `feeding_america_food_banks` — deliberately not
// named `food_banks`, which is this app's own tenant orgs table (the food
// banks whose staff register/log in/upload spreadsheets). This table is an
// unrelated cache of the public Feeding America directory.

import { env } from "../../../config/env";
import { pgPool } from "../../../db/postgres";

interface ParseBotResponse<T> {
  status: string;
  data: T;
}

export interface FoodBankSearchResult {
  name: string;
  slug: string;
  profile_url?: string;
  website?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  address?: string;
  counties_served?: string[];
}

export interface FoodBankDetails {
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  chief_executive?: { name?: string; title?: string; email?: string; phone?: string };
  media_contact?: { name?: string; title?: string; email?: string; phone?: string };
  social_links?: Record<string, string>;
  annual_pounds_distributed?: number;
  meals_provided?: number;
  counties_served?: string[];
  hunger_statistics?: {
    people_facing_hunger?: number;
    hunger_rate?: string;
    children_facing_hunger?: number;
    child_hunger_rate?: string;
  };
}

async function call<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!env.feedingAmerica.apiKey) {
    throw new Error(
      "FEEDINGAMERICA_API_KEY is not set. See .env.example and the README's " +
        "'Community & Demand Data' section."
    );
  }

  const url = new URL(`${env.feedingAmerica.baseUrl.replace(/\/$/, "")}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const doFetch = () =>
    fetch(url.toString(), {
      headers: { "X-API-Key": env.feedingAmerica.apiKey },
    });

  let res = await doFetch();
  if (res.status === 429) {
    // Single retry after a short backoff; this API rate-limits per minute.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    res = await doFetch();
  }

  if (!res.ok) {
    throw new Error(`Feeding America API ${endpoint} failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as ParseBotResponse<T>;
  return body.data;
}

export async function searchFoodBanksByZip(zip: string): Promise<FoodBankSearchResult[]> {
  const data = await call<{ zip_code: string; results: FoodBankSearchResult[] }>(
    "search_food_bank_by_zip",
    { zip }
  );
  return data.results;
}

export async function searchFoodBanksByState(state: string): Promise<FoodBankSearchResult[]> {
  const data = await call<{ state: string; results: FoodBankSearchResult[] }>(
    "search_food_banks_by_state",
    { state }
  );
  return data.results;
}

export function getFoodBankDetails(slug: string): Promise<FoodBankDetails> {
  return call<FoodBankDetails>("get_food_bank_details", { slug });
}

// Expensive — pages the full directory (198 food banks nationwide as of
// 2026-08-28). Off by default, run manually.
export async function getAllFoodBanks(): Promise<FoodBankSearchResult[]> {
  const data = await call<{ total: number; food_banks: FoodBankSearchResult[] }>(
    "get_all_food_banks"
  );
  return data.food_banks;
}

// Cache-aside: upsert whatever the live API returned into Postgres so the
// call is auditable and cheap to re-serve, without ever being the source of
// truth in place of a fresh call. Keyed by `slug`.
export async function upsertFoodBank(details: FoodBankDetails): Promise<void> {
  await pgPool.query(
    `INSERT INTO feeding_america_food_banks
       (id, name, address, phone, website, meals_provided, pounds_distributed, counties_served, raw, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       phone = EXCLUDED.phone,
       website = EXCLUDED.website,
       meals_provided = EXCLUDED.meals_provided,
       pounds_distributed = EXCLUDED.pounds_distributed,
       counties_served = EXCLUDED.counties_served,
       raw = EXCLUDED.raw,
       fetched_at = now()`,
    [
      details.slug,
      details.name,
      details.address ?? null,
      details.phone ?? null,
      details.website ?? null,
      details.meals_provided ?? null,
      details.annual_pounds_distributed ?? null,
      JSON.stringify(details.counties_served ?? []),
      JSON.stringify(details),
    ]
  );
}

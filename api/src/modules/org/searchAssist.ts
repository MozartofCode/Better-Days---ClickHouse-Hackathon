// Turns an admin's free-text description of their org ("we're a food bank
// in Denver, CO" / "Alameda County Community Food Bank") into search
// parameters for the Feeding America directory API
// (community-data/ingest/feedingAmerica.ts only supports exact zip/state
// lookups, not free text), plus a deterministic post-hoc ranking of the
// results. The LLM step is only for extraction — ranking/explanation stays
// deterministic so it never hallucinates a match.

import { groqChatCompletion } from "../operations/reasoning/groqClient";
import type { FoodBankSearchResult } from "../community-data/ingest/feedingAmerica";

export interface SearchParams {
  state?: string;
  zip?: string;
  nameHint?: string;
}

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN",
  "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV",
  "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN",
  "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function regexExtract(freeText: string): SearchParams {
  const zipMatch = freeText.match(/\b(\d{5})\b/);
  const stateMatch = freeText
    .toUpperCase()
    .match(/\b([A-Z]{2})\b/g)
    ?.find((code) => US_STATE_CODES.has(code));
  const nameHint = freeText.trim() || undefined;
  return {
    zip: zipMatch?.[1],
    state: stateMatch,
    nameHint,
  };
}

const SYSTEM_PROMPT = `You extract search parameters from a food bank administrator's free-text description of their organization, for a directory search API that accepts either a US ZIP code or a 2-letter USPS state code.

Respond with ONLY a JSON object, no prose, no markdown fences, matching this shape:
{"state": "<2-letter USPS code or null>", "zip": "<5-digit ZIP or null>", "nameHint": "<the organization name or a short distinguishing phrase from the text, or null>"}

If the text names a city but not a state, infer the state when unambiguous. If nothing usable is present, return all nulls.`;

async function extractViaGroq(freeText: string): Promise<SearchParams | null> {
  const result = await groqChatCompletion(SYSTEM_PROMPT, freeText, 200);
  const jsonText = result.content.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(jsonText) as { state?: string | null; zip?: string | null; nameHint?: string | null };
  const state = parsed.state && US_STATE_CODES.has(parsed.state.toUpperCase()) ? parsed.state.toUpperCase() : undefined;
  const zip = parsed.zip && /^\d{5}$/.test(parsed.zip) ? parsed.zip : undefined;
  const nameHint = parsed.nameHint?.trim() || undefined;
  return { state, zip, nameHint };
}

export async function extractSearchParams(freeText: string): Promise<SearchParams> {
  try {
    const extracted = await extractViaGroq(freeText);
    if (extracted && (extracted.state || extracted.zip || extracted.nameHint)) {
      return extracted;
    }
  } catch (err) {
    console.warn(
      `org/searchAssist: falling back to regex extraction — ${err instanceof Error ? err.message : String(err)}`
    );
  }
  return regexExtract(freeText);
}

export interface RankedFoodBankResult extends FoodBankSearchResult {
  matchReason: string;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

export function rankCandidates(
  results: FoodBankSearchResult[],
  params: SearchParams
): RankedFoodBankResult[] {
  const hintTokens = params.nameHint ? new Set(tokenize(params.nameHint)) : null;

  const scored = results.map((result) => {
    let score = 0;
    const reasons: string[] = [];

    if (params.zip && result.zip === params.zip) {
      score += 3;
      reasons.push(`Matches ZIP ${params.zip}`);
    }
    if (params.state && result.state?.toUpperCase() === params.state) {
      score += 1;
      reasons.push(`In ${params.state}`);
    }
    if (hintTokens && hintTokens.size > 0) {
      const nameTokens = new Set(tokenize(result.name ?? ""));
      const cityTokens = new Set(tokenize(result.city ?? ""));
      const overlap = [...hintTokens].filter((t) => nameTokens.has(t) || cityTokens.has(t));
      if (overlap.length > 0) {
        score += overlap.length * 2;
        reasons.push(`Name/city matches "${overlap.join(", ")}"`);
      }
    }

    return {
      ...result,
      matchReason: reasons.length > 0 ? reasons.join("; ") : "Within your search area",
      _score: score,
    };
  });

  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, 8).map(({ _score, ...rest }) => rest);
}

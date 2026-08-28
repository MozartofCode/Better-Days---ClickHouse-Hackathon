// Enriches the deterministic recommendation templates (recommendations.ts)
// with model-written prose, without ever letting the model touch a number
// that isn't already in the evidence. recommendations.ts itself stays a
// pure function — this is a separate, optional orchestration layer that
// wraps its output.
//
// Guardrails (per the spec's "AI INTELLIGENCE REQUIREMENTS" — the AI must
// never invent a number, claim an unmeasured cause, or state a forecast as
// fact):
//   1. The model receives ONLY the candidate's own evidence/impact/
//      assumptions fields — never raw entities, never other candidates'
//      data.
//   2. The model may only reword; it may not introduce any numeric token
//      that doesn't already appear somewhere in what it was given. Output
//      containing a new number is rejected outright, not sanitized.
//   3. Any failure — missing API key, network error, invalid JSON, a
//      rejected numeric token — falls back to the original deterministic
//      template untouched. The dashboard is never blocked on this call and
//      never shows a half-written narrative.

import { groqChatCompletion } from "./groqClient";
import { Recommendation } from "../recommendations";

const SYSTEM_PROMPT = `You rewrite operational recommendations for a food pantry dashboard into clear, professional prose.

You will receive a JSON object describing one recommendation: its priority, type, evidence, estimated impact, assumptions, owner role, and due date. Rewrite three fields:
- title: <=10 words, states the action needed
- recommendedAction: 1-3 sentences, specific and actionable for the stated owner_role
- whyNow: 1-2 sentences explaining the urgency, grounded only in the evidence given

Rules:
- Never state a number, date, or quantity that is not already present in the input JSON.
- Never assert a cause as certain — use "likely" or "may" language when evidence includes likely_causes.
- Never claim a compliance or reporting requirement not stated in the input.
- Never suggest the situation is resolved or acceptable.
- Return ONLY a JSON object with exactly the keys title, recommendedAction, whyNow. No markdown fences, no other keys, no preamble.`;

function extractNumbers(text: string): Set<string> {
  return new Set((text.match(/\d+(\.\d+)?/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, "")));
}

function normalizeNumber(n: string): string {
  return n.replace(/^0+(?=\d)/, "");
}

interface NarrativeFields {
  title: string;
  recommendedAction: string;
  whyNow: string;
}

function parseAndValidate(raw: string, allowedNumbers: Set<string>): NarrativeFields | null {
  let parsed: unknown;
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("title" in parsed) ||
    !("recommendedAction" in parsed) ||
    !("whyNow" in parsed)
  ) {
    return null;
  }

  const fields = parsed as Record<string, unknown>;
  const { title, recommendedAction, whyNow } = fields;
  if (typeof title !== "string" || typeof recommendedAction !== "string" || typeof whyNow !== "string") {
    return null;
  }

  const outputNumbers = new Set(
    [...extractNumbers(title), ...extractNumbers(recommendedAction), ...extractNumbers(whyNow)].map(normalizeNumber)
  );
  for (const n of outputNumbers) {
    if (!allowedNumbers.has(n)) {
      console.warn(`narrateRecommendations: rejected output containing ungrounded number "${n}"`);
      return null;
    }
  }

  return { title, recommendedAction, whyNow };
}

async function narrateOne(recommendation: Recommendation): Promise<Recommendation> {
  const evidenceForModel = {
    priority: recommendation.priority,
    recommendationType: recommendation.recommendationType,
    evidence: recommendation.evidence,
    estimatedImpact: recommendation.estimatedImpact,
    assumptionsAndLimits: recommendation.assumptionsAndLimits,
    ownerRole: recommendation.ownerRole,
    dueBy: recommendation.dueBy,
    // Include the deterministic template text too — every number in it is
    // already verified-grounded, so it's a legitimate source of allowed
    // numbers even though the model is being asked to rewrite it.
    currentTitle: recommendation.title,
    currentRecommendedAction: recommendation.recommendedAction,
    currentWhyNow: recommendation.whyNow,
  };

  const userPrompt = JSON.stringify(evidenceForModel);
  const allowedNumbers = new Set(
    [...extractNumbers(userPrompt)].map(normalizeNumber)
  );

  try {
    const result = await groqChatCompletion(SYSTEM_PROMPT, userPrompt);
    const narrative = parseAndValidate(result.content, allowedNumbers);
    if (!narrative) {
      return recommendation;
    }
    return { ...recommendation, ...narrative };
  } catch (err) {
    console.warn(
      `narrateRecommendations: falling back to template for "${recommendation.title}" — ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return recommendation;
  }
}

// Enriches all three recommendations in parallel. Never throws — any
// individual failure falls back to that recommendation's original template.
export async function narrateRecommendations(recommendations: Recommendation[]): Promise<Recommendation[]> {
  return Promise.all(recommendations.map(narrateOne));
}

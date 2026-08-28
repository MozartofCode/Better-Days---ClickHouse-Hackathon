// Thin client for Groq's OpenAI-compatible chat completions API
// (https://api.groq.com/openai/v1). Not xAI's "Grok" — same name spoken
// aloud, different company/product; verified against the live API before
// wiring this in (see conversation history for the mix-up).
//
// This is the one place in the operations module allowed to make a network
// call to a model. Callers (narrateRecommendations.ts) own the guardrails —
// this file just sends/receives JSON.

import { env } from "../../../config/env";

export interface GroqChatResult {
  content: string;
  reasoning: string | null;
}

export async function groqChatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 600
): Promise<GroqChatResult> {
  if (!env.groq.apiKey) {
    throw new Error("GROQ_API_KEY is not set. See .env.example.");
  }

  const res = await fetch(`${env.groq.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.groq.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.groq.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq chat completion failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const body = (await res.json()) as {
    choices: Array<{ message: { content: string; reasoning?: string } }>;
  };
  const choice = body.choices[0];
  if (!choice) {
    throw new Error("Groq chat completion returned no choices.");
  }

  return { content: choice.message.content, reasoning: choice.message.reasoning ?? null };
}

// "Ask Your Data": question -> a fixed, whitelisted query intent -> a real
// deterministic query (demand.service.ts) -> the AI only narrates the actual
// result. The AI never computes anything and never sees a database
// connection — it gets JSON numbers already produced by SQL/JS and is told
// not to add any it wasn't given.
//
// Every step degrades gracefully if Groq is unavailable: intent
// classification falls back to a keyword match, and narration falls back to
// a templated sentence built from the same result. A suggested-question
// button never needs the LLM at all — it sends its metric key directly.

import { env } from "../../config/env";
import {
  topSitesByDemand,
  demandTrend,
  commoditiesByDemand,
  sitesWithIncreasingDemand,
  monthOverMonthChange,
  type DemandQueryRow,
  type SiteDelta,
  type MonthOverMonthResult,
} from "./demand.service";

interface GroqChatCompletion {
  choices?: { message?: { content?: string } }[];
}

export type MetricKey = "topSites" | "trend" | "commodities" | "increasing" | "momChange";

export const METRICS: Record<MetricKey, { label: string; question: string; keywords: string[] }> = {
  topSites: {
    label: "Top sites by demand",
    question: "Which pantry sites had the highest demand this month?",
    keywords: ["site", "location", "highest demand", "busiest"],
  },
  trend: {
    label: "Demand trend",
    question: "How has demand changed over the last three months?",
    keywords: ["trend", "changed over", "last three months", "over time"],
  },
  commodities: {
    label: "Commodities by demand",
    question: "Which commodities have the highest recorded demand?",
    keywords: ["commodit", "item", "shortage", "shortages"],
  },
  increasing: {
    label: "Sites with increasing demand",
    question: "Show me the sites with increasing demand.",
    keywords: ["increasing", "growing", "going up"],
  },
  momChange: {
    label: "Month-over-month change",
    question: "What changed compared with last month?",
    keywords: ["month-over-month", "compared with last month", "changed compared"],
  },
};

export const SUGGESTED_QUESTIONS: { metric: MetricKey; question: string }[] = Object.entries(METRICS).map(
  ([metric, m]) => ({ metric: metric as MetricKey, question: m.question })
);

export interface AskResult {
  metric: MetricKey;
  label: string;
  data: unknown;
  answer: string;
  narratedByAi: boolean;
}

function keywordClassify(question: string): MetricKey | null {
  const q = question.toLowerCase();
  for (const [key, m] of Object.entries(METRICS)) {
    if (m.keywords.some((k) => q.includes(k))) return key as MetricKey;
  }
  return null;
}

async function classifyWithGroq(question: string): Promise<MetricKey | "unsupported" | null> {
  if (!env.groqApiKey) return null;

  const metricList = Object.entries(METRICS)
    .map(([key, m]) => `- "${key}": ${m.question}`)
    .join("\n");

  const prompt = `Classify the user's question into exactly one of these metric keys, or "unsupported" if none fit:
${metricList}

Respond with ONLY a JSON object, no markdown fences, no explanation: {"metric": "<key or unsupported>"}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0,
        max_tokens: 50,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) return null;
    const completion = (await res.json()) as GroqChatCompletion;
    const text: string | undefined = completion?.choices?.[0]?.message?.content;
    if (!text) return null;
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (parsed.metric === "unsupported") return "unsupported";
    if (parsed.metric in METRICS) return parsed.metric as MetricKey;
    return null;
  } catch {
    return null;
  }
}

async function classify(question: string): Promise<MetricKey | "unsupported"> {
  const viaGroq = await classifyWithGroq(question);
  if (viaGroq) return viaGroq;
  const viaKeywords = keywordClassify(question);
  return viaKeywords ?? "unsupported";
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function runMetric(foodBankId: string, metric: MetricKey): Promise<unknown> {
  switch (metric) {
    case "topSites":
      // "highest demand this month" — filter to the current month, not all-time.
      return topSitesByDemand(foodBankId, currentMonthKey());
    case "trend":
      return demandTrend(foodBankId, 3);
    case "commodities":
      return commoditiesByDemand(foodBankId, currentMonthKey());
    case "increasing":
      return sitesWithIncreasingDemand(foodBankId);
    case "momChange":
      return monthOverMonthChange(foodBankId);
  }
}

// Zero-AI fallback: a plain sentence built directly from the real result.
// Always available, even with GROQ_API_KEY unset or Groq down.
function templateAnswer(metric: MetricKey, data: unknown): string {
  switch (metric) {
    case "topSites": {
      const rows = data as DemandQueryRow[];
      if (rows.length === 0) return "No site data found yet — upload a demand file to see this.";
      return `Top sites by visits: ${rows
        .slice(0, 5)
        .map((r) => `${r.site} (${r.total_visits} visits)`)
        .join(", ")}.`;
    }
    case "trend": {
      const rows = data as DemandQueryRow[];
      if (rows.length === 0) return "No demand data found in the last 3 months yet.";
      return `By month: ${rows.map((r) => `${String(r.month).slice(0, 7)}: ${r.total_visits} visits`).join(", ")}.`;
    }
    case "commodities": {
      const rows = data as DemandQueryRow[];
      if (rows.length === 0) return "No commodity data found yet.";
      return `Highest recorded demand by commodity: ${rows
        .slice(0, 5)
        .map((r) => `${r.commodity} (${r.total_quantity})`)
        .join(", ")}. This reflects demand recorded, not a supply shortfall — no inventory-vs-demand comparison is available yet.`;
    }
    case "increasing": {
      const rows = data as SiteDelta[];
      if (rows.length === 0) return "No sites show increasing demand month-over-month right now.";
      return `Sites with increasing demand: ${rows.map((r) => `${r.site} (+${r.delta.toFixed(0)})`).join(", ")}.`;
    }
    case "momChange": {
      const r = data as MonthOverMonthResult;
      if (r.previousMonthTotal === 0 && r.currentMonthTotal === 0) return "Not enough data yet to compare months.";
      const direction = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
      return `Demand is ${direction} ${Math.abs(r.delta).toFixed(0)} (${r.deltaPct === null ? "n/a" : `${r.deltaPct}%`}) compared to last month.`;
    }
  }
}

async function narrateWithGroq(question: string, metric: MetricKey, data: unknown): Promise<string | null> {
  if (!env.groqApiKey) return null;

  const systemPrompt = `You explain food-bank demand data to pantry operations staff. You are given the ACTUAL result of a database query below as JSON — use ONLY the numbers in it. Never invent a number, site, or commodity that isn't in the JSON. Never perform arithmetic beyond what's already computed. If the data is empty, say so plainly. Keep it to 1-3 short sentences, no jargon, no bullet points.

QUERY RESULT (${METRICS[metric].label}):
${JSON.stringify(data)}`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.groqApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
        max_tokens: 300,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) return null;
    const completion = (await res.json()) as GroqChatCompletion;
    const text: string | undefined = completion?.choices?.[0]?.message?.content;
    return text ?? null;
  } catch {
    return null;
  }
}

export async function askQuestion(foodBankId: string, question: string): Promise<AskResult> {
  const metric = await classify(question);
  if (metric === "unsupported") {
    return {
      metric: "topSites",
      label: "Unsupported question",
      data: null,
      narratedByAi: false,
      answer:
        "I can answer questions about site demand, demand trends, commodities, increasing-demand sites, and month-over-month change. Try one of the suggested questions, or rephrase using one of those topics.",
    };
  }

  const data = await runMetric(foodBankId, metric);
  const aiAnswer = await narrateWithGroq(question, metric, data);

  return {
    metric,
    label: METRICS[metric].label,
    data,
    answer: aiAnswer ?? templateAnswer(metric, data),
    narratedByAi: aiAnswer !== null,
  };
}

// Used by the suggested-question buttons: skips classification entirely
// (the button already names its metric), so it never depends on the LLM to
// pick the right query — only, optionally, to phrase the answer.
export async function runSuggestedQuestion(foodBankId: string, metric: MetricKey): Promise<AskResult> {
  const data = await runMetric(foodBankId, metric);
  const aiAnswer = await narrateWithGroq(METRICS[metric].question, metric, data);
  return {
    metric,
    label: METRICS[metric].label,
    data,
    answer: aiAnswer ?? templateAnswer(metric, data),
    narratedByAi: aiAnswer !== null,
  };
}

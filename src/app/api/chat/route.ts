import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const MAX_ITEMS_IN_CONTEXT = 500;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface InventoryItemLite {
  itemName: string | null;
  category: string | null;
  quantity: number | null;
  unit: string | null;
  expirationDate: string | null;
  restockingStatus: string | null;
}

function buildSystemPrompt(items: InventoryItemLite[]): string {
  const table = items
    .slice(0, MAX_ITEMS_IN_CONTEXT)
    .map((i) => {
      const parts = [
        i.itemName ?? "unnamed item",
        i.category ? `category: ${i.category}` : null,
        i.quantity !== null ? `qty: ${i.quantity}${i.unit ? ` ${i.unit}` : ""}` : null,
        i.restockingStatus ? `status: ${i.restockingStatus}` : null,
        i.expirationDate ? `expires: ${i.expirationDate}` : null,
      ].filter(Boolean);
      return `- ${parts.join(", ")}`;
    })
    .join("\n");

  return `You are Pana's pantry analytics assistant for a food bank. You help staff answer questions about what's in stock and plan with what they have.

When someone describes something they want to make or give out (e.g. "I want to make a hamburger, what ingredients do I need?"), do this:
1. List the typical ingredients needed.
2. Check each one against the CURRENT INVENTORY below and say whether it's in stock, low, out of stock, or not tracked at all.
3. Give a short, clear verdict (e.g. "You can make this" / "You're missing X and Y").

Keep answers concise and practical, formatted with short bullet points. If the inventory is empty or doesn't contain relevant items, say so plainly instead of guessing what's on hand.

CURRENT INVENTORY (${items.length} item${items.length === 1 ? "" : "s"}${items.length > MAX_ITEMS_IN_CONTEXT ? `, showing first ${MAX_ITEMS_IN_CONTEXT}` : ""}):
${table || "(no inventory uploaded yet)"}`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Chat needs a Groq API key. Set GROQ_API_KEY in your server environment and restart." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const messages: ChatMessage[] | undefined = body?.messages;
  const items: InventoryItemLite[] = Array.isArray(body?.items) ? body.items : [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No messages were provided." }, { status: 400 });
  }

  const model = process.env.GROQ_CHAT_MODEL || DEFAULT_MODEL;

  let groqRes: Response;
  try {
    groqRes = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 1024,
        messages: [
          { role: "system", content: buildSystemPrompt(items) },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the chat service. Please try again." }, { status: 502 });
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Chat service error (${groqRes.status}). ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const completion = await groqRes.json();
  const content: string | undefined = completion?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "The chat service returned no content." }, { status: 502 });
  }

  return NextResponse.json({ reply: content });
}

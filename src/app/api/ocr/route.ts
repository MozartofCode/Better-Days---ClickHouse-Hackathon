import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.6-27b";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a data-entry assistant for a food bank. You are given a photo of a paper log, inventory sheet, or sign-in sheet. Read the table in the photo (including handwriting) and return ONLY strict JSON in this exact shape, with no markdown, no commentary, no code fences:
{"headers": ["Column A", "Column B", ...], "rows": [["value", "value", ...], ...]}
Rules:
- The first row of the table is the headers.
- Every row in "rows" must have the same number of cells as "headers".
- If a cell is blank or illegible, use an empty string "".
- Do not invent data that isn't on the page.
- If you cannot find a table at all, return {"headers": [], "rows": []}.`;

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Photo uploads need a Groq API key. Set GROQ_API_KEY in your server environment and restart." },
      { status: 501 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That photo is too large. Please use one under 8MB." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const base64 = buf.toString("base64");
  const mime = file.type || "image/jpeg";
  const dataUrl = `data:${mime};base64,${base64}`;

  const model = process.env.GROQ_VISION_MODEL || DEFAULT_MODEL;

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
        temperature: 0,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the table from this photo as JSON." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the OCR service. Please try again." }, { status: 502 });
  }

  if (!groqRes.ok) {
    const errText = await groqRes.text().catch(() => "");
    return NextResponse.json(
      { error: `OCR service error (${groqRes.status}). ${errText.slice(0, 200)}` },
      { status: 502 }
    );
  }

  const completion = await groqRes.json();
  const content: string | undefined = completion?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json({ error: "The OCR service returned no content." }, { status: 502 });
  }

  let parsed: { headers?: unknown; rows?: unknown };
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    return NextResponse.json(
      { error: "Couldn't read a table from that photo. Try a clearer, well-lit photo." },
      { status: 422 }
    );
  }

  const headers = Array.isArray(parsed.headers) ? parsed.headers.map((h) => String(h ?? "")) : [];
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.filter((r): r is unknown[] => Array.isArray(r)).map((r) => r.map((c) => String(c ?? "")))
    : [];

  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json(
      { error: "We couldn't find a table in that photo. Please try a clearer photo of the full page." },
      { status: 422 }
    );
  }

  return NextResponse.json({ headers, rows });
}

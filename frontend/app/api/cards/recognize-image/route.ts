/**
 * POST /api/cards/recognize-image — AI fallback for card recognition.
 *
 * Mobile Scan Card: when OCR/candidate matching fails, fall back to AI vision.
 * - Request: multipart/form-data with "image" (file)
 * - Auth: Optional (Bearer for mobile; guest allowed)
 * - Response: { ok, recognition: { source, guessed_name, validated_name, confidence, reason, alternatives } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCardName, stringSimilarity } from "@/lib/deck/cleanCardName";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { recordAiUsage } from "@/lib/ai/log-usage";
import { costUSD } from "@/lib/ai/pricing";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
const SUPPORTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MODEL = process.env.MODEL_SCAN_RECOGNIZE || "gpt-4o-mini";
const TIMEOUT_MS = 15000;

const CARD_RECOGNITION_PROMPT = `You are identifying a Magic: The Gathering card from a photo.

Rules:
- Look at the image and identify the printed card name (the title at the top).
- Return ONLY a JSON object with this exact structure. No other text.
{"primary": "Exact Card Name", "alternatives": ["Alternative 1", "Alternative 2"], "confidence": "high|medium|low", "reason": "One short sentence"}

- primary: the most likely card name (use the exact printed name if readable)
- alternatives: 0-3 other possibilities if uncertain
- confidence: "high" if the name is clearly readable, "medium" if partially visible, "low" if guessing from artwork
- reason: brief explanation (e.g. "Name clearly visible" or "Identified from artwork")
- Do NOT invent set codes, prices, or flavor text.
- If you cannot identify a card, return: {"primary": "", "alternatives": [], "confidence": "low", "reason": "Could not identify card"}`;

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`´]/g, "'")
    .trim();
}

async function fuzzyValidate(
  guessed: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ validated: string; alternatives: string[] }> {
  const q0 = cleanCardName(guessed);
  if (!q0 || q0.length < 2) return { validated: "", alternatives: [] };
  const qn = norm(q0);

  try {
    const { data: exact } = await supabase
      .from("scryfall_cache")
      .select("name")
      .ilike("name", q0)
      .limit(1);
    if (exact?.length) return { validated: exact[0].name, alternatives: [] };

    const escaped = q0.replace(/[%_]/g, "\\$&");
    const { data: contains } = await supabase
      .from("scryfall_cache")
      .select("name")
      .ilike("name", `%${escaped}%`)
      .limit(5);
    if (contains?.length) {
      const sorted = contains
        .map((r) => ({ name: r.name, score: stringSimilarity(qn, norm(r.name)) }))
        .sort((a, b) => b.score - a.score);
      return { validated: sorted[0].name, alternatives: sorted.slice(1, 4).map((r) => r.name) };
    }

    const r = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(q0)}`,
      { cache: "no-store" }
    );
    const j = (await r.json().catch(() => ({}))) as { name?: string };
    if (j?.name) return { validated: String(j.name).trim(), alternatives: [] };
  } catch {}
  return { validated: "", alternatives: [] };
}

function parseAiResponse(text: string): {
  primary: string;
  alternatives: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
} | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const j = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const primary = String(j?.primary ?? "").trim();
    const alternatives = Array.isArray(j?.alternatives)
      ? (j.alternatives as string[]).slice(0, 3).filter((s) => typeof s === "string" && s.trim())
      : [];
    const conf = String(j?.confidence ?? "low").toLowerCase();
    const confidence = ["high", "medium", "low"].includes(conf) ? (conf as "high" | "medium" | "low") : "low";
    const reason = String(j?.reason ?? "").trim() || "AI recognition";
    return { primary, alternatives, confidence, reason };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "recognition_unavailable" }, { status: 503 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    const file = formData.get("image") ?? formData.get("file");
    const blob = file instanceof Blob ? file : null;
    if (!blob || blob.size === 0) {
      return NextResponse.json({ ok: false, error: "no_image" }, { status: 400 });
    }
    if (blob.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "image_too_large" }, { status: 400 });
    }
    const mime = (blob.type?.toLowerCase() || "image/jpeg").trim();
    const allowed = SUPPORTED_TYPES.includes(mime) || mime.startsWith("image/");
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "unsupported_format" }, { status: 400 });
    }

    const buf = await blob.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${blob.type || "image/jpeg"};base64,${base64}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const body = prepareOpenAIBody({
      model: MODEL,
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: "You return only valid JSON. No markdown, no extra text." },
        {
          role: "user",
          content: [
            { type: "text", text: CARD_RECOGNITION_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const json = (await res.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
    const usage = json?.usage ?? {};
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const cost = costUSD(MODEL, inputTokens, outputTokens);

    recordAiUsage({
      user_id: null,
      model: MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: cost,
      route: "scan_recognize_image",
      prompt_preview: "card recognition vision",
      response_preview: content?.slice(0, 200) ?? null,
      latency_ms: Date.now() - t0,
    }).catch(() => {});

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
    }

    const parsed = parseAiResponse(content);
    if (!parsed || !parsed.primary) {
      return NextResponse.json({
        ok: false,
        error: "recognition_failed",
      });
    }

    const supabase = await createClient();
    const { validated } = await fuzzyValidate(parsed.primary, supabase);
    const altResults = await Promise.all(
      parsed.alternatives.slice(0, 3).map((a) => fuzzyValidate(a, supabase))
    );
    const allValidated: string[] = [];
    if (validated) allValidated.push(validated);
    for (const p of altResults) {
      if (p.validated && !allValidated.includes(p.validated)) allValidated.push(p.validated);
    }

    const bestValidated = validated || allValidated[0];
    if (!bestValidated) {
      return NextResponse.json({ ok: false, error: "recognition_failed" });
    }

    return NextResponse.json({
      ok: true,
      recognition: {
        source: "ai_vision",
        guessed_name: parsed.primary,
        validated_name: bestValidated,
        confidence: parsed.confidence,
        reason: parsed.reason,
        alternatives: allValidated.slice(0, 5),
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json({ ok: false, error: "timeout" }, { status: 504 });
    }
    return NextResponse.json({ ok: false, error: "recognition_failed" }, { status: 502 });
  }
}

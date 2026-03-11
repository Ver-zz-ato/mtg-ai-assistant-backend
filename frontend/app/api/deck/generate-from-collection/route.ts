import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { getDetailsForNamesCached } from "@/lib/server/scryfallCache";
import { sanitizeName } from "@/lib/profanity";
import { GENERATE_FROM_COLLECTION_FREE, GENERATE_FROM_COLLECTION_PRO } from "@/lib/feature-limits";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function norm(name: string): string {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDeckText(text: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+?)\s*$/i);
    if (!m) continue;
    const qty = Math.max(1, Math.min(99, parseInt(m[1], 10) || 1));
    const name = m[2].trim();
    if (!name) continue;
    out.push({ name, qty });
  }
  return out;
}

function aggregateCards(cards: Array<{ name: string; qty: number }>): Array<{ name: string; qty: number }> {
  const map = new Map<string, { name: string; qty: number }>();
  for (const c of cards) {
    const key = c.name.trim().toLowerCase();
    const prev = map.get(key);
    if (prev) prev.qty = Math.min(99, prev.qty + c.qty);
    else map.set(key, { name: c.name.trim(), qty: c.qty });
  }
  return Array.from(map.values());
}

async function getCommanderColorIdentity(commanderName: string): Promise<string[]> {
  if (!commanderName?.trim()) return [];
  const parts = commanderName.split(/\s*\/\/\s*/);
  const allColors = new Set<string>();
  try {
    const details = await getDetailsForNamesCached(parts);
    for (const part of parts) {
      const cardData = details.get(norm(part));
      if (cardData?.color_identity && Array.isArray(cardData.color_identity)) {
        cardData.color_identity.forEach((c: string) => allColors.add(c.toUpperCase()));
      }
    }
  } catch {
    // ignore
  }
  const wubrgOrder = ["W", "U", "B", "R", "G"];
  return wubrgOrder.filter((c) => allColors.has(c));
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp?.user;
    if (!user) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const collectionId = typeof body?.collectionId === "string" ? body.collectionId : null;
    const commander = typeof body?.commander === "string" ? body.commander.trim() : null;
    const playstyle = typeof body?.playstyle === "string" ? body.playstyle : null;
    const powerLevel = typeof body?.powerLevel === "string" ? body.powerLevel : "Casual";
    const budget = typeof body?.budget === "string" ? body.budget : "Moderate";
    const format = typeof body?.format === "string" ? body.format : "Commander";

    if (!collectionId && !commander) {
      return NextResponse.json(
        { ok: false, error: "Provide collectionId and/or commander (at least one required)" },
        { status: 400 }
      );
    }

    // Rate limit by tier (free vs pro)
    let isPro = false;
    try {
      const { checkProStatus } = await import("@/lib/server-pro-check");
      isPro = await checkProStatus(user.id);
    } catch {}
    const dailyLimit = isPro ? GENERATE_FROM_COLLECTION_PRO : GENERATE_FROM_COLLECTION_FREE;
    const keyHash = `user:${user.id}`;
    try {
      const durableLimit = await checkDurableRateLimit(
        supabase,
        keyHash,
        "/api/deck/generate-from-collection",
        dailyLimit,
        1
      );
      if (!durableLimit.allowed) {
        const errMsg = isPro
          ? "You've reached your daily limit. Contact support if you need higher limits."
          : `You've used your ${GENERATE_FROM_COLLECTION_FREE} free deck generations today. Upgrade to Pro for more!`;
        return NextResponse.json(
          {
            ok: false,
            code: "RATE_LIMIT_DAILY",
            error: errMsg,
            resetAt: durableLimit.resetAt,
            remaining: 0,
          },
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
    } catch (e) {
      console.error("[generate-from-collection] Rate limit check failed:", e);
    }

    // Fetch collection cards if collectionId provided
    let collectionItems: Array<{ name: string; qty: number }> = [];
    if (collectionId) {
      const { data: col } = await supabase
        .from("collections")
        .select("id, user_id")
        .eq("id", collectionId)
        .maybeSingle();
      if (!col || col.user_id !== user.id) {
        return NextResponse.json({ ok: false, error: "Collection not found or access denied" }, { status: 403 });
      }
      const { data: cards } = await supabase
        .from("collection_cards")
        .select("name, qty")
        .eq("collection_id", collectionId);
      collectionItems = (cards ?? []).map((c) => ({ name: c.name, qty: Number(c.qty) || 1 }));
    }

    const collectionList =
      collectionItems.length > 0
        ? collectionItems.map((c) => `- ${c.name} x${c.qty}`).join("\n")
        : "No collection provided; generate a deck from the full card pool.";

    const commanderLine = commander
      ? `Commander: ${commander}. Build a 100-card Commander deck with this commander in the 99 or as the commander (include it once).`
      : "No commander specified. Pick a well-known commander that fits the collection and build a 100-card Commander deck. Include the commander.";

    const systemPrompt = `You are an expert Magic: The Gathering deck builder. Your task is to output a valid Commander decklist.

Rules:
1. Output ONLY the decklist, one card per line, format: "1 Card Name" (quantity then card name).
2. For Commander format: exactly 100 cards total, singleton except for basic lands.
3. All cards must be legal in Commander ( no silver-bordered, no banned cards).
4. Respect the commander's color identity.
5. Prefer cards from the user's collection when provided; only add cards outside the collection if needed for a coherent deck.
6. Include ramp (mana rocks, land ramp), card draw, removal, and win conditions.
7. Do NOT include any commentary, markdown, or extra text. Only the decklist lines.`;

    const userPrompt = `Build a Commander deck with these constraints:

${commanderLine}

User's collection (prioritize these cards):
${collectionList}

Playstyle: ${playstyle || "general"}
Power level: ${powerLevel}
Budget: ${budget}

Output the full 100-card decklist as plain text, one line per card (e.g. "1 Sol Ring").`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "AI service not configured" }, { status: 500 });
    }

    const { model } = getModelForTier({
      isGuest: false,
      userId: user.id,
      isPro,
      useCase: "deck_analysis",
    });

    const payload = prepareOpenAIBody({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 8000,
      temperature: 0.7,
    } as Record<string, unknown>);

    const resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[generate-from-collection] OpenAI error:", resp.status, errText);
      return NextResponse.json(
        { ok: false, error: "Deck generation failed" },
        { status: 500 }
      );
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = parseDeckText(content);
    const cards = aggregateCards(parsed);

    if (cards.length < 30) {
      return NextResponse.json(
        { ok: false, error: "Generated decklist too short; please try again" },
        { status: 500 }
      );
    }

    const deckText = cards.map((c) => `${c.qty} ${c.name}`).join("\n");
    const commanderName = commander || cards[0]?.name || "Unknown";
    const colors = await getCommanderColorIdentity(commanderName);
    const title = sanitizeName(
      commander ? `${commander} (AI)` : `AI Deck from Collection`,
      120
    );

    const { data: deckRow, error: deckErr } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title,
        format: format || "Commander",
        plan: "Optimized",
        colors: colors.length > 0 ? colors : null,
        commander: commanderName,
        deck_text: deckText,
        is_public: false,
      })
      .select("id")
      .single();

    if (deckErr) {
      console.error("[generate-from-collection] Deck insert error:", deckErr);
      return NextResponse.json({ ok: false, error: deckErr.message }, { status: 500 });
    }

    const deckId = deckRow.id as string;
    const rows = cards.map((c) => ({ deck_id: deckId, name: c.name, qty: c.qty }));
    const { error: dcErr } = await supabase.from("deck_cards").upsert(rows, { onConflict: "deck_id,name" });

    if (dcErr) {
      console.error("[generate-from-collection] deck_cards upsert error:", dcErr);
      // Deck exists; still return success
    }

    try {
      const { captureServer } = await import("@/lib/server/analytics");
      await captureServer("deck_generated_from_collection", {
        deck_id: deckId,
        user_id: user.id,
        collection_id: collectionId || null,
        commander: commanderName,
      });
    } catch {}

    return NextResponse.json({
      ok: true,
      deckId,
      url: `/my-decks/${deckId}`,
    });
  } catch (e: any) {
    console.error("[generate-from-collection]", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}

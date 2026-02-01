import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { composeSystemPrompt } from "@/lib/prompts/composeSystemPrompt";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * GET /api/admin/ai-test/composed-prompt?formatKey=commander&deckId=optional
 * Returns composed system prompt (BASE + FORMAT + MODULES) and modulesAttached for admin preview.
 * composeSystemPrompt uses service-role for prompt_layers when available.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await getServerSupabase();
    const { data: { user } } = await auth.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const formatKey = req.nextUrl.searchParams.get("formatKey")?.trim() || "commander";
    const deckId = req.nextUrl.searchParams.get("deckId")?.trim() || null;

    let deckContext: { deckCards: { name: string; count?: number }[]; commanderName?: string | null; colorIdentity?: string[] | null; deckId?: string } | null = null;
    if (deckId) {
      const { data: d } = await auth.from("decks").select("commander, format").eq("id", deckId).maybeSingle();
      const { data: allCards } = await auth.from("deck_cards").select("name, qty").eq("deck_id", deckId).limit(400);
      const entries = Array.isArray(allCards) && allCards.length > 0
        ? allCards.map((c: any) => ({ name: c.name, count: c.qty || 1 }))
        : [];
      deckContext = {
        deckCards: entries,
        commanderName: d?.commander ?? null,
        colorIdentity: null,
        deckId,
      };
    }

    const { composed, modulesAttached } = await composeSystemPrompt({
      formatKey,
      deckContext,
    });
    return NextResponse.json({ ok: true, composed, modulesAttached, formatKey });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

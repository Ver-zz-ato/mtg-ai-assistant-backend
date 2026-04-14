import { NextRequest, NextResponse } from "next/server";
import { parseDeckText } from "@/lib/deck/parseDeckText";

export async function POST(req: NextRequest) {
  try {
    // Auth precedence (match deck/analyze): cookie session first, else Bearer (mobile).
    const { getServerSupabase } = await import("@/lib/server-supabase");
    let supabase = await getServerSupabase();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const {
          data: { user: bearerUser },
        } = await bearerSupabase.auth.getUser(bearerToken);
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { preconId } = body;

    if (!preconId) {
      return NextResponse.json({ ok: false, error: "preconId is required" }, { status: 400 });
    }

    const { data: precon, error: preconError } = await supabase
      .from("precon_decks")
      .select("id, name, commander, colors, format, deck_text")
      .eq("id", preconId)
      .single();

    if (preconError || !precon) {
      return NextResponse.json(
        { ok: false, error: "Precon not found" },
        { status: 404 }
      );
    }

    const { data: newDeck, error: deckError } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: precon.name,
        format: precon.format || "Commander",
        deck_text: precon.deck_text,
        commander: precon.commander,
        colors: precon.colors || [],
        is_public: false,
      })
      .select()
      .single();

    if (deckError) {
      return NextResponse.json({ ok: false, error: deckError.message }, { status: 500 });
    }

    const parsed = parseDeckText(precon.deck_text || "");
    const cardRows = parsed.map((e) => ({
      deck_id: newDeck.id,
      name: e.name,
      qty: e.qty,
    }));

    if (cardRows.length > 0) {
      await supabase.from("deck_cards").insert(cardRows);
    }

    return NextResponse.json({
      ok: true,
      deck: { id: newDeck.id, title: newDeck.title, commander: newDeck.commander },
      message: `Successfully imported ${precon.name}!`,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

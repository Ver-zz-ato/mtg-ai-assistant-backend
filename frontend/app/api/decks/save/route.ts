import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const userRes = await supabase.auth.getUser();
  const user = userRes.data.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const { title, deckText, format, plan, colors, currency, is_public } = body;

    if (!deckText) {
      return NextResponse.json({ ok: false, error: "deckText is required" }, { status: 400 });
    }

    const row = {
      user_id: user.id,
      title: title || "Untitled deck",
      format: format || "Commander",
      plan: plan || null,
      colors: colors || [],
      currency: currency || "USD",
      is_public: !!is_public,
      deck_text: deckText, // satisfy legacy column
      data: {
        cards: deckText
          .split("\n")
          .map((line: string) => line.trim())
          .filter(Boolean),
      },
      meta: {
        deck_text: deckText,
        saved_at: new Date().toISOString(),
      },
      commander: body.commander || null,
    };

    const { data, error } = await supabase.from("decks").insert(row).select("id").single();

    if (error) throw error;

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}

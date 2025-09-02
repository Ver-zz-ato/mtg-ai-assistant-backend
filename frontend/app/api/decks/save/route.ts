// app/api/decks/save/route.ts
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr) {
      console.error("getUser error:", userErr);
      return new Response("Auth error", { status: 500 });
    }
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      title = "Untitled Deck",
      deckText = "",
      format = "Commander",
      plan = "Optimized",
      colors = [] as string[],
      currency = "USD",
      is_public = true,
    } = body ?? {};

    if (!deckText || typeof deckText !== "string" || deckText.trim().length < 5) {
      return new Response("Deck text too short", { status: 400 });
    }

    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: String(title).slice(0, 120),
        format,
        plan,
        colors,
        currency,
        deck_text: deckText,
        is_public: Boolean(is_public),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Insert deck error:", error);
      return new Response("Failed to save", { status: 500 });
    }

    return Response.json({ id: data.id });
  } catch (e) {
    console.error("save deck route error:", e);
    return new Response("Server error", { status: 500 });
  }
}

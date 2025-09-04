import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";


type SaveBody = {
  id?: string;
  title?: string;
  commander?: string;
  deck_text: string;
  is_public?: boolean;
};

function sanitizeTitle(s?: string) {
  if (!s) return "";
  return s.trim().slice(0, 140);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  try {
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (userErr || !user) {
      console.error("[DECKS/SAVE] 401 no user", userErr);
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as SaveBody;
    console.log("[DECKS/SAVE] incoming", body);

    if (!body?.deck_text || typeof body.deck_text !== "string") {
      return NextResponse.json({ ok: false, error: "deck_text is required" }, { status: 400 });
    }

    const payload = {
      title: sanitizeTitle(body.title) || "Untitled Deck",
      commander: sanitizeTitle(body.commander),
      deck_text: body.deck_text.trim(),
      is_public: !!body.is_public,
      user_id: user.id,
    };

    if (body.id) {
      const { data, error } = await supabase
        .from("decks")
        .update({
          title: payload.title,
          commander: payload.commander,
          deck_text: payload.deck_text,
          is_public: payload.is_public,
        })
        .eq("id", body.id)
        .eq("user_id", user.id)
        .select("id, updated_at")
        .single();

      if (error) {
        console.error("[DECKS/SAVE] update error", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
      }
      console.log("[DECKS/SAVE] updated", data);
      return NextResponse.json({ ok: true, id: data.id, mode: "updated" });
    }

    const { data, error } = await supabase
      .from("decks")
      .insert({
        title: payload.title,
        commander: payload.commander,
        deck_text: payload.deck_text,
        is_public: payload.is_public,
        user_id: user.id,
      })
      .select("id, created_at")
      .single();

    if (error) {
      console.error("[DECKS/SAVE] insert error", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
    }

    console.log("[DECKS/SAVE] created", data);
    return NextResponse.json({ ok: true, id: data.id, mode: "created" });
  } catch (e: any) {
    console.error("[DECKS/SAVE] exception", e);
    return NextResponse.json({ ok: false, error: e.message || "Unexpected error" }, { status: 200 });
    console.log("[DECKS/SAVE] start");
const { data: userRes, error: userErr } = await supabase.auth.getUser();
console.log("[DECKS/SAVE] got user", !!userRes?.user, userErr?.message);
const body = await req.json().catch(e => { console.error("[DECKS/SAVE] bad json", e); return null; });
console.log("[DECKS/SAVE] body", !!body);
// ... before update/insert:
console.log("[DECKS/SAVE] inserting...");

  }
}

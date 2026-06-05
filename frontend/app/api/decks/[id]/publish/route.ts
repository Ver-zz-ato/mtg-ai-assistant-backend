// app/api/decks/[id]/publish/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPublicDeckValidationError } from "@/lib/deck/publicDeckValidation";
import { getPublicVisibilityCooldown } from "@/lib/server/publicVisibilityCooldown";

type Params = { id: string };

async function getRequestUser(req: Request) {
  let supabase = await createClient();
  let { data: ures } = await supabase.auth.getUser();
  let user = ures?.user;

  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  return { supabase, user };
}

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("id, user_id, is_public, title, format, deck_text, deck_aim, public_toggled_at")
    .eq("id", id)
    .single();

  if (readErr || !deck) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }
  if (deck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (deck.is_public === true) {
    return NextResponse.json({ ok: true, is_public: true });
  }

  const cooldown = getPublicVisibilityCooldown((deck as { public_toggled_at?: string | null }).public_toggled_at);
  if (!cooldown.ok) {
    return NextResponse.json(
      { ok: false, error: cooldown.message, retryAfterSeconds: cooldown.retryAfterSeconds },
      { status: 429 },
    );
  }

  const publicError = getPublicDeckValidationError({
    title: deck.title,
    format: deck.format,
    deckText: deck.deck_text,
    deckAim: deck.deck_aim,
  });
  if (publicError) {
    return NextResponse.json({ ok: false, error: publicError }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("decks")
    .update({ is_public: true, public_toggled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  try {
    const { submitToIndexNow } = await import("@/lib/seo/indexnow");
    submitToIndexNow(`/decks/${id}`).catch(() => {});
  } catch {}
  return NextResponse.json({ ok: true, is_public: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<Params> }) {
  const { id } = await ctx.params;
  const { supabase, user } = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: deck, error: readErr } = await supabase
    .from("decks")
    .select("id, user_id, is_public")
    .eq("id", id)
    .single();

  if (readErr || !deck) {
    return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
  }
  if (deck.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  if (deck.is_public !== true) {
    return NextResponse.json({ ok: true, is_public: false });
  }

  const { error: upErr } = await supabase
    .from("decks")
    .update({ is_public: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, is_public: false });
}

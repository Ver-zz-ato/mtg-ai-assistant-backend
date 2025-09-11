import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  id: string;
  title?: string | null;
  deck_text?: string | null;
  is_public?: boolean | null;
};

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const b = (await req.json()) as Body | null;
    if (!b?.id) {
      return NextResponse.json({ error: "Missing deck id" }, { status: 400 });
    }

    // Build a partial update object
    const update: Record<string, unknown> = {};
    if (typeof b.title === "string") update.title = b.title.trim();
    if (typeof b.deck_text === "string") update.deck_text = b.deck_text;
    if (typeof b.is_public === "boolean") update.is_public = b.is_public;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // RLS protects to owner; filter by id (and optionally user_id for belt & braces)
    const { data, error } = await supabase
      .from("decks")
      .update(update)
      .eq("id", b.id)
      .eq("user_id", user.id)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ id: data.id }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


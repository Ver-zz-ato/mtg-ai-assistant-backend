// app/api/decks/[id]/format/route.ts
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const format = String(body?.format || "").toLowerCase().trim();

    // Validate format
    const validFormats = ["commander", "standard", "modern", "pioneer", "pauper"];
    if (!validFormats.includes(format)) {
      return NextResponse.json(
        { ok: false, error: "Invalid format. Must be commander, standard, modern, pioneer, or pauper" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Verify deck ownership
    const { data: deck } = await supabase
      .from("decks")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (!deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, error: "Not authorized" },
        { status: 403 }
      );
    }

    // Update format
    const { error } = await supabase
      .from("decks")
      .update({ format })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true, format });
  } catch (e: any) {
    console.error("Format update error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to update format" },
      { status: 500 }
    );
  }
}


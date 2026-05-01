import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Service role not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { name, commander, colors, format, deck_text, set_name, release_year, release_date } =
      body;

    if (!name || !commander || !deck_text || !set_name) {
      return NextResponse.json({
        ok: false,
        error: "Missing required: name, commander, deck_text, set_name",
      }, { status: 400 });
    }

    const colorsArr = Array.isArray(colors)
      ? colors
      : typeof colors === "string"
        ? colors.split(/[\s,]+/).filter(Boolean)
        : [];

    let ry: number | null =
      release_year === undefined || release_year === null || release_year === ""
        ? null
        : parseInt(String(release_year), 10);
    if (ry !== null && Number.isNaN(ry)) ry = null;

    const rd =
      release_date === undefined || release_date === null || release_date === ""
        ? null
        : String(release_date).trim().slice(0, 10);

    const { data, error } = await admin
      .from("precon_decks")
      .insert({
        name: String(name).trim(),
        commander: String(commander).trim(),
        colors: colorsArr.length ? colorsArr : ["C"],
        format: format?.trim() || "Commander",
        deck_text: String(deck_text).trim(),
        set_name: String(set_name).trim(),
        release_year: ry,
        release_date: rd,
      })
      .select("id, name, commander, set_name, release_year, release_date")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, precon: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Insert failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

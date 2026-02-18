import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client required" }, { status: 500 });
    }

    const url = new URL(req.url);
    const count = Math.min(50, Math.max(1, parseInt(url.searchParams.get("count") || "10", 10)));
    const seed = url.searchParams.get("seed") || String(Date.now());

    // Sample diverse public decks: different commanders, formats, colors
    const { data: decks, error } = await admin
      .from("decks")
      .select("id, title, commander, format, colors, deck_text, created_at")
      .or("is_public.eq.true,public.eq.true")
      .not("deck_text", "is", null)
      .order("updated_at", { ascending: false })
      .limit(count * 4); // Over-fetch for diversity

    if (error || !decks?.length) {
      return NextResponse.json({ ok: false, error: error?.message || "No public decks found" }, { status: 400 });
    }

    // Simple diversity: prefer different commanders, shuffle by seed
    const hash = (s: string) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return Math.abs(h);
    };
    const shuffled = [...decks].sort((a, b) => {
      const ha = hash(seed + (a.commander || a.id));
      const hb = hash(seed + (b.commander || b.id));
      return (ha % 1000) - (hb % 1000);
    });

    const seen = new Set<string>();
    const diverse: typeof decks = [];
    for (const d of shuffled) {
      const key = (d.commander || d.id) + (d.format || "");
      if (seen.has(key) && diverse.length >= count) continue;
      seen.add(key);
      diverse.push(d);
      if (diverse.length >= count) break;
    }
    const selected = diverse.slice(0, count);

    const baseUrl = req.url.split("/api/admin")[0];
    const samples = selected.map((d: any) => ({
      deck_id: d.id,
      commander: d.commander || null,
      format: d.format || "Commander",
      deck_text: d.deck_text,
      decklist_text: typeof d.deck_text === "string" ? d.deck_text : JSON.stringify(d.deck_text || {}),
      title: d.title,
      colors: d.colors || [],
      url: `${baseUrl}/decks/${d.id}`,
    }));

    return NextResponse.json({ ok: true, decks: samples });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

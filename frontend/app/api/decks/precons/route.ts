import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CachePresets } from "@/lib/api/cache";

export const revalidate = 300; // 5 min - precons change infrequently
export const dynamic = "force-dynamic";

type PreconDeckRow = {
  id: string;
  name: string;
  commander: string;
  format: string;
  colors: string[] | null;
  deck_text: string;
  set_name: string;
  release_year: number | null;
  release_date: string | null;
};

function countCards(deckText: string | null | undefined): number {
  if (!deckText) return 0;
  const lines = String(deckText).split(/\r?\n/).filter((l) => l.trim());
  let total = 0;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) {
      total += parseInt(m[1], 10) || 1;
    } else if (line.trim() && !line.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
      total += 1;
    }
  }
  return total;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!key) throw new Error("Supabase key is required");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const commander = searchParams.get("commander") || "";
    const set_name = searchParams.get("set") || "";
    const release_year = searchParams.get("year") || "";
    const colors = searchParams.get("colors") || "";
    const sort = searchParams.get("sort") || "recent"; // recent = newest first
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "24"), 100);
    const offset = (page - 1) * limit;

    let query = supabase
      .from("precon_decks")
      .select("id, name, commander, colors, format, deck_text, set_name, release_year, release_date", {
        count: "exact",
      });

    if (search) {
      query = query.or(`name.ilike.%${search}%,commander.ilike.%${search}%,deck_text.ilike.%${search}%`);
    }
    if (commander?.trim()) {
      query = query.ilike("commander", `%${commander.trim()}%`);
    }
    if (set_name) {
      query = query.ilike("set_name", `%${set_name}%`);
    }
    if (release_year) {
      const year = parseInt(release_year, 10);
      if (!isNaN(year)) query = query.eq("release_year", year);
    }
    if (colors && colors !== "all") {
      const colorArray = colors.split("");
      const colorFilters = colorArray.map((c) => `colors.cs.{${c}}`);
      query = query.or(colorFilters.join(","));
    }

    switch (sort) {
      case "set":
        query = query.order("set_name", { ascending: true }).order("name", { ascending: true });
        break;
      case "oldest":
        query = query
          .order("release_year", { ascending: true, nullsFirst: false })
          .order("release_date", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true });
        break;
      case "recent":
      default:
        query = query
          .order("release_year", { ascending: false, nullsFirst: false })
          .order("release_date", { ascending: false, nullsFirst: false })
          .order("name", { ascending: true });
        break;
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const decks = ((data || []) as PreconDeckRow[]).map((d) => ({
      id: d.id,
      title: d.name,
      commander: d.commander,
      format: d.format,
      colors: d.colors,
      set_name: d.set_name,
      release_year: d.release_year,
      release_date: d.release_date,
      card_count: countCards(d.deck_text),
      deck_text: d.deck_text,
      owner_username: null,
      is_precon: true,
    }));

    const hasMore = (data?.length || 0) === limit;

    return NextResponse.json(
      { ok: true, decks, total: count || 0, page, limit, hasMore },
      { headers: CachePresets.MEDIUM }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

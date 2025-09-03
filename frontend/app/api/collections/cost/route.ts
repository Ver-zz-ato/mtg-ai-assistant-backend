// app/api/collections/cost/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Missing = { name: string; need: number };

function parseDeckText(deck_text: string): Record<string, number> {
  // Supports:
  // "3 Sol Ring", "Sol Ring x3", "Sol Ring", "1x Sol Ring"
  const need: Record<string, number> = {};
  const lines = (deck_text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // strip comments like "# ..." or "// ..."
    const clean = line.replace(/\s*(#|\/\/).*/g, "").trim();
    if (!clean) continue;

    // Try patterns
    // 1) "3 Sol Ring"
    let m = clean.match(/^(\d+)\s+(.+)$/);
    if (m) {
      const qty = Math.max(1, parseInt(m[1], 10));
      const name = m[2].trim();
      if (name) need[name] = (need[name] || 0) + qty;
      continue;
    }

    // 2) "Sol Ring x3" or "Sol Ring 3x"
    m = clean.match(/^(.+?)\s+x?(\d+)$/i);
    if (m) {
      const name = m[1].trim();
      const qty = Math.max(1, parseInt(m[2], 10));
      if (name) need[name] = (need[name] || 0) + qty;
      continue;
    }

    // 3) naked name => assume 1
    need[clean] = (need[clean] || 0) + 1;
  }
  return need;
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { collection_id, deck_text } = await req.json().catch(() => ({}));
    if (!collection_id || !deck_text) {
      return NextResponse.json({ error: "Missing 'collection_id' or 'deck_text'" }, { status: 400 });
    }

    // Ownership check (nice error + RLS backup)
    const { data: col, error: colErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collection_id)
      .single();
    if (colErr || !col) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    // Load owned cards
    const { data: ownedRows, error: rowsErr } = await supabase
      .from("collection_cards")
      .select("name, qty")
      .eq("collection_id", collection_id);
    if (rowsErr) {
      return NextResponse.json({ error: rowsErr.message }, { status: 400 });
    }
    const ownedMap: Record<string, number> = {};
    (ownedRows || []).forEach((r) => {
      const key = (r.name || "").trim();
      if (!key) return;
      ownedMap[key] = (ownedMap[key] || 0) + (r.qty ?? 0);
    });

    // Parse deck
    const needMap = parseDeckText(deck_text);

    // Compute missing
    const missing: Missing[] = [];
    for (const [name, need] of Object.entries(needMap)) {
      const have = ownedMap[name] || 0;
      const deficit = need - have;
      if (deficit > 0) missing.push({ name, need: deficit });
    }

    // Return missing list; frontend will price via /api/price
    return NextResponse.json({ ok: true, missing }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}

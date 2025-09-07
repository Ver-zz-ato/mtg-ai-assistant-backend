export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function time<F extends (...a: any[]) => Promise<any>>(fn: F): Promise<{ ok: boolean; ms: number; error?: string; extra?: any }> {
  const t0 = Date.now();
  try {
    const extra = await fn();
    return { ok: true, ms: Date.now() - t0, extra };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key);

  const supabaseCheck = await time(async () => {
    // cheap, RLS-friendly head count on public decks
    const { error } = await sb.from("decks").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return null;
  });

  const scryfallCheck = await time(async () => {
    const r = await fetch("https://api.scryfall.com/cards/named?exact=Sol%20Ring", { cache: "no-store" });
    if (!r.ok) throw new Error(`Scryfall HTTP ${r.status}`);
    return null;
  });

  const ok = supabaseCheck.ok && scryfallCheck.ok;
  return NextResponse.json({
    ok,
    supabase: supabaseCheck,
    scryfall: scryfallCheck,
    ts: new Date().toISOString(),
  }, { status: ok ? 200 : 503 });
}

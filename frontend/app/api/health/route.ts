export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withMetrics } from "@/lib/observability/withMetrics";

async function time<F extends (...a: any[]) => Promise<any>>(fn: F): Promise<{ ok: boolean; ms: number; error?: string; extra?: any }> {
  const t0 = Date.now();
  try {
    const extra = await fn();
    return { ok: true, ms: Date.now() - t0, extra };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

async function getHandler() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const sb = createClient(url, key);

  // Database check (Supabase)
  const supabaseCheck = await time(async () => {
    // cheap, RLS-friendly head count on public decks
    const { error } = await sb.from("decks").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return null;
  });

  // Scryfall API check
  const scryfallCheck = await time(async () => {
    const r = await fetch("https://api.scryfall.com/cards/named?exact=Sol%20Ring", { cache: "no-store" });
    if (!r.ok) throw new Error(`Scryfall HTTP ${r.status}`);
    return null;
  });

  // Stripe API check (lightweight - just verify API key is valid)
  const stripeCheck = await time(async () => {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    // Lightweight check - just verify we can create a client
    // Don't make actual API call to avoid rate limits
    return { configured: true };
  });

  // OpenAI API check (lightweight - just verify API key is configured)
  const openaiCheck = await time(async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    // Don't make actual API call to avoid costs/rate limits
    return { configured: true };
  });

  const checks = {
    database: supabaseCheck,
    scryfall: scryfallCheck,
    stripe: stripeCheck,
    openai: openaiCheck,
  };

  // All critical checks must pass (database and scryfall are critical)
  const criticalOk = supabaseCheck.ok && scryfallCheck.ok;

  return NextResponse.json({
    ok: criticalOk,
    checks,
    ts: new Date().toISOString(),
  }, { status: criticalOk ? 200 : 503 });
}

export const GET = withMetrics(getHandler);

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withMetrics } from "@/lib/observability/withMetrics";
import { requireAdminForApi } from "@/lib/server-admin";

async function time<F extends (...a: any[]) => Promise<any>>(fn: F): Promise<{ ok: boolean; ms: number; error?: string; extra?: any }> {
  const t0 = Date.now();
  try {
    const extra = await fn();
    return { ok: true, ms: Date.now() - t0, extra };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: e?.message || String(e) };
  }
}

async function runDependencyChecks() {
  const supabaseCheck = await time(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase public env not configured");
    const sb = createClient(url, key);
    const { error } = await sb.from("decks").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return null;
  });

  const scryfallCheck = await time(async () => {
    const r = await fetch("https://api.scryfall.com/cards/named?exact=Sol%20Ring", {
      cache: "no-store",
      headers: {
        "User-Agent": "ManaTap health check",
        Accept: "application/json",
      },
    });
    if (!r.ok) throw new Error(`Scryfall HTTP ${r.status}`);
    return null;
  });

  const stripeCheck = await time(async () => {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    return { configured: true };
  });

  const openaiCheck = await time(async () => {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    return { configured: true };
  });

  const checks = {
    database: supabaseCheck,
    scryfall: scryfallCheck,
    stripe: stripeCheck,
    openai: openaiCheck,
  };

  const dependencyOk = supabaseCheck.ok && scryfallCheck.ok;
  return { checks, dependencyOk };
}

async function getHandler(req: NextRequest) {
  const { checks, dependencyOk } = await runDependencyChecks();
  const status = dependencyOk ? "alive" : "degraded";

  const admin = await requireAdminForApi();
  if (!admin.ok) {
    return NextResponse.json({ ok: true, status }, { status: 200 });
  }

  return NextResponse.json({
    ok: true,
    status,
    dependencyOk,
    checks,
    ts: new Date().toISOString(),
  }, { status: 200 });
}

export const GET = withMetrics(getHandler);

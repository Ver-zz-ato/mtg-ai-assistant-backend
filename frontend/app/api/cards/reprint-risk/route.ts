import { NextRequest, NextResponse } from "next/server";
import { prepareOpenAIBody } from "@/lib/ai/openai-params";
import { getModelForTier } from "@/lib/ai/model-by-tier";
import { createClient } from "@/lib/server-supabase";
import { checkDurableRateLimit } from "@/lib/api/durable-rate-limit";
import { checkProStatus } from "@/lib/server-pro-check";
import { hashString } from "@/lib/guest-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Simple helper to fetch number of prints for a card from Scryfall
async function scryfallPrints(name: string): Promise<number> {
  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
    if (!r.ok) return 0;
    const j: any = await r.json();
    const uri = j?.prints_search_uri;
    if (!uri) return 0;
    const pr = await fetch(uri);
    if (!pr.ok) return 0;
    const pj: any = await pr.json();
    return Number(pj?.total_cards || 0) || 0;
  } catch {
    return 0;
  }
}

function heuristicRiskFromPrints(prints: number): "low" | "medium" | "high" {
  if (prints >= 9) return "low";
  if (prints >= 5) return "medium";
  return "high";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cards = Array.isArray(body?.cards) ? body.cards as Array<{ name: string; set?: string }> : [];
    const uniq = Array.from(new Set(cards.map(c => (c?.name || "").trim()).filter(Boolean)));

    // Rate limiting: Free users 10/day, Pro users 100/day
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const isPro = await checkProStatus(user.id);
      const dailyLimit = isPro ? 100 : 10;
      const userKeyHash = `user:${await hashString(user.id)}`;
      const rateLimit = await checkDurableRateLimit(supabase, userKeyHash, '/api/cards/reprint-risk', dailyLimit, 1);
      
      if (!rateLimit.allowed) {
        return NextResponse.json({ 
          ok: false,
          code: 'RATE_LIMIT_DAILY',
          error: `You've reached your daily limit of ${dailyLimit} reprint risk checks. ${isPro ? 'Contact support if you need higher limits.' : 'Upgrade to Pro for 100 checks/day!'}`,
          resetAt: rateLimit.resetAt
        }, { status: 429 });
      }
    }

    const isPro = user ? await checkProStatus(user.id) : false;
    const tierRes = getModelForTier({ isGuest: !user, userId: user?.id ?? null, isPro });
    let aiMap: Record<string, { risk: "low"|"medium"|"high"; reason: string }> = {};

    if (uniq.length > 0) {
      try {
        const { callLLM } = await import('@/lib/ai/unified-llm-client');
        
        const system = "You are an MTG finance assistant. Rate the reprint risk for the next 90 days for each card as 'low', 'medium', or 'high'. Consider recent reprints, set cycles, and Commander precon patterns. Respond ONLY JSON: [{\"name\":\"Card Name\",\"risk\":\"low|medium|high\",\"reason\":\"<=90 chars\"}]";
        const userPrompt = `Cards:\n${uniq.map(n => `- ${n}`).join("\n")}`;
        
        const response = await callLLM(
          [
            { role: "system", content: [{ type: "input_text", text: system }] },
            { role: "user", content: [{ type: "input_text", text: userPrompt }] },
          ],
          {
            route: '/api/cards/reprint-risk',
            feature: 'reprint_risk',
            model: tierRes.model,
            fallbackModel: tierRes.fallbackModel,
            timeout: 300000,
            maxTokens: 600,
            apiType: 'responses',
            userId: user?.id || null,
            isPro,
          }
        );

        const text = response.text.trim();
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr)) {
            for (const it of arr) {
              const name = String(it?.name || "").trim();
              const risk = String(it?.risk || "").toLowerCase();
              const reason = String(it?.reason || "").slice(0, 120);
              if (name && (risk === "low" || risk === "medium" || risk === "high")) {
                aiMap[name.toLowerCase()] = { risk, reason } as any;
              }
            }
          }
        } catch {}
      } catch (e) {
        // Fail silently - will use heuristic fallback
        console.warn('[reprint-risk] AI call failed, using heuristics:', e);
      }
    }

    // Fill gaps with heuristics
    const out: Record<string, { risk: "low"|"medium"|"high"; reason?: string }> = {};
    for (const name of uniq) {
      const key = name.toLowerCase();
      if (aiMap[key]) { out[name] = aiMap[key]; continue; }
      const prints = await scryfallPrints(name);
      const risk = heuristicRiskFromPrints(prints);
      out[name] = { risk, reason: prints ? `~${prints} prints` : undefined };
    }

    return NextResponse.json({ ok: true, risks: out });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "reprint risk failed" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const cards = Array.isArray(body?.cards) ? body.cards as Array<{ name: string; set?: string }> : [];
    const uniq = Array.from(new Set(cards.map(c => (c?.name || "").trim()).filter(Boolean)));

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-5";
    let aiMap: Record<string, { risk: "low"|"medium"|"high"; reason: string }> = {};

    if (apiKey && uniq.length > 0) {
      const system = "You are an MTG finance assistant. Rate the reprint risk for the next 90 days for each card as 'low', 'medium', or 'high'. Consider recent reprints, set cycles, and Commander precon patterns. Respond ONLY JSON: [{\"name\":\"Card Name\",\"risk\":\"low|medium|high\",\"reason\":\"<=90 chars\"}]";
      const user = `Cards:\n${uniq.map(n => `- ${n}`).join("\n")}`;
      const payload = {
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] },
        ],
        max_output_tokens: 600,
      } as any;
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      }).catch(() => null as any);
      if (r && r.ok) {
        const j: any = await r.json().catch(() => ({}));
        const text = (j?.output_text || "").trim();
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
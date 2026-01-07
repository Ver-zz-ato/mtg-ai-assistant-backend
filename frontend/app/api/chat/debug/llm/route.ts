import { NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  if (!apiKey) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: "no_api_key", model }, { status: 200 });
  }
  try {
    const body: any = {
      model,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 32,
    };
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Try fallback model if configured
      const fb = (process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini").trim();
      if (fb && fb !== model) {
        const r2 = await fetch(OPENAI_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ ...body, model: fb }),
        });
        if (r2.ok) return NextResponse.json({ ok: true, provider: "openai", model: fb, sample: "pong" }, { status: 200 });
        const j2 = await r2.json().catch(()=>({}));
        return NextResponse.json({ ok: true, provider: "fallback", reason: j2?.error?.message || `status_${r2.status}`, model }, { status: 200 });
      }
      const j = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: true, provider: "fallback", reason: j?.error?.message || `status_${res.status}`, model }, { status: 200 });
    }
    return NextResponse.json({ ok: true, provider: "openai", model, sample: "pong" }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: e?.message || "exception", model }, { status: 200 });
  }
}

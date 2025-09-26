import { NextResponse } from "next/server";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5";
  if (!apiKey) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: "no_api_key", model }, { status: 200 });
  }
  try {
    const body: any = {
      model,
      input: [{ role: "user", content: [{ type: "input_text", text: "ping" }]}],
      max_output_tokens: 4,
      temperature: 1,
    };
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: true, provider: "fallback", reason: j?.error?.message || `status_${res.status}`, model }, { status: 200 });
    }
    return NextResponse.json({ ok: true, provider: "openai", model, sample: "pong" }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: true, provider: "fallback", reason: e?.message || "exception", model }, { status: 200 });
  }
}

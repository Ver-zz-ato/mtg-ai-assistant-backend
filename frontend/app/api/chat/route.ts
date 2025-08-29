// frontend/app/api/chat/route.ts
// Server proxy to OpenAI with simple request logging.

export async function POST(req: Request) {
  const started = Date.now();
  console.log("[api/chat] POST start");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[api/chat] 500 Missing OPENAI_API_KEY");
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o";

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
  type Body = {
    messages?: ChatMsg[];
    system?: string;
    temperature?: number;
    max_tokens?: number;
  };

  const body = (await req.json().catch(() => ({}))) as Body;

  const systemDefault =
    body.system ??
    "You are MTG Coach. Be concise. For rules, cite CR sections (e.g., CR 702.49a). " +
      "For deck help, explain why and give 2–3 concrete, budget-aware swaps.";

  const messages: ChatMsg[] = [
    { role: "system", content: systemDefault },
    ...(body.messages ?? []),
  ];

  const payload = {
    model,
    messages,
    temperature: body.temperature ?? 0.3,
    max_tokens: body.max_tokens ?? 600,
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json().catch(() => ({}));
  const ms = Date.now() - started;

  if (!r.ok) {
    console.error(`[api/chat] ${r.status} in ${ms}ms`, data?.error ?? data);
    const msg =
      data?.error?.message || `Upstream error from OpenAI (status ${r.status}).`;
    return new Response(JSON.stringify({ error: msg, status: r.status }), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[api/chat] 200 in ${ms}ms (model=${model})`);
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

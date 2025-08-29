// frontend/app/api/chat/route.ts
export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use a widely-available default; you can override via env
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
  if (!r.ok) {
    const msg =
      data?.error?.message ||
      `Upstream error from OpenAI (status ${r.status}).`;
    return new Response(
      JSON.stringify({ error: msg, status: r.status, details: data }),
      { status: r.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const text = data?.choices?.[0]?.message?.content ?? "";
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

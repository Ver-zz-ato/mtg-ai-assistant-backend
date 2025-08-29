// frontend/app/api/chat/route.ts
// Simple server proxy to OpenAI's chat API (no client library required)

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OPENAI_API_KEY on the server." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // optional: override model via env; default is cheap/fast 4o-mini
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
  type Body = {
    messages?: ChatMsg[];
    system?: string;
    temperature?: number;
    max_tokens?: number;
  };

  const body = (await req.json().catch(() => ({}))) as Body;

  // default system prompt geared for MTG
  const systemDefault =
    body.system ??
    "You are MTG Coach. Be concise, cite Comprehensive Rules by number (e.g., CR 702.49a) when answering rules. " +
      "For deck help, explain WHY, list 2–3 concrete swaps, and prefer budget-friendly options when asked.";

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

  const data = await r.json();
  if (!r.ok) {
    // Bubble up API errors to the client
    return new Response(JSON.stringify(data), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text =
    data?.choices?.[0]?.message?.content ??
    "";

  return new Response(JSON.stringify({ text, raw: data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

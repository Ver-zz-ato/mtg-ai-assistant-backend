// lib/ai/openai-client.ts
// Shared OpenAI API client

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  opts: { maxTokens?: number } = {}
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const { maxTokens = 400 } = opts;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      max_output_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  const body = await response.json().catch(() => ({}));
  return String(body?.output_text ?? "").trim();
}


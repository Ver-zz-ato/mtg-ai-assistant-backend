import { broadcast, pushHistory } from "../stream/route";

type Body = { text?: string; user?: string };

export async function POST(req: Request) {
  const { text = "", user = "Anon" } = (await req.json().catch(() => ({}))) as Body;

  const cleanText = String(text).trim().slice(0, 280);
  const cleanUser = String(user).trim().slice(0, 24) || "Anon";

  if (!cleanText) {
    return Response.json({ ok: false, error: "Empty message" }, { status: 400 });
  }

  const msg = { id: Date.now(), user: cleanUser, text: cleanText, ts: Date.now() };
  pushHistory(msg);
  broadcast(msg);

  return Response.json({ ok: true });
}

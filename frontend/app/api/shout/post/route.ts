import { containsProfanity } from "@/lib/profanity";
import { broadcast, pushHistory, type Shout } from "../hub";

type Body = { text?: string; user?: string };

const lastByUser = new Map<string, number>();
let __lastId = 0;
function nextIdNum(): number {
  const now = Date.now();
  if (now <= __lastId) __lastId += 1; else __lastId = now;
  return __lastId;
}

export async function POST(req: Request) {
  const { text = "", user = "Anon" } = (await req.json().catch(() => ({}))) as Body;

  const cleanText = String(text).trim().slice(0, 280);
  const cleanUser = String(user).trim().slice(0, 24) || "Anon";

  if (!cleanText) return Response.json({ ok: false, error: "Empty message" }, { status: 400 });
  if (containsProfanity(cleanText)) return Response.json({ ok:false, error: "Please keep it civil." }, { status: 400 });

  const last = lastByUser.get(cleanUser) ?? 0;
  if (Date.now() - last < 5000) {
    return Response.json({ ok:false, error: "Please wait a moment before posting again." }, { status: 429 });
  }
  lastByUser.set(cleanUser, Date.now());

  const msg: Shout = { id: nextIdNum(), user: cleanUser, text: cleanText, ts: Date.now() };
  pushHistory(msg);
  broadcast(msg);
  return Response.json({ ok: true });
}

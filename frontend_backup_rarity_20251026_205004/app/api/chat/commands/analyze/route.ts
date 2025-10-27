/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  threadId: z.string().uuid(),
  deckText: z.string().min(10, "deck text required"),
});

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function getSupabase() {
  const cookieStore = await cookies();
  const supabase = createServerClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set() {}, remove() {},
    },
  });
  return { supabase };
}

function parseDeck(text: string) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const main: { qty: number, name: string }[] = [];
  const sb: { qty: number, name: string }[] = [];
  let inSide = false;
  for (const l of lines) {
    if (/^sideboard\b/i.test(l) || /^sb[:\-\s]/i.test(l)) { inSide = true; continue; }
    const m = l.match(/^(\d+)\s*x?\s+(.+)$/i) || l.match(/^\*\s*(.+)$/) || l.match(/^\-\s*(.+)$/) || l.match(/^\[\[(.+)\]\]$/);
    if (m) {
      const qty = /^\d+/.test(m[0]) ? parseInt(m[1],10) : 1;
      const name = (m[2] || m[1]).replace(/\s+/g, " ").trim();
      (inSide ? sb : main).push({ qty, name });
    }
  }
  return { main, side: sb };
}
function snapshot(text: string) {
  const { main, side } = parseDeck(text);
  const total = main.reduce((a,b)=>a+b.qty,0);
  const basics = main.filter(c => /\b(Forest|Island|Swamp|Mountain|Plains)\b/i.test(c.name)).reduce((a,b)=>a+b.qty,0);
  const spells = total - basics;
  const lines = [
    `**Deck Snapshot**`,
    ``,
    `Mainboard: **${total}** · Lands: **${basics}** · Spells: **${spells}**`,
    side.length ? `Sideboard: **${side.reduce((a,b)=>a+b.qty,0)}**` : ``,
    `\nPaste format + budget for upgrade suggestions.`,
  ].filter(Boolean);
  return lines.join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(()=>({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues?.[0];
      return NextResponse.json({ ok: false, error: { message: first?.message || "bad request", code: "bad_request" } }, { status: 400 });
    }
    const { threadId, deckText } = parsed.data;
    const { supabase } = await getSupabase();
    const text = snapshot(deckText);
    await supabase.from("chat_messages").insert({ thread_id: threadId, role: "assistant", content: text });
    return NextResponse.json({ ok: true, text });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: { message: e?.message || "server error", code: "server_error" } }, { status: 500 });
  }
}

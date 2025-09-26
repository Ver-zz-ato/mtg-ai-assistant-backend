// app/api/chat/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "../../_lib/supabase";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

function normalizeBody(raw: any) {
  const messageInput = raw?.message ?? {};
  const content = messageInput.content ?? raw?.content ?? raw?.text ?? raw?.prompt ?? raw?.input;
  const role = messageInput.role ?? raw?.role ?? "user";
  // Coerce null → undefined so Zod optional() is satisfied
  const rawThreadId = raw?.threadId;
  const threadId = (rawThreadId === null || rawThreadId === "null") ? undefined : rawThreadId;
  const deckId = raw?.deckId ?? undefined;
  return { threadId, deckId, message: { role, content } };
}

const MessageSchema = z.object({
  role: z.enum(["user","assistant","system"]).default("user"),
  content: z.string().min(1, "message.content is required"),
});

const NormalizedSchema = z.object({
  threadId: z.string().uuid().optional(),
  deckId: z.string().uuid().optional(),
  message: MessageSchema,
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(()=> ({}));
    const body = normalizeBody(raw);

    if (!body.message.content || String(body.message.content).trim().length === 0) {
      body.message.content = "[[blank message]]";
    }

    const parsed = NormalizedSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      return NextResponse.json<Envelope<never>>({ ok: false, error: `Invalid body: ${msg}. Raw=${JSON.stringify(raw)}` }, { status: 400 });
    }

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json<Envelope<never>>({ ok: false, error: "Unauthenticated" }, { status: 401 });

    const { threadId, message, deckId } = parsed.data;
    let tid = threadId as string | undefined;

    if (!tid) {
      const ins = await supabase.from("chat_threads").insert({ user_id: user.id, deck_id: deckId ?? null, title: "New thread" }).select("id").single();
      if (ins.error) return NextResponse.json<Envelope<never>>({ ok: false, error: `Failed to create thread: ${ins.error.message}` }, { status: 500 });
      tid = (ins.data as any).id as string;
    } else {
      const chk = await supabase.from("chat_threads").select("id,user_id").eq("id", tid).single();
      if (chk.error || !chk.data || (chk.data as any).user_id !== user.id) {
        return NextResponse.json<Envelope<never>>({ ok: false, error: "Thread not found" }, { status: 404 });
      }
    }

    const insMsg = await supabase.from("chat_messages").insert({ thread_id: tid, role: message.role, content: message.content });
    if (insMsg.error) return NextResponse.json<Envelope<never>>({ ok: false, error: `Failed to insert message: ${insMsg.error.message}` }, { status: 500 });

    const res = NextResponse.json<Envelope<{ threadId: string }>>({ ok: true, data: { threadId: tid! } });
    res.headers.set("X-Debug-Payload", JSON.stringify(body).slice(0, 2000));
    if (message.content === "[[blank message]]") res.headers.set("X-Debug-Warn", "Server inserted placeholder because client sent no content");
    return res;
  } catch (e:any) {
    return NextResponse.json<Envelope<never>>({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

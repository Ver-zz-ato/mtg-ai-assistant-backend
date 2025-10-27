import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { POST as chatPOST } from "@/app/api/chat/route";

function codeAndHint(status: number) {
  if (status === 401) return { code: "AUTH_MISSING", hint: "Please sign in again." };
  if (status === 400) return { code: "BAD_REQUEST", hint: "Check the request body and try again." };
  if (status === 404) return { code: "NOT_FOUND", hint: "The endpoint or resource was not found." };
  if (status === 429) return { code: "RATE_LIMITED", hint: "Too many requests. Try again in a moment." };
  if (status >= 500) return { code: "INTERNAL", hint: "Server error. Please try again shortly." };
  return { code: "ERROR", hint: "Request failed." };
}

function parseTolerantBody(raw: string, contentType: string | null): { text: string; threadId?: string | null; stream?: boolean; prefs?: any, context?: any; guestMessageCount?: number } {
  const ct = (contentType || "").toLowerCase();
  const out: any = {};

  const take = (v: any) => typeof v === "string" ? v : "";

  // application/json
  if (ct.includes("application/json")) {
    try {
      const j = JSON.parse(raw || "null");
      if (typeof j === "string") return { text: j };
      if (j && typeof j === "object") {
        const text = take(j.text ?? j.prompt ?? j.content ?? j?.message?.content);
        const threadId = j.threadId ?? null;
        const stream = j.stream ?? false;
        const prefs = j.prefs;
        const context = j.context;
        const guestMessageCount = typeof j.guestMessageCount === 'number' ? j.guestMessageCount : undefined;
        return { text, threadId, stream, prefs, context, guestMessageCount };
      }
    } catch {}
  }

  // application/x-www-form-urlencoded
  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(raw || "");
      const text = take(params.get("text") ?? params.get("prompt") ?? params.get("content"));
      const threadId = params.get("threadId");
      return { text, threadId } as any;
    } catch {}
  }

  // text/plain or fallback
  const text = typeof raw === "string" ? raw : "";
  return { text };
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

  // Preserve Supabase session to /api/chat
  const cookieHeader = req.headers.get("cookie") ?? "";

  // Read body once
  const raw = await req.text();
  const contentType = req.headers.get("content-type");
  const parsed = parseTolerantBody(raw, contentType);

  // If no threadId provided, try cookie
  const jar: any = await cookies();
  const cookieTid = jar.get?.("mtg_last_thread_id")?.value ?? null;
  const forwardPayload = {
    text: parsed.text ?? "",
    // Honor explicit new thread when no threadId provided: no cookie fallback
    threadId: parsed.threadId ?? null,
    stream: parsed.stream ?? false,
    ...(parsed.prefs ? { prefs: parsed.prefs } : {}),
    ...(parsed.context ? { context: parsed.context } : {}),
    ...(typeof parsed.guestMessageCount === 'number' ? { guestMessageCount: parsed.guestMessageCount } : {}),
  };

  // Avoid network fetch to self to prevent TLS/proxy issues on some hosts: call the handler directly
  const internalReq = new NextRequest(new URL("/api/chat", req.url), {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader } as any,
    body: JSON.stringify(forwardPayload),
  } as any);
  const internalRes = await chatPOST(internalReq);

  const status = internalRes.status;
  const txt = await internalRes.text();

  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const ms = Math.round((t1 as number) - (t0 as number));

  // Error pass-through with augmented hints
  if (status < 200 || status >= 300) {
    try {
      const body = JSON.parse(txt || "{}");
      if (body && body.ok === false && body.error && typeof body.error.message === "string") {
        const { code, hint } = codeAndHint(status);
        body.error.code = body.error.code || code;
        body.error.hint = body.error.hint || hint;
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    } catch {}
    return new Response(txt, { status, headers: { "content-type": "application/json" } });
  }

  // Success: normalize to wide payload and set cookie/header
  let body: any = {};
  try { body = JSON.parse(txt || "{}"); } catch {}
  const used = body?.threadId ?? forwardPayload.threadId ?? cookieTid ?? null;

  // Set cookie for future requests
  const setCookie = used ? `mtg_last_thread_id=${used}; Path=/; Max-Age=${30*24*60*60}; SameSite=Lax` : undefined;

  const payload = {
    ok: true,
    id: used,
    threadId: used,
    thread_id: used,
    text: body?.text ?? "",
    message: { role: "assistant", content: body?.text ?? "" },
    messages: [
      { thread_id: used, role: "user", content: forwardPayload.text },
      { thread_id: used, role: "assistant", content: body?.text ?? "" },
    ],
    ms,
  };

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "X-Thread-Used": used ?? "",
      ...(setCookie ? { "Set-Cookie": setCookie } : {}),
    },
  });
}

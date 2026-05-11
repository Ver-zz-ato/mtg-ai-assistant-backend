import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isMissingMetadataColumnError } from "@/lib/chat/orchestrator";

const Query = z.object({
  threadId: z.string().uuid(),
});

export async function GET(req: Request) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let status = 200;
  let userId: string | null = null;
  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = Query.safeParse(params);
    if (!parsed.success) {
      status = 400;
      return NextResponse.json({ ok: false, error: { message: "Invalid request: missing or invalid threadId" } }, { status });
    }
    const { threadId } = parsed.data;

    const cookieStore: any = await cookies();
    let supabase: any = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get?.(name)?.value,
          set: (name: string, value: string, options: any) => { try { cookieStore.set?.({ name, value, ...options }); } catch {} },
          remove: (name: string, options: any) => { try { cookieStore.set?.({ name, value: "", ...options, maxAge: 0 }); } catch {} },
        },
      }
    );

    let { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const bearer = await bearerSupabase.auth.getUser();
        if (bearer.data.user) {
          supabase = bearerSupabase;
          user = bearer.data.user;
          userErr = null;
        }
      }
    }
    if (userErr || !user) {
      status = 401;
      return NextResponse.json({ ok: false, error: { message: userErr?.message || "Unauthorized" } }, { status });
    }
    userId = user.id;

    const { data: thread, error: thErr } = await supabase
      .from("chat_threads")
      .select("id, user_id")
      .eq("id", threadId)
      .single();

    if (thErr || !thread) {
      status = 404;
      return NextResponse.json({ ok: false, error: { message: "Thread not found" } }, { status });
    }
    if (thread.user_id !== user.id) {
      status = 403;
      return NextResponse.json({ ok: false, error: { message: "Forbidden" } }, { status });
    }

    let { data: messages, error: msgErr } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (msgErr && isMissingMetadataColumnError(msgErr)) {
      const fallback = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      messages = (fallback.data ?? []).map((m: any) => ({ ...m, metadata: null }));
      msgErr = fallback.error;
    }

    if (msgErr) {
      status = 500;
      return NextResponse.json({ ok: false, error: { message: msgErr.message } }, { status });
    }
    return NextResponse.json({ ok: true, data: messages ?? [] }, { status });
  } catch (e: any) {
    status = 500;
    return NextResponse.json({ ok: false, error: { message: e?.message || "Internal error" } }, { status });
  } finally {
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const ms = Math.round((t1 as number) - (t0 as number));
    console.log(JSON.stringify({ method: "GET", path: "/api/chat/messages/list", status, ms, userId }));
  }
}

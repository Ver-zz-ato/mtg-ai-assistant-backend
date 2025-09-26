import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: Request) {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let status = 200;

  try {
    const url = new URL(req.url);
    const deckId = url.searchParams.get("deckId");

    const cookieStore: any = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get?.(name)?.value,
          set: (name: string, value: string, options: any) => {
            try { cookieStore.set?.({ name, value, ...options }); } catch {}
          },
          remove: (name: string, options: any) => {
            try { cookieStore.set?.({ name, value: "", ...options, maxAge: 0 }); } catch {}
          },
        },
      }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      status = 401;
      return NextResponse.json({ ok: false, error: { message: userErr.message } }, { status });
    }
    if (!user) {
      status = 401;
      return NextResponse.json({ ok: false, error: { message: "Not authenticated" } }, { status });
    }

    let q = supabase
      .from("chat_threads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (deckId) q = q.eq("deck_id", deckId);

    const { data, error } = await q;

    if (error) {
      status = 500;
      return NextResponse.json({ ok: false, error: { message: error.message } }, { status });
    }

    // Return both 'data' (per contract) and 'threads' (back-compat)
    return NextResponse.json({ ok: true, data: data ?? [], threads: data ?? [] }, { status });
  } finally {
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const ms = Math.round((t1 as number) - (t0 as number));
    console.log(JSON.stringify({
      tag: "chat_api_timing",
      route: "/api/chat/threads/list",
      method: "GET",
      ms
    }));
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { withTiming } from "@/lib/server/log";

const Body = z.object({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1, "Title cannot be empty"),
});

export async function POST(req: Request) {
  return withTiming("/api/chat/threads/rename", "POST", null, async () => {
    try {
      const supabase = await getServerSupabase();
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (!user || userErr) {
        return NextResponse.json(err("Unauthorized"), { status: 401 });
      }

      const json = await req.json().catch(() => ({}));
      const parsed = Body.safeParse(json);
      if (!parsed.success) {
        const message = parsed.error.issues?.[0]?.message ?? "Invalid request";
        return NextResponse.json(err(message, "BAD_INPUT", "Provide a non-empty title and valid threadId"), { status: 400 });
      }

      const { threadId, title } = parsed.data;
      const { error } = await supabase.from("chat_threads").update({ title }).eq("id", threadId).eq("user_id", user.id);
      if (error) return NextResponse.json(err("Failed to rename thread", "DB_ERROR", error.message), { status: 500 });

      try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("thread_renamed", { thread_id: threadId, user_id: user.id }); } catch {}
      return NextResponse.json(ok({}));
    } catch (e: any) {
      return NextResponse.json(err(e?.message ?? "Internal error", "INTERNAL"), { status: 500 });
    }
  }).then(({ result }) => result);
}

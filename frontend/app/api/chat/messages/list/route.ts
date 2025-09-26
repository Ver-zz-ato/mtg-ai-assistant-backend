import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { withTiming } from "@/lib/server/log";

const Query = z.object({
  threadId: z.string().uuid(),
});

export async function GET(req: Request) {
  return withTiming("/api/chat/messages/list", "GET", null, async () => {
    try {
      const url = new URL(req.url);
      const params = Object.fromEntries(url.searchParams.entries());
      const parsed = Query.safeParse(params);
      if (!parsed.success) {
        return err("Invalid request: missing or invalid threadId", "BAD_INPUT", 400);
      }
      const { threadId } = parsed.data;

      const supabase = await getServerSupabase();
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (!user || userErr) {
        return err("Unauthorized", "UNAUTHORIZED", 401);
      }

      const { data: thread, error: thErr } = await supabase
        .from("chat_threads")
        .select("id, user_id")
        .eq("id", threadId)
        .single();

      if (thErr || !thread) {
        return err("Thread not found", "NOT_FOUND", 404);
      }
      if (thread.user_id !== user.id) {
        return NextResponse.json(err("Forbidden", "FORBIDDEN"), { status: 403 });
      }

      const { data: messages, error: msgErr } = await supabase
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (msgErr) {
        return err("Failed to load messages: " + (msgErr.message || "unknown"), "DB_ERROR", 500);
      }
      return ok({ data: messages, messages });
    } catch (e: any) {
      return NextResponse.json(err(e?.message ?? "Internal error", "INTERNAL"), { status: 500 });
    }
  }).then(({ result }) => result);
}

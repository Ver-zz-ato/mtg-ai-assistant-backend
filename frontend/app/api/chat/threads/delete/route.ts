import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { withTiming } from "@/lib/server/log";

const Body = z.object({
  threadId: z.string().uuid(),
});

export async function POST(req: Request) {
  return withTiming("/api/chat/threads/delete", "POST", null, async () => {
    try {
      const supabase = await getServerSupabase();
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (!user || userErr) {
        return NextResponse.json(err("Unauthorized"), { status: 401 });
      }

      const json = await req.json().catch(() => ({}));
      const parsed = Body.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json(err("Invalid request", "BAD_INPUT", "Missing threadId"), { status: 400 });
      }

      const { threadId } = parsed.data;
      const { error } = await supabase.from("chat_threads").delete().eq("id", threadId).eq("user_id", user.id);
      if (error) return NextResponse.json(err("Failed to delete thread", "DB_ERROR", error.message), { status: 500 });

      return NextResponse.json(ok({}));
    } catch (e: any) {
      return NextResponse.json(err(e?.message ?? "Internal error", "INTERNAL"), { status: 500 });
    }
  }).then(({ result }) => result);
}

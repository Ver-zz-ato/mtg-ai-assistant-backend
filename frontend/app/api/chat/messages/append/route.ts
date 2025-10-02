import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";

const Req = z.object({
  threadId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]).default("assistant"),
  content: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", "unauthorized", 401);

    const parsed = Req.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
    const { threadId, role, content } = parsed.data;

    const { data: thread, error: tErr } = await supabase
      .from("chat_threads")
      .select("id,user_id")
      .eq("id", threadId)
      .eq("user_id", user.id)
      .single();
    if (tErr || !thread) return err("thread not found", "not_found", 404);

    const { error: mErr } = await supabase
      .from("chat_messages")
      .insert({ thread_id: threadId, role, content });
    if (mErr) return err(mErr.message, "db_error", 500);

    return ok({});
  } catch (e: any) {
    return err(e?.message || "server_error", "internal", 500);
  }
}

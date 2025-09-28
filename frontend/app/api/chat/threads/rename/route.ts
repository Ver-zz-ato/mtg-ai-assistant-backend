import { z } from "zod";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";

const Body = z.object({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1, "Title cannot be empty"),
});

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", "unauthorized", 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const message = parsed.error.issues?.[0]?.message ?? "Invalid request";
      return err(message, "bad_request", 400);
    }

    const { threadId, title } = parsed.data;
    const { error } = await supabase
      .from("chat_threads")
      .update({ title })
      .eq("id", threadId)
      .eq("user_id", user.id);
    if (error) return err(error.message, "db_error", 500);

    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("thread_renamed", { thread_id: threadId, user_id: user.id }); } catch {}
    return ok({});
  } catch (e: any) {
    return err(e?.message ?? "Internal error", "internal", 500);
  }
}

import { z } from "zod";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";

const Body = z.object({
  threadId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", "unauthorized", 401);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return err("Missing threadId", "bad_request", 400);

    const { threadId } = parsed.data;
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("id", threadId)
      .eq("user_id", user.id);
    if (error) return err(error.message, "db_error", 500);

    try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer("thread_deleted", { thread_id: threadId, user_id: user.id }); } catch {}
    return ok({});
  } catch (e: any) {
    return err(e?.message ?? "Internal error", "internal", 500);
  }
}

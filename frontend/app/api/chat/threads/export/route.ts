import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { ExportThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", "unauthorized", 401);

  const parsed = ExportThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
  const { threadId } = parsed.data;

  const { data: thread, error: thErr } = await supabase
    .from("chat_threads")
    .select("id, title, deck_id, created_at")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();
  if (thErr || !thread) return err("thread not found", "not_found", 404);

  const { data: messages, error: mErr } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (mErr) return err(mErr.message, "db_error", 500);

  return ok({ export: { thread, messages } });
}

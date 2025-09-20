import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { ExportThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const parsed = ExportThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, 400);
  const { threadId } = parsed.data;

  const { data: thread, error: thErr } = await supabase
    .from("chat_threads")
    .select("id, title, deck_id, created_at")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .single();
  if (thErr || !thread) return err("thread not found", 404);

  const { data: messages, error: mErr } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (mErr) return err(mErr.message, 500);

  return ok({ export: { thread, messages } });
}

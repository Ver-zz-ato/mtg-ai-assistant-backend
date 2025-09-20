import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { DeleteThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const parsed = DeleteThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, 400);
  const { threadId } = parsed.data;

  // delete children first (no FK cascade in provided schema)
  const delMsgs = await supabase.from("chat_messages").delete().eq("thread_id", threadId);
  if (delMsgs.error) return err(delMsgs.error.message, 500);

  const delTh = await supabase.from("chat_threads").delete().eq("id", threadId).eq("user_id", user.id);
  if (delTh.error) return err(delTh.error.message, 500);

  return ok({});
}

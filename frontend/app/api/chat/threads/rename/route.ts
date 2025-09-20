import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { RenameThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const parsed = RenameThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, 400);
  const { threadId, title } = parsed.data;

  const { error } = await supabase
    .from("chat_threads")
    .update({ title })
    .eq("id", threadId)
    .eq("user_id", user.id);
  if (error) return err(error.message, 500);
  return ok({});
}

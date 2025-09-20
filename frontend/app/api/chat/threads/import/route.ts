import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { ImportThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const parsed = ImportThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, 400);
  const { title, messages, deckId } = parsed.data;

  const { data: th, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title, deck_id: deckId ?? null })
    .select("id")
    .single();
  if (error) return err(error.message, 500);

  const rows = messages.map(m => ({
    thread_id: th.id, role: m.role, content: m.content,
    created_at: m.created_at ?? new Date().toISOString(),
  }));
  const ins = await supabase.from("chat_messages").insert(rows);
  if (ins.error) return err(ins.error.message, 500);

  return ok({ id: th.id });
}

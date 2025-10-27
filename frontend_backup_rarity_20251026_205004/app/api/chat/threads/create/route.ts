import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { CreateThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", "unauthorized", 401);

  const parsed = CreateThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
  const { title, deckId } = parsed.data;

  // Enforce max 30 threads per user
  const { count, error: cErr } = await supabase
    .from("chat_threads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (cErr) return err(cErr.message, "db_error", 500);
  if ((count ?? 0) >= 30) return err("Thread limit reached (30). Please delete a thread before creating a new one.", "thread_limit", 400);

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: title ?? "Untitled", deck_id: deckId ?? null })
    .select("id")
    .single();
  if (error) return err(error.message, "db_error", 500);
  return ok({ id: data.id });
}

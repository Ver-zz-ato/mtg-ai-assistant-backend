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

  // Check Pro status
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_pro')
    .eq('id', user.id)
    .single();
  const isPro = profile?.is_pro || false;

  // Enforce thread limit: Free users: 30, Pro: unlimited
  if (!isPro) {
    const threadLimit = 30;
    const { count, error: cErr } = await supabase
      .from("chat_threads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (cErr) return err(cErr.message, "db_error", 500);
    if ((count ?? 0) >= threadLimit) return err(`Thread limit reached (30). Upgrade to Pro for unlimited threads! Please delete a thread before creating a new one.`, "thread_limit", 400);
  }
  // Pro users: no thread limit check (unlimited)

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: title ?? "Untitled", deck_id: deckId ?? null })
    .select("id")
    .single();
  if (error) return err(error.message, "db_error", 500);
  return ok({ id: data.id });
}

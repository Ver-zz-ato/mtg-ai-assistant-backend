import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
import { CreateThreadSchema } from "@/lib/validate";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", "unauthorized", 401);

  const parsed = CreateThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
  const { title, deckId } = parsed.data;

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: title ?? "Untitled", deck_id: deckId ?? null })
    .select("id")
    .single();
  if (error) return err(error.message, "db_error", 500);
  return ok({ id: data.id });
}

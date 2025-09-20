import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, deck_id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return err(error.message, 500);
  return ok({ threads: data });
}

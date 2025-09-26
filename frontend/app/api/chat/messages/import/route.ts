import { getSupabaseServer } from "@/lib/server-supabase";
import { ok, err } from "@/app/api/_utils/envelope";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { messages, title } = body || {};
  if (!Array.isArray(messages)) return err("Missing messages[]", "bad_request", 400);
  const supabase = await getSupabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return err("unauthorized", "unauthorized", 401);
  const { data: thread, error: tErr } = await supabase
    .from("chat_threads").insert({ user_id: user.id, title: title || "Imported chat" }).select("id").single();
  if (tErr) return err(tErr.message);
  const rows = messages.map((m: any) => ({
    thread_id: thread!.id, role: m.role, content: m.content, created_at: m.created_at || new Date().toISOString()
  }));
  if (rows.length) {
    const { error } = await supabase.from("chat_messages").insert(rows);
    if (error) return err(error.message);
  }
  return ok({ threadId: thread!.id });
}

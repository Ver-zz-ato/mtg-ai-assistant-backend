import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { ThreadIdSchema } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return err("unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const tid = searchParams.get("threadId") || "";
  const parsed = ThreadIdSchema.safeParse(tid);
  if (!parsed.success) return err("Invalid threadId", 400);

  // ownership check
  const owner = await supabase.from("chat_threads")
    .select("id").eq("id", tid).eq("user_id", user.id).single();
  if (owner.error || !owner.data) return err("thread not found", 404);

  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, content, created_at")
    .eq("thread_id", tid)
    .order("created_at", { ascending: true });
  if (error) return err(error.message, 500);
  return ok({ messages: data });
}

// app/api/chat/threads/list/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/api/envelope";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return ok({ threads: [] }); // show empty for anon

  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, title, deck_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return err(error.message);
  return ok({ threads: data ?? [] });
}

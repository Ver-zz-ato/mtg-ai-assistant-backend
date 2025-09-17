// app/api/chat/messages/list/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/api/envelope";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return err("Unauthenticated", undefined, { status: 401 });

  const { searchParams } = new URL(req.url);
  const threadId = (searchParams.get("threadId") || "").trim();
  if (!threadId) return err("threadId required", undefined, { status: 400 });

  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return err(error.message);
  return ok({ messages: data ?? [] });
}

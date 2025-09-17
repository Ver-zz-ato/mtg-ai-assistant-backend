// app/api/chat/messages/post/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/api/envelope";
import { withLogging } from "@/lib/api/withLogging";

const Body = z.object({
  threadId: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(20000),
});

export const POST = withLogging(async (req: NextRequest) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return err("Unauthenticated", undefined, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid input", parsed.error.flatten(), { status: 400 });
  const { threadId, role, content } = parsed.data;

  const { data: t, error: terr } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .single();

  if (terr || !t) return err("Thread not found", undefined, { status: 404 });

  const { error } = await supabase
    .from("chat_messages")
    .insert({ thread_id: threadId, role, content });

  if (error) return err(error.message);
  return ok({ saved: true });
});

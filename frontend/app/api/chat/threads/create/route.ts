// app/api/chat/threads/create/route.ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/lib/api/envelope";
import { withLogging } from "@/lib/api/withLogging";

const Body = z.object({
  title: z.string().max(120).optional(),
  deckId: z.string().uuid().optional(),
});

export const POST = withLogging(async (req: NextRequest) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const user = u?.user;
  if (!user) return err("Unauthenticated", undefined, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err("Invalid input", parsed.error.flatten(), { status: 400 });
  const { title, deckId } = parsed.data;

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: title ?? null, deck_id: deckId ?? null })
    .select("id")
    .single();

  if (error) return err(error.message);
  return ok({ threadId: data?.id });
});

import { NextRequest } from "next/server";
import { ok, err } from "@/app/api/_utils/envelope";
import { LinkThreadSchema } from "@/lib/validate";
import { getUserAndSupabase } from "@/lib/api/get-user-from-request";

export async function POST(req: NextRequest) {
  const { supabase, user } = await getUserAndSupabase(req);
  if (!user) return err("unauthorized", "unauthorized", 401);

  const parsed = LinkThreadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return err(parsed.error.issues[0].message, "bad_request", 400);
  const { threadId, deckId } = parsed.data;

  const { error } = await supabase
    .from("chat_threads")
    .update({ deck_id: deckId ?? null })
    .eq("id", threadId)
    .eq("user_id", user.id);
  if (error) return err(error.message, "db_error", 500);

  try { const { captureServer } = await import("@/lib/server/analytics"); await captureServer(deckId ? "thread_linked" : "thread_unlinked", { thread_id: threadId, deck_id: deckId ?? null, user_id: user.id }); } catch {}
  return ok({});
}

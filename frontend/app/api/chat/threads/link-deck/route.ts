import { NextRequest } from "next/server"; import { ok, err } from "@/lib/api/envelope"; import { z } from "zod"; import { getUserAndSupabase } from "@/lib/api/get-user-from-request";
const Body = z.object({ threadId: z.string().uuid(), deckId: z.string().uuid().nullable() });
export async function POST(req: NextRequest) { const { supabase, user } = await getUserAndSupabase(req); if (!user) return err("Not authenticated");
const { threadId, deckId } = Body.parse(await req.json()); const { error } = await supabase.from("chat_threads").update({ deck_id: deckId }).eq("id", threadId).eq("user_id", user.id); if (error) return err(error.message); return ok({}); }

import { NextRequest } from "next/server";
import { createClient } from "@/lib/server-supabase";
import { ok, err } from "@/lib/envelope";
import { z } from "zod";

const Req = z.object({
  title: z.string().min(1).max(120),
  format: z.string().default("Commander"),
  plan: z.string().default("Optimized"),
  colors: z.array(z.string()).default([]),
  currency: z.string().default("USD"),
  deck_text: z.string().default(""),
  data: z.any().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err("unauthorized", 401);

    const parsed = Req.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return err(parsed.error.issues[0].message, 400);
    const payload = parsed.data;

    const { data, error } = await supabase
      .from("decks")
      .insert({
        user_id: user.id,
        title: payload.title,
        format: payload.format,
        plan: payload.plan,
        colors: payload.colors,
        currency: payload.currency,
        deck_text: payload.deck_text,
        data: payload.data ?? null,
        is_public: false,
      })
      .select("id")
      .single();

    if (error) return err(error.message, 500);
    return ok({ id: data.id });
  } catch (e: any) {
    return err(e?.message || "server_error", 500);
  }
}

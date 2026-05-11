import { createClient, createClientWithBearerToken } from "@/lib/server-supabase";

export async function getDeckActionAuth(req: Request): Promise<{ supabase: any; userId: string | null }> {
  let supabase = await createClient();
  let { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser(bearerToken);
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }
  return { supabase, userId: user?.id ?? null };
}

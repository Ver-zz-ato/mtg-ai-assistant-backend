import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createClientWithBearerToken } from "@/lib/server-supabase";

/**
 * Cookie session first, then Authorization Bearer (mobile).
 */
export async function getUserAndSupabase(
  req: NextRequest
): Promise<{ supabase: SupabaseClient; user: User | null; authError: Error | null }> {
  let supabase = await createClient();
  let { data: { user }, error: authError } = await supabase.auth.getUser();

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!user && bearerToken) {
    const bearerSupabase = createClientWithBearerToken(bearerToken);
    const { data: { user: bearerUser }, error: be } = await bearerSupabase.auth.getUser();
    if (bearerUser) {
      supabase = bearerSupabase;
      user = bearerUser;
      authError = null;
    } else {
      authError = be ?? authError;
    }
  }

  return { supabase, user: user ?? null, authError: authError };
}

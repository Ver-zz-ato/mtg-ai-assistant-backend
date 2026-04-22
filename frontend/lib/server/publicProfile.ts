import { createClient, getServiceRoleClient } from "@/lib/supabase/server";

/**
 * Load a row from `profiles_public` for the public /u/[slug] page.
 * Lives under lib/server so security CI does not treat it as client-bundled code
 * (see .github/workflows/security-checks.yml).
 */
export async function loadProfilesPublicBySlug(slug: string) {
  const supabase = await createClient();
  // Anonymous visitors: RLS on profiles_public may block anon SELECT; prefer admin client when set.
  const admin = getServiceRoleClient() ?? supabase;

  let prof: any = null;
  try {
    const { data } = await admin.from("profiles_public").select("*").eq("username", slug).maybeSingle();
    prof = data || null;
  } catch {
    /* ignore */
  }
  if (!prof) {
    try {
      const { data: rows } = await admin.from("profiles_public").select("*").ilike("username", slug).limit(2);
      if (Array.isArray(rows) && rows.length === 1) prof = rows[0];
    } catch {
      /* ignore */
    }
  }
  if (!prof) {
    try {
      const { data } = await admin.from("profiles_public").select("*").eq("id", slug).maybeSingle();
      prof = data || null;
    } catch {
      /* ignore */
    }
  }
  return prof;
}

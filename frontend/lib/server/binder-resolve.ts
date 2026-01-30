/**
 * Server-only: resolve public binder slug -> collection_id.
 * Uses service role to bypass RLS for public lookup; must never run in client code.
 */
import { createClient } from "@supabase/supabase-js";

export async function getBinderCollectionIdBySlug(slug: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, anonKey, { auth: { persistSession: false } });

  let { data, error } = await supabase
    .from("collection_meta")
    .select("collection_id,is_public,public_slug,visibility")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .maybeSingle();

  if (!data && !error) {
    const { data: allMeta } = await supabase
      .from("collection_meta")
      .select("collection_id,is_public,public_slug,visibility")
      .eq("is_public", true)
      .not("public_slug", "is", null);

    const match = (allMeta || []).find((m: { public_slug?: string }) => {
      const storedSlug = String(m.public_slug || "").toLowerCase();
      return storedSlug === slug.toLowerCase();
    });
    if (match) {
      data = match;
      error = null;
    }
  }

  if (error || !data) return null;

  const isPublic = data.is_public === true || data.visibility === "public";
  if (!isPublic) return null;

  return data.collection_id as string;
}

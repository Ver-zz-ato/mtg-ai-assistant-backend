import { getServiceRoleClient } from "@/lib/supabase/server";

export type PublicCustomCardRow = {
  id: string;
  title: string | null;
  data?: Record<string, unknown> | null;
  public_slug: string | null;
};

export async function loadPublicCustomCard(
  slug: string,
  select = "id, title, data, public_slug"
): Promise<PublicCustomCardRow | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data: bySlug } = await admin
    .from("custom_cards")
    .select(select)
    .eq("public_slug", slug)
    .maybeSingle();
  if (bySlug) return bySlug as unknown as PublicCustomCardRow;

  const { data: byPublicId } = await admin
    .from("custom_cards")
    .select(select)
    .eq("id", slug)
    .not("public_slug", "is", null)
    .maybeSingle();
  return (byPublicId as unknown as PublicCustomCardRow | null) ?? null;
}

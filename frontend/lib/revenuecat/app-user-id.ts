const SUPABASE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when RevenueCat `app_user_id` is a linked Supabase auth UUID. */
export function isSupabaseUserId(id: string): boolean {
  return SUPABASE_UUID_RE.test(id);
}

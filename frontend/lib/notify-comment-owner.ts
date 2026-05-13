import { createClient } from "@supabase/supabase-js";
import { sendExpoPushMessages } from "@/lib/expo-push";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";

function adminDb() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export type ResourceKind = "deck" | "collection" | "roast" | "health_report" | "analysis_report" | "custom_card";

/**
 * Fire-and-forget push to resource owner when someone leaves a comment (not if self-comment).
 */
export async function notifyOwnerNewComment(params: {
  ownerUserId: string;
  actorUserId: string;
  resourceLabel: string;
  preview: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const { ownerUserId, actorUserId, resourceLabel, preview, data } = params;
  if (!ownerUserId || ownerUserId === actorUserId) return;
  const admin = adminDb();
  if (!admin) {
    console.warn("notify_comment_owner: no service role client");
    return;
  }
  const { data: row, error } = await admin
    .from("user_push_tokens")
    .select("expo_push_token")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (error || !row?.expo_push_token) return;

  const body =
    preview.length > 120 ? `${preview.slice(0, 117)}…` : preview || "New comment";

  await sendExpoPushMessages([
    {
      to: row.expo_push_token,
      title: `ManaTap · ${resourceLabel}`,
      body,
      data: { ...data, type: "comment" },
      sound: "default",
    },
  ]);
}

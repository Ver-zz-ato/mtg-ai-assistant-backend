import "server-only";

import { isAdminUser } from "@/lib/admin-auth";
import { getServerSupabase } from "@/lib/server-supabase";

export const TOURNAMENT_MANAGER_PATH = "/tools/tournament-manager";

export function isTournamentManagerVisibleInDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function canViewTournamentManager(): Promise<boolean> {
  if (isTournamentManagerVisibleInDev()) return true;

  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return isAdminUser(user);
  } catch {
    return false;
  }
}

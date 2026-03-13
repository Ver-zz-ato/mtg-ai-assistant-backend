/**
 * Admin-only: list Test Suite V2 scenarios.
 * GET /api/admin/test-suite-v2/scenarios
 */

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { SCENARIOS } from "@/lib/admin/ai-v2/scenarios";

export async function GET() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    scenarios: SCENARIOS.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      description: s.description,
      tags: s.tags,
      turnsCount: s.turns.length,
      expectedBehavior: s.expectedBehavior,
    })),
  });
}

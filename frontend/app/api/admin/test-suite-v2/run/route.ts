/**
 * Admin-only: run Test Suite V2 scenarios.
 * POST body: { scenarioIds?: string[] } — run selected, or all if empty.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { SCENARIOS } from "@/lib/admin/ai-v2/scenarios";
import { runScenarios } from "@/lib/admin/ai-v2/runner";
import type { V2RunSummary } from "@/lib/admin/ai-v2/types";

export async function POST(req: NextRequest) {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const scenarioIds: string[] | undefined = Array.isArray(body.scenarioIds)
    ? body.scenarioIds.filter((id: unknown) => typeof id === "string")
    : undefined;

  const toRun =
    scenarioIds?.length
      ? SCENARIOS.filter((s) => scenarioIds.includes(s.id))
      : SCENARIOS;

  const results = await runScenarios(toRun);
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const hardCount = results.reduce((a, r) => a + r.hardFailures.length, 0);
  const softCount = results.reduce((a, r) => a + r.softFailures.length, 0);

  const summary: V2RunSummary = {
    total: results.length,
    passed,
    failed,
    hardFailures: hardCount,
    softFailures: softCount,
    results,
    lastRunAt: new Date().toISOString(),
  };

  return NextResponse.json(summary);
}

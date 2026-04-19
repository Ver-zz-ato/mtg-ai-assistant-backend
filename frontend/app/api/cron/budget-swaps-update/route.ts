/**
 * Weekly cron: AI-powered update of Quick Swaps (budget alternatives map).
 * Suggests new entries for expensive cards missing from the map; merges into app_config.
 * Schedule: weekly (e.g. Sunday 3am UTC).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { getBudgetSwaps } from "@/lib/data/get-budget-swaps";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";

const JOB_ID = "budget-swaps-update";

export const runtime = "nodejs";
export const maxDuration = 120;

function isAuthorized(req: NextRequest): boolean {
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const vercelId = req.headers.get("x-vercel-id");
  const url = new URL(req.url);
  const queryKey = url.searchParams.get("key") || "";
  return !!cronKey && (!!vercelId || hdr === cronKey || queryKey === cronKey);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runBudgetSwapsUpdate();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runBudgetSwapsUpdate();
}

async function runBudgetSwapsUpdate() {
  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY required" }, { status: 500 });
  }

  const attemptStartedAt = new Date().toISOString();
  await markAdminJobAttempt(admin, JOB_ID);

  try {
    const currentSwaps = await getBudgetSwaps();
    const existingKeys = Object.keys(currentSwaps);
    const sampleEntries = Object.entries(currentSwaps).slice(0, 20).map(([k, v]) => `"${k}": [${v.map((x) => `"${x}"`).join(", ")}]`);

    const systemPrompt = `You are a Magic: The Gathering deck-building expert. You maintain a budget swap map: expensive card → 2-3 cheaper alternatives that fill the SAME deck role (ramp→ramp, removal→removal, etc.).

RULES:
1. Only suggest REAL card names (use exact Scryfall names).
2. Replacements must be cheaper and fill the same role.
3. Focus on Commander/EDH staples.
4. Suggest 5-15 NEW entries for expensive cards NOT already in the map.
5. Return ONLY valid JSON: { "additions": { "Card Name": ["Alt1","Alt2","Alt3"] } }
6. Use lowercase keys for the expensive card (e.g. "rhystic study" not "Rhystic Study").
7. Do NOT include cards already in the current map.`;

    const userPrompt = `Current map has ${existingKeys.length} entries. Sample:
${sampleEntries.join("\n")}

Suggest NEW entries (expensive cards missing from this map). Focus on: newly expensive staples, meta-shifted cards, popular Commander cards. Return JSON only.`;

    const model = process.env.MODEL_AI_TEST || process.env.MODEL_SWAP_SUGGESTIONS || "gpt-4o-mini";
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        route: "/api/cron/budget-swaps-update",
        feature: "budget_swaps_update",
        model,
        fallbackModel: model,
        timeout: 60000,
        maxTokens: 4096,
        apiType: "chat",
        skipRecordAiUsage: true,
      }
    );

    const text = response.text?.trim() || "";
    let additions: Record<string, string[]> = {};
    try {
      const parsed = JSON.parse(text.replace(/```json\s?|\s?```/g, "").trim());
      additions = parsed.additions || parsed;
      if (typeof additions !== "object") additions = {};
    } catch {
      console.warn("[budget-swaps-update] Failed to parse AI response:", text.slice(0, 200));
      const finishedAt = new Date().toISOString();
      await persistAdminJobRun(admin, JOB_ID, {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: true,
        runResult: "partial",
        compactLine: "AI response not valid JSON — no map changes",
        destination: "app_config.budget_swaps",
        source: "OpenAI (MODEL_AI_TEST / MODEL_SWAP_SUGGESTIONS)",
        durationMs: Date.now() - new Date(attemptStartedAt).getTime(),
        counts: { map_entries_before: existingKeys.length, added: 0 },
        warnings: ["Could not parse AI JSON — check logs for response snippet"],
        labels: { schedule: "Sundays 03:00 UTC", scope: "Commander budget alternatives" },
      });
      return NextResponse.json({
        ok: true,
        message: "No valid additions parsed",
        added: 0,
        total: existingKeys.length,
      });
    }

    const merged: Record<string, string[]> = { ...currentSwaps };
    let added = 0;
    for (const [key, values] of Object.entries(additions)) {
      const k = key.toLowerCase().trim();
      if (!k || existingKeys.includes(k)) continue;
      if (Array.isArray(values) && values.length > 0) {
        const valid = values.filter((v) => typeof v === "string" && v.trim().length > 0).slice(0, 5);
        if (valid.length > 0) {
          merged[k] = valid;
          added++;
        }
      }
    }

    if (added === 0) {
      const finishedAt = new Date().toISOString();
      await persistAdminJobRun(admin, JOB_ID, {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: true,
        runResult: "success",
        compactLine: `No new swap entries — map still ${Object.keys(merged).length} keys`,
        destination: "app_config.budget_swaps",
        source: "OpenAI",
        durationMs: Date.now() - new Date(attemptStartedAt).getTime(),
        counts: { map_entries: Object.keys(merged).length, added: 0 },
        labels: { schedule: "Sundays 03:00 UTC" },
      });
      return NextResponse.json({
        ok: true,
        message: "No new entries to add",
        added: 0,
        total: Object.keys(merged).length,
      });
    }

    const toStore: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(merged)) {
      toStore[k] = v;
    }

    const lastUpdated = new Date().toISOString().split("T")[0];
    const { error } = await admin.from("app_config").upsert(
      {
        key: "budget_swaps",
        value: { swaps: toStore, lastUpdated, version: "1.0.0" },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      const finishedAt = new Date().toISOString();
      await persistAdminJobRun(admin, JOB_ID, {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: false,
        runResult: "failed",
        compactLine: `DB upsert failed: ${error.message}`,
        destination: "app_config.budget_swaps",
        lastError: error.message,
      });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    try {
      await admin.from("admin_audit").insert({
        actor_id: "cron",
        action: "budget_swaps_auto_update",
        target: "app_config.budget_swaps",
        details: `AI suggested ${added} new entries. Total: ${Object.keys(toStore).length}.`,
      });
    } catch {
      // Ignore audit errors
    }

    const finishedAt = new Date().toISOString();
    await persistAdminJobRun(admin, JOB_ID, {
      jobId: JOB_ID,
      attemptStartedAt,
      finishedAt,
      ok: true,
      runResult: "success",
      compactLine: `Added ${added} swap entries · total map keys ${Object.keys(toStore).length}`,
      destination: "app_config.budget_swaps",
      source: "OpenAI",
      durationMs: Date.now() - new Date(attemptStartedAt).getTime(),
      counts: { added, map_entries: Object.keys(toStore).length },
      labels: { schedule: "Sundays 03:00 UTC" },
    });

    return NextResponse.json({
      ok: true,
      message: `Added ${added} new budget swap entries`,
      added,
      total: Object.keys(toStore).length,
    });
  } catch (e: any) {
    console.error("[budget-swaps-update]", e);
    const msg = e?.message || "cron_failed";
    try {
      const admin2 = getAdmin();
      if (admin2) {
        await persistAdminJobRun(admin2, JOB_ID, {
          jobId: JOB_ID,
          attemptStartedAt,
          finishedAt: new Date().toISOString(),
          ok: false,
          runResult: "failed",
          compactLine: `Error: ${String(msg).slice(0, 200)}`,
          lastError: String(msg),
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

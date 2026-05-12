import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { logAdminAction, readJsonBody, requireTypedConfirmation } from "@/lib/admin/danger-actions";
import { requireAdminForApi } from "@/lib/server-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SmokeCase = {
  name: string;
  prompt: string;
  mustMatch?: RegExp[];
  mustNotMatch?: RegExp[];
};

const SMOKE_CASES: SmokeCase[] = [
  {
    name: "MTG domain gate",
    prompt: "Write me a detailed pasta recipe.",
    mustMatch: [/magic|mtg|card|deck/i],
    mustNotMatch: [/boil.*pasta/i],
  },
  {
    name: "Rules grounding",
    prompt: "Explain priority and the stack like I'm brand new to Magic.",
    mustMatch: [/priority/i, /stack/i],
  },
  {
    name: "Commander decklist detection",
    prompt:
      "analyse this Commander deck:\n1 Muldrotha, the Gravetide\n1 Sol Ring\n1 Sakura-Tribe Elder\n1 Eternal Witness\n1 Command Tower\n1 Forest\n1 Island\n1 Swamp",
    mustMatch: [/muldrotha/i, /commander/i],
    mustNotMatch: [/need a real decklist/i],
  },
  {
    name: "60-card format",
    prompt: "analyse this pauper deck\n4 Faerie Seer\n4 Spellstutter Sprite\n4 Counterspell\n16 Island\n2 Ash Barrens",
    mustMatch: [/pauper/i],
    mustNotMatch: [/commander/i],
  },
  {
    name: "Budget replacements",
    prompt: "Find cards similar to Rhystic Study that are cheaper.",
    mustMatch: [/rhystic study/i, /(mystic remora|esper sentinel|draw)/i],
  },
  {
    name: "Combo query",
    prompt: "What cards combo with Dockside Extortionist?",
    mustMatch: [/dockside/i, /(temur sabertooth|emiel|cloudstone|breach|combo)/i],
  },
];

function check(text: string, test: SmokeCase) {
  const failures: string[] = [];
  for (const rule of test.mustMatch || []) {
    if (!rule.test(text)) failures.push(`Missing ${rule}`);
  }
  for (const rule of test.mustNotMatch || []) {
    if (rule.test(text)) failures.push(`Forbidden ${rule}`);
  }
  if (text.length < 80) failures.push("Response too short");
  return { passed: failures.length === 0, failures };
}

async function callChat(req: NextRequest, prompt: string, runId: string) {
  const guestToken = `admin-live-smoke-${crypto.randomUUID()}`;
  const res = await fetch(`${req.nextUrl.origin}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-guest-session-token": guestToken,
      cookie: `guest_session_token=${guestToken}`,
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 10}`,
    },
    body: JSON.stringify({
      text: prompt,
      threadId: null,
      prefs: { format: null, budget: null },
      context: null,
      eval_run_id: runId,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(async () => ({ response: await res.text().catch(() => "") }));
  return {
    ok: res.ok,
    status: res.status,
    text: String(body?.response || body?.message || body?.answer || body?.content || body?.error || ""),
    raw: body,
  };
}

async function storeReport(report: any) {
  const admin = getAdmin();
  if (!admin) return;
  try {
    await admin.from("eval_runs").insert({
      suite: "admin_live_smoke",
      prompts: report.results.map((result: any) => ({
        name: result.name,
        prompt: result.prompt,
        passed: result.passed,
        status: result.status,
        failures: result.failures,
      })),
      status: report.failed === 0 ? "passed" : "failed",
      meta: report,
    });
  } catch {
    await logAdminAction({
      actorId: report.actorId,
      action: "admin_live_smoke",
      target: report.runId,
      payload: report,
    });
  }
}

export async function GET() {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const service = getAdmin();
  if (!service) return NextResponse.json({ ok: true, reports: [], warning: "missing_service_role_key" });
  const { data, error } = await service
    .from("eval_runs")
    .select("id, created_at, suite, status, prompts, meta")
    .eq("suite", "admin_live_smoke")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ ok: true, reports: [], warning: error.message });
  return NextResponse.json({ ok: true, reports: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminForApi();
  if (!admin.ok) return admin.response;

  const body = await readJsonBody(req);
  const confirmation = requireTypedConfirmation(req, body, "RUN");
  if (confirmation) return confirmation;

  const runId = `admin-live-smoke-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const results = [];

  for (const test of SMOKE_CASES) {
    const t0 = Date.now();
    const response = await callChat(req, test.prompt, runId);
    const checked = response.ok ? check(response.text, test) : { passed: false, failures: [`HTTP ${response.status}`] };
    results.push({
      name: test.name,
      prompt: test.prompt,
      passed: checked.passed,
      failures: checked.failures,
      status: response.status,
      latencyMs: Date.now() - t0,
      preview: response.text.slice(0, 600),
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const report = {
    ok: passed === results.length,
    runId,
    actorId: admin.user.id,
    startedAt,
    finishedAt: new Date().toISOString(),
    passed,
    failed: results.length - passed,
    total: results.length,
    results,
  };

  await storeReport(report);
  await logAdminAction({
    actorId: admin.user.id,
    action: "admin_live_smoke",
    target: runId,
    payload: { passed: report.passed, failed: report.failed, total: report.total },
  });

  return NextResponse.json(report, { status: report.ok ? 200 : 207 });
}

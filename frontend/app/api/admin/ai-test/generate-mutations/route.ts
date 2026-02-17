import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { generateMutations, type MutationType } from "@/lib/ai/test-mutation";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

const MUTATION_TYPES: MutationType[] = [
  "missing_commander",
  "messy_decklist",
  "contradictory_budget",
  "format_omitted",
  "typos_decklist",
  "reordered_lines",
  "duplicated_entries",
  "near_miss_card",
  "irrelevant_chatter",
  "empty_user_message",
];

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { base_test_case_ids, mutation_types, count_per_case } = body;

    const ids = Array.isArray(base_test_case_ids) ? base_test_case_ids : [];
    const types = Array.isArray(mutation_types) && mutation_types.length > 0
      ? mutation_types.filter((t: string) => MUTATION_TYPES.includes(t as MutationType))
      : MUTATION_TYPES;
    const count = typeof count_per_case === "number" && count_per_case > 0 ? count_per_case : 1;

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "base_test_case_ids required (array)" }, { status: 400 });
    }

    const { data: baseCases, error } = await supabase
      .from("ai_test_cases")
      .select("*")
      .in("id", ids);

    if (error || !baseCases?.length) {
      return NextResponse.json({ ok: false, error: "No base test cases found" }, { status: 400 });
    }

    const created: { id: string; name: string; mutation_type: string; base_id: string }[] = [];

    for (const base of baseCases) {
      const testCase = {
        id: base.id,
        name: base.name,
        type: base.type,
        input: base.input,
        expectedChecks: base.expected_checks,
        tags: base.tags || [],
      };

      const mutations = generateMutations(testCase, types as MutationType[], count);

      for (const mut of mutations) {
        const { data: inserted, error: insertErr } = await supabase
          .from("ai_test_cases")
          .insert({
            name: mut.name,
            type: mut.type,
            input: mut.input,
            expected_checks: mut.expectedChecks,
            tags: mut.tags,
            source: "mutation",
          })
          .select("id")
          .single();

        if (insertErr) {
          console.warn("[generate-mutations] Insert failed:", insertErr);
          continue;
        }

        await supabase.from("ai_test_mutations").insert({
          base_test_case_id: base.id,
          mutated_test_case_id: inserted.id,
          mutation_type: mut.mutationType,
          meta: mut.meta || {},
        });

        created.push({
          id: inserted.id,
          name: mut.name,
          mutation_type: mut.mutationType,
          base_id: base.id,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      mutations: created,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

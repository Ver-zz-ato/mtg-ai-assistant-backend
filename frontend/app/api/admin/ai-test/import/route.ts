import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { testCases, conflictResolution = "skip" } = body; // conflictResolution: "skip" | "overwrite" | "rename"

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json({ ok: false, error: "testCases array required" }, { status: 400 });
    }

    const created: any[] = [];
    const skipped: any[] = [];
    const errors: any[] = [];

    for (const testCase of testCases) {
      try {
        // Validate test case structure
        if (!testCase.name || !testCase.type || !testCase.input) {
          errors.push({ testCase, error: "Missing required fields: name, type, input" });
          continue;
        }

        // Check if test case with same name exists
        const { data: existing } = await supabase
          .from("ai_test_cases")
          .select("id, name")
          .eq("name", testCase.name)
          .maybeSingle();

        if (existing) {
          if (conflictResolution === "skip") {
            skipped.push({ testCase, reason: "Name already exists" });
            continue;
          } else if (conflictResolution === "overwrite") {
            // Update existing
            const { data: updated, error: updateError } = await supabase
              .from("ai_test_cases")
              .update({
                type: testCase.type,
                input: testCase.input,
                expected_checks: testCase.expectedChecks || testCase.expected_checks || {},
                tags: testCase.tags || [],
                source: testCase.source || "imported",
              })
              .eq("id", existing.id)
              .select()
              .single();

            if (updateError) {
              errors.push({ testCase, error: updateError.message });
            } else {
              created.push(updated);
            }
            continue;
          } else if (conflictResolution === "rename") {
            // Rename by appending number
            let newName = testCase.name;
            let counter = 1;
            while (true) {
              const { data: check } = await supabase
                .from("ai_test_cases")
                .select("id")
                .eq("name", newName)
                .maybeSingle();
              if (!check) break;
              newName = `${testCase.name} (${counter})`;
              counter++;
            }
            testCase.name = newName;
          }
        }

        // Create new test case
        const { data: createdCase, error: createError } = await supabase
          .from("ai_test_cases")
          .insert({
            name: testCase.name,
            type: testCase.type,
            input: testCase.input,
            expected_checks: testCase.expectedChecks || testCase.expected_checks || {},
            tags: testCase.tags || [],
            source: testCase.source || "imported",
          })
          .select()
          .single();

        if (createError) {
          errors.push({ testCase, error: createError.message });
        } else {
          created.push(createdCase);
        }
      } catch (e: any) {
        errors.push({ testCase, error: e.message });
      }
    }

    return NextResponse.json({
      ok: true,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        created,
        skipped,
        errors,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}




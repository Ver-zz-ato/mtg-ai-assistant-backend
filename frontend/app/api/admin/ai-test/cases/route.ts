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

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    // Load from JSON file
    const testCasesJson = await import("@/lib/data/ai_test_cases.json");
    const jsonCases = (testCasesJson as any).testCases || [];

    // Load from database
    const { data: dbCases, error } = await supabase.from("ai_test_cases").select("*").order("created_at", { ascending: false });

    if (error) {
      console.warn("Failed to load DB test cases:", error);
    }

    // Combine and format
    const allCases = [
      ...jsonCases.map((tc: any) => ({
        ...tc,
        source: tc.source || "curated",
      })),
      ...(dbCases || []).map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        type: tc.type,
        input: tc.input,
        expectedChecks: tc.expected_checks,
        tags: tc.tags || [],
        source: tc.source || "user_submitted",
        createdAt: tc.created_at,
      })),
    ];

    return NextResponse.json({ ok: true, testCases: allCases });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { name, type, input, expectedChecks, tags, source } = body;

    if (!name || !type || !input) {
      return NextResponse.json({ ok: false, error: "name, type, and input required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ai_test_cases")
      .insert({
        name,
        type,
        input,
        expected_checks: expectedChecks || {},
        tags: tags || [],
        source: source || "user_submitted",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      testCase: {
        id: data.id,
        name: data.name,
        type: data.type,
        input: data.input,
        expectedChecks: data.expected_checks,
        tags: data.tags || [],
        source: data.source,
        createdAt: data.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, name, type, input, expectedChecks, tags, source } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (input !== undefined) updateData.input = input;
    if (expectedChecks !== undefined) updateData.expected_checks = expectedChecks;
    if (tags !== undefined) updateData.tags = tags;
    if (source !== undefined) updateData.source = source;

    const { data, error } = await supabase.from("ai_test_cases").update(updateData).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      testCase: {
        id: data.id,
        name: data.name,
        type: data.type,
        input: data.input,
        expectedChecks: data.expected_checks,
        tags: data.tags || [],
        source: data.source,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const { error } = await supabase.from("ai_test_cases").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { validateResponse } from "@/lib/ai/test-validator";

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
    const { response, testCase, options } = body;

    if (!response || !testCase) {
      return NextResponse.json({ ok: false, error: "response and testCase required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const validationOptions = {
      runKeywordChecks: options?.runKeywordChecks !== false,
      runLLMFactCheck: options?.runLLMFactCheck === true,
      runReferenceCompare: options?.runReferenceCompare === true,
      apiKey: options?.runLLMFactCheck ? apiKey : undefined,
      supabase: supabase,
    };

    const results = await validateResponse(response, testCase, validationOptions);

    return NextResponse.json({
      ok: true,
      validation: results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


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
    const { url, searchQuery } = body;

    if (!url && !searchQuery) {
      return NextResponse.json({ ok: false, error: "url or searchQuery required" }, { status: 400 });
    }

    // Placeholder: Web scraping would be implemented here
    // For now, return a message explaining this needs to be implemented
    // In production, you'd use a library like cheerio, puppeteer, or a scraping service

    return NextResponse.json({
      ok: true,
      message: "Web scraping not yet implemented. This would extract MTG questions from Reddit/forums.",
      potentialTestCases: [],
      note: "To implement: Use a scraping library to extract questions from Reddit posts, forum threads, etc. Then use LLM to convert them into structured test cases.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


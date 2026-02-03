import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export const runtime = "nodejs";

const OPENAI_MODELS_URL = "https://api.openai.com/v1/models";
const isDev = process.env.NODE_ENV === "development";

function isAdmin(user: { id?: string; email?: string } | null): boolean {
  if (!user) return false;
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(user.id || "");
  const email = String(user.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * Dev-only (or admin) helper: list OpenAI models available for the project key.
 * Returns only id, created, owned_by — no secrets. Use to confirm gpt-5.2 / gpt-5.2-chat-latest availability.
 * Never logs the API key.
 */
export async function GET(req: NextRequest) {
  try {
    if (!isDev) {
      const supabase = await getServerSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !isAdmin(user)) {
        return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not set", models: [] }, { status: 200 });
    }

    const res = await fetch(OPENAI_MODELS_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({
        ok: false,
        error: `OpenAI API ${res.status}`,
        detail: body.slice(0, 500),
        models: [],
      }, { status: 200 });
    }

    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    const safe = models.map((m: any) => ({
      id: m?.id ?? null,
      created: m?.created ?? null,
      owned_by: m?.owned_by ?? null,
    }));

    return NextResponse.json({
      ok: true,
      count: safe.length,
      models: safe,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error", models: [] }, { status: 500 });
  }
}

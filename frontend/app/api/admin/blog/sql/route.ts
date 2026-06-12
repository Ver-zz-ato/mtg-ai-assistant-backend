import { NextRequest } from "next/server";
import { generateBlogSql } from "@/lib/blog/generateBlogSql";
import type { BlogSqlPayload } from "@/lib/blog/generateBlogSql";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    const isAdmin = !profileError && profile?.is_admin === true;
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as BlogSqlPayload;
    if (!payload?.slug || !payload?.content?.trim()) {
      return new Response(
        JSON.stringify({ ok: false, error: "slug and content are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const sql = generateBlogSql(payload);
    return new Response(JSON.stringify({ ok: true, sql }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "sql_generation_failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

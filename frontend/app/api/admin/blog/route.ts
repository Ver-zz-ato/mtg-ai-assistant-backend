import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BlogListingEntry } from "@/lib/blog/blogConfig";
import { loadBlogBodies, saveBlogAdminState } from "@/lib/blog/publishBlogPost";

export type BlogEntry = BlogListingEntry;

export async function GET() {
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
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: blog, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "blog")
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const blogData = blog?.value || { entries: [] };
    const bodies = await loadBlogBodies(supabase);

    return new Response(
      JSON.stringify({
        ok: true,
        blog: blogData,
        bodies,
        is_admin: isAdmin,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

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

    const { entries, bodies } = await req.json();

    if (!Array.isArray(entries)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid entries format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    for (const entry of entries) {
      if (!entry.slug || !entry.title || !entry.date) {
        return new Response(
          JSON.stringify({ ok: false, error: "Each entry must have slug, title, and date" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const bodiesMap: Record<string, string> =
      bodies && typeof bodies === "object" ? bodies : {};

    await saveBlogAdminState(supabase, entries as BlogListingEntry[], bodiesMap);

    return new Response(JSON.stringify({ ok: true, message: "Blog updated successfully" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

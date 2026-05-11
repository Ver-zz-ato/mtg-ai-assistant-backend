import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface BlogEntry {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
  gradient: string;
  icon: string;
  imageUrl?: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    const isAdmin = !profileError && profile?.is_admin === true;

    const { data: blog, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'blog')
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const blogData = blog?.value || { entries: [] };

    return new Response(JSON.stringify({
      ok: true,
      blog: blogData,
      is_admin: isAdmin
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    const isAdmin = !profileError && profile?.is_admin === true;
    if (!isAdmin) {
      return new Response(JSON.stringify({ ok: false, error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { entries } = await req.json();

    if (!Array.isArray(entries)) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid entries format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    for (const entry of entries) {
      if (!entry.slug || !entry.title || !entry.date) {
        return new Response(JSON.stringify({ ok: false, error: "Each entry must have slug, title, and date" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const sortedEntries = [...entries].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    const blogData = { entries: sortedEntries, last_updated: new Date().toISOString() };

    const { error } = await supabase
      .from('app_config')
      .upsert({
        key: 'blog',
        value: blogData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    try {
      const { submitToIndexNow } = await import("@/lib/seo/indexnow");
      submitToIndexNow(sortedEntries.map((entry) => `/blog/${entry.slug}`)).catch(() => {});
    } catch {}

    return new Response(JSON.stringify({ ok: true, message: "Blog updated successfully" }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

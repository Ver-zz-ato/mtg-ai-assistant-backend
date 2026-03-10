import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 60;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
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
      blog: blogData
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

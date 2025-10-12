import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Check if user is admin using the is_admin column
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
      
    const isAdmin = !profileError && profile?.is_admin === true;
    
    // Get changelog entries
    const { data: changelog, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'changelog')
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const changelogData = changelog?.value || { entries: [] };

    return new Response(JSON.stringify({ 
      ok: true, 
      changelog: changelogData,
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

    // Check if user is admin using the is_admin column
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

    // Validate entries
    for (const entry of entries) {
      if (!entry.version || !entry.date || !entry.title) {
        return new Response(JSON.stringify({ ok: false, error: "Each entry must have version, date, and title" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    const changelogData = { entries, last_updated: new Date().toISOString() };

    // Upsert the changelog in app_config
    const { error } = await supabase
      .from('app_config')
      .upsert({
        key: 'changelog',
        value: changelogData,
        updated_at: new Date().toISOString()
      });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      message: "Changelog updated successfully" 
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
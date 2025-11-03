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

    // Deduplicate entries before saving (extra safety check)
    const seen = new Set<string>();
    const deduplicatedEntries = entries.filter(entry => {
      const key = `${entry.version}|${entry.date}|${entry.title}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    // Sort by date (newest first) for consistent ordering
    const sortedEntries = [...deduplicatedEntries].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // Descending (newest first)
    });

    const changelogData = { entries: sortedEntries, last_updated: new Date().toISOString() };

    // Upsert the changelog in app_config - use unique constraint on key
    const { error } = await supabase
      .from('app_config')
      .upsert({
        key: 'changelog',
        value: changelogData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key' // Ensure we update, not insert duplicate
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
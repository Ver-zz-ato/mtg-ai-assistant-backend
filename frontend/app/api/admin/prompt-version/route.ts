// Admin endpoint to manage prompt versions for A/B testing
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActivePromptVersion, PROMPT_VERSIONS, type PromptVersion } from "@/lib/config/prompts";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * GET /api/admin/prompt-version
 * 
 * Returns current active prompt version and available versions
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const activeVersion = getActivePromptVersion();
    const versions = Object.keys(PROMPT_VERSIONS).map(key => ({
      ...PROMPT_VERSIONS[key as PromptVersion],
      isActive: key === activeVersion
    }));

    return NextResponse.json({
      ok: true,
      active_version: activeVersion,
      versions,
      note: "To change active version, set ACTIVE_PROMPT_VERSION environment variable or use POST endpoint to update database config"
    });
  } catch (error: any) {
    console.error('[admin/prompt-version] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "Failed to fetch prompt version" 
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/prompt-version
 * 
 * Switch active prompt version (stores in database config for persistence)
 * Body: { version: "deck-ai-v4" }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { version } = body;

    if (!version || typeof version !== 'string') {
      return NextResponse.json({ 
        ok: false, 
        error: "Missing or invalid 'version' parameter" 
      }, { status: 400 });
    }

    // Validate version exists
    if (!(version in PROMPT_VERSIONS)) {
      return NextResponse.json({ 
        ok: false, 
        error: `Invalid version: ${version}. Available versions: ${Object.keys(PROMPT_VERSIONS).join(', ')}` 
      }, { status: 400 });
    }

    const currentVersion = getActivePromptVersion();
    
    // Store in database config for persistence
    // Note: This requires database access. For now, we'll return instructions to set environment variable.
    // In production, you might want to store this in app_config table.
    
    try {
      const admin = await import("@/app/api/_lib/supa").then(m => m.getAdmin());
      if (admin) {
        // Try to store in app_config table
        const { error } = await admin
          .from('app_config')
          .upsert({
            key: 'active_prompt_version',
            value: version,
            updated_at: new Date().toISOString()
          }, { onConflict: 'key' });
        
        if (error) {
          console.warn('[admin/prompt-version] Failed to store in database:', error);
          // Fall through to environment variable note
        } else {
          return NextResponse.json({
            ok: true,
            message: `Prompt version updated from ${currentVersion} to ${version}`,
            previous_version: currentVersion,
            new_version: version,
            note: "Version stored in database. Restart server or set ACTIVE_PROMPT_VERSION environment variable for immediate effect."
          });
        }
      }
    } catch (error) {
      console.warn('[admin/prompt-version] Database storage failed:', error);
    }

    // Fallback: Return instructions for environment variable
    return NextResponse.json({
      ok: true,
      message: `To switch to version ${version}, set ACTIVE_PROMPT_VERSION=${version} environment variable and restart server`,
      previous_version: currentVersion,
      requested_version: version,
      note: "Database storage not available. Set environment variable for persistence."
    });
  } catch (error: any) {
    console.error('[admin/prompt-version] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "Failed to update prompt version" 
    }, { status: 500 });
  }
}


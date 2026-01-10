import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    // CSRF protection: Validate Origin header
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    console.log("🔧 Running scryfall_cache schema migration...");

    // Use safe purpose-built RPC (replaces dangerous exec_sql)
    const { data, error } = await admin.rpc('migrate_cache_schema');
    
    if (error) {
      console.error("❌ Migration RPC failed:", error);
      return NextResponse.json({
        ok: false,
        error: "migration_rpc_failed",
        message: error.message || "Schema migration failed"
      }, { status: 500 });
    }

    const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!result || !result.success) {
      console.error("❌ Migration returned failure:", result?.message);
      return NextResponse.json({
        ok: false,
        error: "migration_failed",
        message: result?.message || "Schema migration failed"
      }, { status: 500 });
    }

    console.log(`✅ ${result.message}`);

    // Log admin action to audit table
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'migrate_cache_schema',
        target: 'scryfall_cache',
        details: {
          columns_added: result.columns_added || [],
          message: result.message
        }
      });
    } catch (auditError) {
      console.error('Failed to log admin audit:', auditError);
      // Don't fail the request if audit logging fails
    }

    // Log security event
    try {
      const { logAdminAction } = await import('@/lib/api/security-events');
      logAdminAction(user.id, 'migrate_cache_schema', 'scryfall_cache', {
        columns_added: result.columns_added || []
      });
    } catch {}

    console.log("✅ Schema migration completed successfully");
    
    return NextResponse.json({ 
      ok: true, 
      message: result.message || "scryfall_cache schema updated successfully",
      columns_added: result.columns_added || [],
      columns_available: ["name", "color_identity", "mana_cost", "oracle_text", "type_line", "cmc", "small", "normal", "art_crop", "updated_at"]
    });

  } catch (error: any) {
    console.error("❌ Schema migration failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "migration_failed" 
    }, { status: 500 });
  }
}
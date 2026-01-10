import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutes for VACUUM

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * ⚠️ SECURITY: This route executes raw SQL via RPC.
 * Admin access required + MFA recommended for admin accounts.
 * CSRF protection applied to prevent cross-site attacks.
 */
export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}`;
    logs.push(logMsg);
    console.log(logMsg);
  };

  try {
    // CSRF protection: Validate Origin header
    const { validateOrigin } = await import('@/lib/api/csrf');
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid origin. This request must come from the same site.' },
        { status: 403 }
      );
    }

    log("Starting VACUUM ANALYZE operation...");

    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      log("ERROR: Unauthorized access attempt");
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    log(`Admin user authenticated: ${user.email}`);

    const admin = getAdmin();
    if (!admin) {
      log("ERROR: Admin client not available");
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const tableName = body.table_name || null; // null means all tables

    log(`Target: ${tableName || 'ALL TABLES'}`);

    // Note: VACUUM ANALYZE requires direct SQL execution
    // Supabase client doesn't support VACUUM directly, so we'll use RPC if available
    // Otherwise, we'll return instructions for manual execution

    if (tableName) {
      log(`Attempting VACUUM ANALYZE on table: ${tableName}...`);
      
      // Use safe purpose-built RPC (replaces dangerous exec_sql)
      try {
        const { data, error } = await admin.rpc('vacuum_analyze_table', {
          target_table: tableName
        });

        if (error) {
          log(`ERROR: RPC vacuum_analyze_table failed: ${error.message}`);
          return NextResponse.json({
            ok: false,
            error: "vacuum_failed",
            message: error.message || "VACUUM ANALYZE failed. Table may not be in whitelist.",
            logs: logs
          }, { status: 500 });
        }

        const result = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (!result || !result.success) {
          log(`WARNING: VACUUM ANALYZE returned failure: ${result?.message || 'Unknown error'}`);
          return NextResponse.json({
            ok: false,
            error: "vacuum_rejected",
            message: result?.message || "Table is not in allowed whitelist",
            logs: logs
          }, { status: 400 });
        }

        log(`✅ VACUUM ANALYZE completed for ${tableName}: ${result.message}`);
      } catch (err: any) {
        log(`ERROR: ${err.message}`);
        return NextResponse.json({
          ok: false,
          error: "vacuum_exception",
          message: err.message || "VACUUM ANALYZE failed with exception",
          logs: logs
        }, { status: 500 });
      }
    } else {
      log("VACUUM ANALYZE on all tables not supported - specify table_name parameter");
      
      return NextResponse.json({
        ok: false,
        error: "table_name_required",
        message: "Please specify a table_name parameter. VACUUM ANALYZE can only be run on individual whitelisted tables for security.",
        allowed_tables: [
          'scryfall_cache',
          'price_snapshots',
          'price_cache',
          'chat_messages',
          'decks',
          'deck_cards',
          'profiles',
          'profiles_public',
          'api_usage_rate_limits',
          'guest_sessions',
          'admin_audit'
        ],
        logs: logs
      }, { status: 400 });
    }

    // Log to admin_audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'vacuum_analyze',
        target: tableName || 'all_tables',
        details: `VACUUM ANALYZE executed`
      });
    } catch (auditError) {
      log(`WARNING: Failed to log to admin_audit: ${auditError}`);
    }

    return NextResponse.json({
      ok: true,
      table_name: tableName || 'all_tables',
      message: "VACUUM ANALYZE completed (or requires manual SQL execution)",
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("VACUUM ANALYZE error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "vacuum_failed",
      logs: logs
    }, { status: 500 });
  }
}


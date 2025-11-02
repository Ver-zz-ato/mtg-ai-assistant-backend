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

export async function POST(req: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}`;
    logs.push(logMsg);
    console.log(logMsg);
  };

  try {
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
      log("NOTE: Supabase client may not support VACUUM - this may need to be run manually via SQL editor");
      
      // Try via RPC if available
      try {
        const { data, error } = await admin.rpc('exec_sql', {
          sql: `VACUUM ANALYZE ${tableName};`
        });

        if (error) {
          log(`WARNING: RPC exec_sql not available or failed: ${error.message}`);
          log("This operation requires direct SQL access - use Supabase SQL Editor");
          return NextResponse.json({
            ok: false,
            error: "vacuum_requires_sql_editor",
            message: "VACUUM ANALYZE requires direct SQL access. Please run this manually in Supabase SQL Editor.",
            sql_command: `VACUUM ANALYZE ${tableName};`,
            logs: logs
          });
        }

        log(`✅ VACUUM ANALYZE completed for ${tableName}`);
      } catch (err: any) {
        log(`ERROR: ${err.message}`);
        return NextResponse.json({
          ok: false,
          error: "vacuum_not_supported",
          message: "VACUUM ANALYZE requires direct SQL access. Please run this manually in Supabase SQL Editor.",
          sql_command: `VACUUM ANALYZE ${tableName};`,
          logs: logs
        });
      }
    } else {
      log("Attempting VACUUM ANALYZE on all tables...");
      log("NOTE: This requires direct SQL access - instructions provided");
      
      return NextResponse.json({
        ok: false,
        error: "vacuum_requires_sql_editor",
        message: "VACUUM ANALYZE requires direct SQL access. Please run this manually in Supabase SQL Editor.",
        sql_command: "VACUUM ANALYZE;",
        recommended_tables: [
          'scryfall_cache',
          'price_snapshots',
          'price_cache',
          'chat_messages',
          'decks',
          'deck_cards'
        ],
        instructions: "Run VACUUM ANALYZE on individual tables via Supabase SQL Editor for better control",
        logs: logs
      });
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


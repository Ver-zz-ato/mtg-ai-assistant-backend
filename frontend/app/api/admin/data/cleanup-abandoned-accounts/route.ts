import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    log("Finding abandoned accounts...");

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
    const action = body.action || 'find'; // 'find' or 'delete'
    const inactiveDays = parseInt(body.inactive_days || "365", 10);

    log(`Action: ${action}`);
    log(`Inactive threshold: ${inactiveDays} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
    const cutoffDateStr = cutoffDate.toISOString();

    log(`Cutoff date: ${cutoffDateStr} (accounts with last_sign_in_at before this date)`);

    // Find abandoned accounts - check auth.users.last_sign_in_at
    // Note: We need to check auth.users via admin API, not via table query
    log("Querying auth.users for inactive accounts...");
    
    // Get all users and check their last_sign_in_at
    // Note: Supabase Admin API may not support filtering by last_sign_in_at directly
    // We'll need to fetch and filter client-side
    
    const { data: allUsers, error: usersError } = await admin.auth.admin.listUsers();

    if (usersError) {
      log(`ERROR: Failed to list users: ${usersError.message}`);
      throw new Error(`List users failed: ${usersError.message}`);
    }

    log(`Found ${allUsers.users?.length || 0} total users`);

    // Filter abandoned accounts
    const abandonedAccounts = (allUsers.users || []).filter((u: any) => {
      const lastSignIn = u.last_sign_in_at ? new Date(u.last_sign_in_at) : null;
      if (!lastSignIn) return true; // Never signed in counts as abandoned
      return lastSignIn < cutoffDate;
    });

    log(`Found ${abandonedAccounts.length} abandoned accounts (inactive for ${inactiveDays}+ days)`);

    // Get account details for preview
    const accountDetails = abandonedAccounts.slice(0, 50).map((u: any) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || 'Never',
      email_confirmed: u.email_confirmed_at ? true : false
    }));

    if (action === 'find') {
      log("Preview mode - showing abandoned accounts (first 50)");
      return NextResponse.json({
        ok: true,
        action: 'find',
        total_abandoned: abandonedAccounts.length,
        inactive_days_threshold: inactiveDays,
        cutoff_date: cutoffDateStr,
        account_preview: accountDetails,
        message: abandonedAccounts.length > 0 
          ? `Found ${abandonedAccounts.length} abandoned accounts. Use action='delete' to remove them.`
          : "No abandoned accounts found",
        logs: logs
      });
    }

    // action === 'delete'
    if (abandonedAccounts.length === 0) {
      log("No abandoned accounts to delete");
      return NextResponse.json({
        ok: true,
        action: 'delete',
        deleted: 0,
        message: "No abandoned accounts found",
        logs: logs
      });
    }

    log(`⚠️ WARNING: About to delete ${abandonedAccounts.length} abandoned accounts`);
    log("This action cannot be undone!");

    // Delete accounts one by one (Supabase Admin API requirement)
    let deletedCount = 0;
    let errorCount = 0;

    for (const account of abandonedAccounts) {
      try {
        const { error: deleteError } = await admin.auth.admin.deleteUser(account.id);
        if (deleteError) {
          log(`  ERROR deleting ${account.email}: ${deleteError.message}`);
          errorCount++;
        } else {
          deletedCount++;
          if (deletedCount % 10 === 0) {
            log(`  Deleted ${deletedCount}/${abandonedAccounts.length} accounts...`);
          }
        }
      } catch (err: any) {
        log(`  ERROR deleting ${account.email}: ${err.message}`);
        errorCount++;
      }
    }

    log(`✅ Deletion complete: ${deletedCount} deleted, ${errorCount} errors`);

    // Log to admin_audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'cleanup_abandoned_accounts',
        target: 'auth.users',
        details: `Deleted ${deletedCount} abandoned accounts (inactive ${inactiveDays}+ days)`
      });
    } catch (auditError) {
      log(`WARNING: Failed to log to admin_audit: ${auditError}`);
    }

    return NextResponse.json({
      ok: true,
      action: 'delete',
      total_found: abandonedAccounts.length,
      deleted: deletedCount,
      errors: errorCount,
      inactive_days_threshold: inactiveDays,
      cutoff_date: cutoffDateStr,
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Abandoned accounts cleanup error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "cleanup_failed",
      logs: logs
    }, { status: 500 });
  }
}


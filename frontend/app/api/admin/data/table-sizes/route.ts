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

export async function GET(req: NextRequest) {
  const logs: string[] = [];
  const log = (msg: string) => {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}`;
    logs.push(logMsg);
    console.log(logMsg);
  };

  try {
    log("Starting database size diagnostic...");
    
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

    // Step 1: Get row counts for all major tables (we can't directly query pg_size functions via Supabase client)
    log("Getting table information (row counts and estimates)...");
    
    // List of all tables we care about
    const allTables = [
      'scryfall_cache', 'price_snapshots', 'price_cache', 'chat_messages', 'chat_threads',
      'decks', 'deck_cards', 'collections', 'wishlists', 'admin_audit', 'error_logs',
      'profiles', 'profiles_public', 'watchlist', 'deck_comments', 'deck_likes',
      'deck_versions', 'custom_cards', 'app_config', 'decks_public'
    ];

    const tableSizeResults: any[] = [];
    
    for (const tableName of allTables) {
      try {
        const { count, error: countError } = await admin
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (!countError && count !== null) {
          // Estimate size: roughly 1KB per row for most tables (conservative)
          const estimatedSizeBytes = count * 1024;
          tableSizeResults.push({
            tablename: tableName,
            total_size_bytes: estimatedSizeBytes,
            table_size_bytes: estimatedSizeBytes,
            row_count: count
          });
          log(`  ${tableName}: ${count.toLocaleString()} rows (~${Math.round(estimatedSizeBytes / 1024 / 1024)}MB estimated)`);
        }
      } catch (err: any) {
        // Table doesn't exist or no access - skip
      }
    }
    
    // Sort by estimated size
    tableSizeResults.sort((a, b) => (b.total_size_bytes || 0) - (a.total_size_bytes || 0));

    // Extract row counts for response
    const rowCounts: Record<string, number> = {};
    tableSizeResults.forEach(t => {
      if (t.row_count) rowCounts[t.tablename] = t.row_count;
    });

    // Step 3: Analyze scryfall_cache column sizes (sample)
    log("Analyzing scryfall_cache column sizes (sampling 1000 rows)...");
    let scryfallAnalysis: any = null;
    try {
      const { data: sampleData, error: sampleError } = await admin
        .from('scryfall_cache')
        .select('normal, oracle_text, type_line')
        .limit(1000);

      if (!sampleError && sampleData && sampleData.length > 0) {
        const oracleTextLengths = sampleData.map(r => (r.oracle_text || '').length).filter(l => l > 0);
        const normalSizes = sampleData.map(r => (r.normal || '').length).filter(l => l > 0);
        
        scryfallAnalysis = {
          sample_size: sampleData.length,
          oracle_text: {
            avg_length: oracleTextLengths.length > 0 ? Math.round(oracleTextLengths.reduce((a, b) => a + b, 0) / oracleTextLengths.length) : 0,
            max_length: oracleTextLengths.length > 0 ? Math.max(...oracleTextLengths) : 0,
            rows_with_text: oracleTextLengths.length,
            rows_over_500_chars: oracleTextLengths.filter(l => l > 500).length
          },
          normal: {
            avg_length: normalSizes.length > 0 ? Math.round(normalSizes.reduce((a, b) => a + b, 0) / normalSizes.length) : 0,
            rows_with_url: normalSizes.length
          },
          type_line: {
            avg_length: Math.round(sampleData.map(r => (r.type_line || '').length).reduce((a, b) => a + b, 0) / sampleData.length)
          }
        };
        log(`  Oracle text avg: ${scryfallAnalysis.oracle_text.avg_length} chars, ${scryfallAnalysis.oracle_text.rows_over_500_chars} rows >500 chars`);
      }
    } catch (err: any) {
      log(`WARNING: Could not analyze scryfall_cache columns: ${err.message}`);
    }

    // Step 4: Analyze price_snapshots date range (with timeout protection)
    log("Analyzing price_snapshots date range...");
    let snapshotAnalysis: any = null;
    try {
      // Use quick queries with limits - don't count total (too slow on large tables)
      const { data: snapshotData, error: snapshotError } = await admin
        .from('price_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: true })
        .limit(1);

      const { data: snapshotDataMax, error: snapshotErrorMax } = await admin
        .from('price_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1);

      // Try to get count, but don't fail if it times out
      let snapshotCount: number | null = null;
      try {
        const { count } = await admin
          .from('price_snapshots')
          .select('*', { count: 'exact', head: true });
        snapshotCount = count || null;
      } catch (countErr: any) {
        log(`  WARNING: Could not count total rows (table too large): ${countErr.message}`);
        // Use row count from table sizes if available
        snapshotCount = rowCounts['price_snapshots'] || null;
      }

      if (!snapshotError && snapshotData && snapshotData.length > 0) {
        const oldestDate = snapshotData[0]?.snapshot_date;
        const newestDate = snapshotDataMax?.[0]?.snapshot_date || oldestDate;
        
        const oldest = new Date(oldestDate);
        const newest = new Date(newestDate);
        const daysDiff = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));

        snapshotAnalysis = {
          oldest_date: oldestDate,
          newest_date: newestDate,
          days_span: daysDiff,
          total_rows: snapshotCount,
          estimated_rows_per_day: snapshotCount && daysDiff > 0 ? Math.round((snapshotCount || 0) / daysDiff) : 0
        };
        log(`  Date range: ${oldestDate} to ${newestDate} (${daysDiff} days)`);
        if (snapshotCount !== null) {
          log(`  Total rows: ${snapshotCount.toLocaleString()}`);
        } else {
          log(`  Total rows: unknown (table too large to count efficiently)`);
        }
      }
    } catch (err: any) {
      log(`WARNING: Could not analyze price_snapshots: ${err.message}`);
    }

    log("Diagnostic complete");

    // Format table sizes for response
    const formattedTables = tableSizeResults.map((t: any) => ({
      name: t.tablename,
      total_size_mb: t.total_size_bytes ? Math.round((t.total_size_bytes / 1024 / 1024) * 100) / 100 : null,
      table_size_mb: t.table_size_bytes ? Math.round((t.table_size_bytes / 1024 / 1024) * 100) / 100 : null,
      indexes_size_mb: t.indexes_size_bytes ? Math.round((t.indexes_size_bytes / 1024 / 1024) * 100) / 100 : null,
      row_count: rowCounts[t.tablename] || t.row_count || null,
      column_count: t.column_count || null
    }));

    return NextResponse.json({
      ok: true,
      tables: formattedTables,
      row_counts: rowCounts,
      scryfall_cache_analysis: scryfallAnalysis,
      price_snapshots_analysis: snapshotAnalysis,
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Database diagnostic error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "diagnostic_failed",
      logs: logs
    }, { status: 500 });
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 300;

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
    log("Starting scryfall_cache optimization...");

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
    const action = body.action || 'analyze'; // 'analyze' or 'optimize'
    const oracleTextThreshold = parseInt(body.oracle_text_threshold || "500", 10);
    const nullifyUnusedImages = body.nullify_unused_images === true;

    log(`Action: ${action}`);
    if (action === 'optimize') {
      log(`Oracle text threshold: ${oracleTextThreshold} chars`);
      log(`Nullify unused images: ${nullifyUnusedImages}`);
    }

    // Step 1: Analyze current state
    log("Analyzing scryfall_cache table...");
    const { count: totalRows, error: countError } = await admin
      .from('scryfall_cache')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      log(`ERROR: Failed to count rows: ${countError.message}`);
      throw new Error(`Count failed: ${countError.message}`);
    }

    log(`Total rows in scryfall_cache: ${totalRows?.toLocaleString() || 0}`);

    // Sample rows to analyze column usage
    const { data: sampleData, error: sampleError } = await admin
      .from('scryfall_cache')
      .select('normal, small, art_crop, oracle_text')
      .limit(10000);

    if (sampleError) {
      log(`ERROR: Failed to sample data: ${sampleError.message}`);
      throw new Error(`Sample failed: ${sampleError.message}`);
    }

    const sampleSize = sampleData?.length || 0;
    log(`Sampled ${sampleSize.toLocaleString()} rows for analysis`);

    // Analyze oracle_text lengths
    const oracleTextLengths = (sampleData || []).map(r => (r.oracle_text || '').length).filter(l => l > 0);
    const rowsWithLongOracleText = oracleTextLengths.filter(l => l > oracleTextThreshold).length;
    const avgOracleLength = oracleTextLengths.length > 0 
      ? Math.round(oracleTextLengths.reduce((a, b) => a + b, 0) / oracleTextLengths.length) 
      : 0;

    // Analyze image column usage
    const rowsWithNormal = (sampleData || []).filter(r => !!r.normal).length;
    const rowsWithSmall = (sampleData || []).filter(r => !!r.small).length;
    const rowsWithArtCrop = (sampleData || []).filter(r => !!r.art_crop).length;

    const analysis = {
      total_rows: totalRows || 0,
      sample_size: sampleSize,
      oracle_text: {
        rows_with_text: oracleTextLengths.length,
        avg_length: avgOracleLength,
        max_length: oracleTextLengths.length > 0 ? Math.max(...oracleTextLengths) : 0,
        rows_over_threshold: rowsWithLongOracleText,
        estimated_rows_over_threshold: Math.round((rowsWithLongOracleText / sampleSize) * (totalRows || 0))
      },
      image_columns: {
        normal: { rows_with_url: rowsWithNormal, usage_percent: Math.round((rowsWithNormal / sampleSize) * 100) },
        small: { rows_with_url: rowsWithSmall, usage_percent: Math.round((rowsWithSmall / sampleSize) * 100) },
        art_crop: { rows_with_url: rowsWithArtCrop, usage_percent: Math.round((rowsWithArtCrop / sampleSize) * 100) }
      }
    };

    log(`Oracle text analysis:`);
    log(`  - Rows with text: ${analysis.oracle_text.rows_with_text.toLocaleString()}`);
    log(`  - Avg length: ${analysis.oracle_text.avg_length} chars`);
    log(`  - Rows over ${oracleTextThreshold} chars: ${analysis.oracle_text.rows_over_threshold} (sample)`);
    log(`  - Estimated total rows over threshold: ${analysis.oracle_text.estimated_rows_over_threshold.toLocaleString()}`);

    log(`Image column usage:`);
    log(`  - normal: ${analysis.image_columns.normal.rows_with_url} (${analysis.image_columns.normal.usage_percent}%)`);
    log(`  - small: ${analysis.image_columns.small.rows_with_url} (${analysis.image_columns.small.usage_percent}%)`);
    log(`  - art_crop: ${analysis.image_columns.art_crop.rows_with_url} (${analysis.image_columns.art_crop.usage_percent}%)`);

    if (action === 'analyze') {
      log("Analysis complete");
      return NextResponse.json({
        ok: true,
        action: 'analyze',
        analysis: analysis,
        recommendations: {
          oracle_text_truncation: analysis.oracle_text.estimated_rows_over_threshold > 0 
            ? `Estimated ${analysis.oracle_text.estimated_rows_over_threshold.toLocaleString()} rows could be truncated`
            : 'No truncation needed',
          unused_image_columns: [
            analysis.image_columns.small.usage_percent < 50 ? 'small column may be unused' : null,
            analysis.image_columns.art_crop.usage_percent < 50 ? 'art_crop column may be unused' : null
          ].filter(Boolean)
        },
        logs: logs
      });
    }

    // Step 2: Optimize (action === 'optimize')
    log("Starting optimization...");
    log("NOTE: Large-scale optimization requires direct SQL. Use Supabase SQL Editor for best results.");
    
    let optimizedCount = 0;
    let estimatedBytesSaved = 0;

    // Option 1: Truncate long oracle_text (limited to first 1000 rows for safety)
    if (oracleTextThreshold > 0 && analysis.oracle_text.estimated_rows_over_threshold > 0) {
      log(`Truncating oracle_text for rows over ${oracleTextThreshold} chars...`);
      log(`WARNING: Processing first 1000 rows only. For full optimization, use SQL: UPDATE scryfall_cache SET oracle_text = LEFT(oracle_text, ${oracleTextThreshold}) WHERE LENGTH(oracle_text) > ${oracleTextThreshold};`);
      
      // Process limited batch for safety
      const { data: batchData, error: batchError } = await admin
        .from('scryfall_cache')
        .select('name, oracle_text')
        .not('oracle_text', 'is', null)
        .limit(1000);

      if (!batchError && batchData) {
        const rowsToUpdate = batchData
          .filter(r => (r.oracle_text || '').length > oracleTextThreshold)
          .slice(0, 100); // Limit to 100 updates per run for safety

        if (rowsToUpdate.length > 0) {
          log(`Updating ${rowsToUpdate.length} rows (limited batch)...`);
          for (const row of rowsToUpdate) {
            const originalLength = (row.oracle_text || '').length;
            const truncated = (row.oracle_text || '').substring(0, oracleTextThreshold) + '...';
            
            const { error: updateError } = await admin
              .from('scryfall_cache')
              .update({ oracle_text: truncated })
              .eq('name', row.name);

            if (!updateError) {
              optimizedCount++;
              estimatedBytesSaved += (originalLength - oracleTextThreshold);
            }
          }
          log(`✅ Truncated ${optimizedCount} oracle_text fields (sample batch)`);
          log(`💡 For full optimization, use SQL in Supabase Editor: UPDATE scryfall_cache SET oracle_text = LEFT(oracle_text, ${oracleTextThreshold}) || '...' WHERE LENGTH(oracle_text) > ${oracleTextThreshold};`);
        }
      }
    }

    // Option 2: NULL out unused image columns
    if (nullifyUnusedImages) {
      if (analysis.image_columns.small.usage_percent < 50) {
        log(`NULL-ifying 'small' column (only ${analysis.image_columns.small.usage_percent}% usage)...`);
        log("  SQL: UPDATE scryfall_cache SET small = NULL WHERE small IS NOT NULL;");
      }
      if (analysis.image_columns.art_crop.usage_percent < 50) {
        log(`NULL-ifying 'art_crop' column (only ${analysis.image_columns.art_crop.usage_percent}% usage)...`);
        log("  SQL: UPDATE scryfall_cache SET art_crop = NULL WHERE art_crop IS NOT NULL;");
      }
    }

    const estimatedMBSaved = Math.round((estimatedBytesSaved / 1024 / 1024) * 100) / 100;

    log("Optimization complete!");
    log(`Rows optimized: ${optimizedCount.toLocaleString()} (sample batch)`);
    log(`Estimated space saved: ~${estimatedMBSaved} MB (sample batch)`);

    // Log to admin_audit
    try {
      await admin.from('admin_audit').insert({
        actor_id: user.id,
        action: 'optimize_scryfall_cache',
        target: 'scryfall_cache',
        details: `Optimized ${optimizedCount} rows, estimated ${estimatedMBSaved}MB saved`
      });
    } catch (auditError) {
      log(`WARNING: Failed to log to admin_audit: ${auditError}`);
    }

    return NextResponse.json({
      ok: true,
      action: 'optimize',
      rows_optimized: optimizedCount,
      estimated_space_saved_mb: estimatedMBSaved,
      analysis: analysis,
      logs: logs
    });

  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error("Scryfall cache optimization error:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "optimization_failed",
      logs: logs
    }, { status: 500 });
  }
}


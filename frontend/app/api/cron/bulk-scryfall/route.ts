import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { markAdminJobAttempt, persistAdminJobRun } from "@/lib/admin/adminJobRunLog";
import type { AdminJobDetail } from "@/lib/admin/adminJobDetail";
import { Readable, type Transform } from "node:stream";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/StreamArray";

const JOB_ID = "bulk_scryfall";
import {
  buildScryfallCacheRowFromApiCard,
  normalizeScryfallCacheName,
} from "@/lib/server/scryfallCacheRow";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic'; // Force dynamic rendering
export const maxDuration = 600; // Allowed on Pro Node runtime for 10-min jobs

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-cron-key',
    },
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Bulk Scryfall Import API",
    method: "Use POST with x-cron-key header to trigger import",
    status: "Ready"
  });
}

interface ScryfallCard {
  name: string;
  type_line?: string;
  oracle_text?: string;
  color_identity?: string[];
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  rarity?: string;
  set?: string;
  collector_number?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    art_crop?: string;
  };
  card_faces?: Array<{
    oracle_text?: string;
    image_uris?: {
      small?: string;
      normal?: string;
      art_crop?: string;
    };
  }>;
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  console.log("🔥 Bulk import endpoint called");
  
  let actor: string | null = null; // Declare actor at function scope
  
  try {
    // Authentication for cron job (similar to other cron routes)
    const cronKeyHeader = req.headers.get("x-cron-key") || "";
    const vercelId = req.headers.get("x-vercel-id"); // Vercel automatically adds this
    const url = new URL(req.url);
    const cronKeyQuery = url.searchParams.get("key") || "";
    
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    
    // Allow if:
    // 1. Request has x-vercel-id (from Vercel cron) - trusted if coming from Vercel
    // 2. x-cron-key header matches CRON_KEY (for external/manual triggers)
    // 3. key query parameter matches CRON_KEY (alternative for manual triggers)
    const isFromVercel = !!vercelId;
    const hasValidHeader = cronKey && cronKeyHeader === cronKey;
    const hasValidQuery = cronKey && cronKeyQuery === cronKey;
    
    let useAdmin = false;

    if (isFromVercel || hasValidHeader || hasValidQuery) {
      useAdmin = true;
      actor = 'cron';
      console.log("✅ Cron auth successful", { isFromVercel, hasValidHeader, hasValidQuery });
    }
    if (!useAdmin) {
      console.log("🔍 Trying admin user auth...");
      try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          actor = user.id as string;
          console.log("✅ Admin user auth successful");
        }
      } catch (authError: any) {
        console.log("❌ User auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      console.log("❌ Authorization failed", { 
        hasVercelId: !!vercelId,
        hasCronKeyHeader: !!cronKeyHeader,
        hasQueryKey: !!cronKeyQuery,
        cronKeySet: !!cronKey
      });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("🚀 Authorization successful, starting import...");
  } catch (setupError: any) {
    console.error("💥 Setup error:", setupError);
    return NextResponse.json({ 
      ok: false, 
      error: "setup_failed",
      details: setupError.message 
    }, { status: 500 });
  }

  try {
    console.log("🚀 Starting bulk Scryfall import...");
    const startTime = Date.now();
    const attemptStartedAt = new Date().toISOString();

    // Check if this is a test run (quick validation)
    const testMode = req.headers.get('x-test-mode') === 'true';
    if (testMode) {
      console.log("🧪 Test mode - validating connections only");
      
      // Test database connection
      const admin = getAdmin();
      if (!admin) {
        throw new Error("Admin client not available");
      }
      
      const { data, error } = await admin.from('scryfall_cache').select('name').limit(1);
      if (error) {
        throw new Error(`Database test failed: ${error.message}`);
      }
      
      return NextResponse.json({ 
        ok: true, 
        test_mode: true,
        database_ok: true,
        sample_cache_entries: data?.length || 0,
        message: "Test successful - ready for full import"
      });
    }

    {
      const m = getAdmin();
      if (m) await markAdminJobAttempt(m, JOB_ID);
    }

    // Check if we should use streaming mode (recommended)
    const useStreaming = req.headers.get('x-use-streaming') !== 'false'; // Default to true
    console.log(`🌊 Using streaming mode: ${useStreaming}`);
    
    // Chunk parameters (used by both modes). Defaults match the old "chunked import" behavior.
    const chunkStart = parseInt(req.headers.get('x-chunk-start') || '0');
    const chunkSize = parseInt(req.headers.get('x-chunk-size') || '5000');
    
    if (!useStreaming) {
      console.log(`🔧 Legacy chunk mode: ${chunkStart} to ${chunkStart + chunkSize}`);
    }

    let cards: ScryfallCard[] = [];
    let allCardsLength = 0;
    let isLastChunk = true;

    if (useStreaming) {
      // NEW: Streaming approach - process cards directly from API without downloading huge file
      console.log("🌊 Using streaming bulk import (recommended)");
      
      // Get the bulk data URL
      console.log("📥 Getting Scryfall bulk data URL...");
      const bulkResponse = await fetch("https://api.scryfall.com/bulk-data");
      if (!bulkResponse.ok) {
        throw new Error(`Failed to fetch bulk data: ${bulkResponse.status} ${bulkResponse.statusText}`);
      }
      const bulkData = await bulkResponse.json();
      
      const defaultCardsUrl = bulkData.data.find((item: any) => item.type === "default_cards")?.download_uri;
      if (!defaultCardsUrl) {
        throw new Error("Could not find default_cards bulk data URL");
      }

      console.log("🌊 Downloading all card data from Scryfall (streaming JSON array)...");
      
      const streamResponse = await fetch(defaultCardsUrl);
      if (!streamResponse.ok) {
        throw new Error(`Failed to download cards: ${streamResponse.status} ${streamResponse.statusText}`);
      }

      if (!streamResponse.body) {
        throw new Error("Scryfall response has no body to stream");
      }

      // Scryfall bulk files are a huge JSON array. Use stream-json to parse it
      // efficiently and only keep the requested chunk.
      const nodeStream = Readable.fromWeb(streamResponse.body as any);
      const chunkEndExclusive = chunkStart + chunkSize;
      let seen = 0;

      await new Promise<void>((resolve, reject) => {
        const p = parser() as Transform;
        const a = streamArray() as Transform;

        const stopEarly = () => {
          try {
            nodeStream.destroy();
          } catch {
            /* ignore */
          }
          try {
            p.destroy();
          } catch {
            /* ignore */
          }
          try {
            a.destroy();
          } catch {
            /* ignore */
          }
        };

        a.on("data", ({ key, value }: { key: number; value: ScryfallCard }) => {
          seen = key + 1;
          if (key >= chunkStart && key < chunkEndExclusive) {
            cards.push(value);
          }
          if (seen >= chunkEndExclusive) {
            isLastChunk = false;
            stopEarly();
            resolve();
          }
        });

        a.on("end", () => {
          isLastChunk = true;
          resolve();
        });

        a.on("error", reject);
        p.on("error", reject);
        nodeStream.on("error", reject);

        nodeStream.pipe(p).pipe(a);
      });

      allCardsLength = 0; // unknown without reading full stream
      console.log(
        `🌊 Streamed chunk: start=${chunkStart} size=${chunkSize} -> parsed=${cards.length} (seen=${seen}) lastChunk=${isLastChunk}`,
      );
    } else {
      // LEGACY: Chunked approach (fallback)
      console.log("🔄 Using legacy chunked mode");
      
      const bulkResponse = await fetch("https://api.scryfall.com/bulk-data");
      if (!bulkResponse.ok) {
        throw new Error(`Failed to fetch bulk data: ${bulkResponse.status} ${bulkResponse.statusText}`);
      }
      const bulkData = await bulkResponse.json();
      
      const defaultCardsUrl = bulkData.data.find((item: any) => item.type === "default_cards")?.download_uri;
      if (!defaultCardsUrl) {
        throw new Error("Could not find default_cards bulk data URL");
      }

      console.log("📰 Fetching card data from:", defaultCardsUrl);
      const cardsResponse = await fetch(defaultCardsUrl);
      if (!cardsResponse.ok) {
        throw new Error(`Failed to fetch cards: ${cardsResponse.status} ${cardsResponse.statusText}`);
      }
      const allCards: ScryfallCard[] = await cardsResponse.json();
      allCardsLength = allCards.length;
      
      // Extract only the chunk we need to process
      cards = allCards.slice(chunkStart, chunkStart + chunkSize);
      isLastChunk = (chunkStart + chunkSize) >= allCards.length;
      
      console.log(`🔧 Legacy chunk ${chunkStart}-${chunkStart + chunkSize} (${cards.length} cards) of ${allCardsLength} total. Last chunk: ${isLastChunk}`);
    }

    // 2. Verify database schema first
    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Test schema with a small sample first
    console.log("🔍 Verifying database schema...");
    try {
      const testCard = cards[0];
      if (testCard) {
        const testRow = buildScryfallCacheRowFromApiCard(testCard as unknown as Record<string, unknown>, {
          source: "bulk-scryfall schema probe",
        });
        if (!testRow) {
          console.warn("⚠️ Schema test skipped: buildScryfallCacheRowFromApiCard returned null");
        } else {
          const { error: schemaError } = await admin
            .from('scryfall_cache')
            .upsert([testRow], { onConflict: 'name' });

          if (schemaError) {
            console.warn("⚠️ Schema validation failed, using basic fields only:", schemaError.message);
          } else {
            console.log("✅ Schema validation passed");
          }
        }
      }
    } catch (schemaError: any) {
      console.warn("⚠️ Schema test failed, proceeding with basic fields:", schemaError.message);
    }

    const BATCH_SIZE = 500; // Smaller batches to prevent timeouts
    let processed = 0;
    let inserted = 0;
    let errors = 0;
    let uniqueNamesInBatches = new Set<string>(); // Track all unique normalized names we're trying to upsert

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      
      // Use a Map to deduplicate by normalized name within this batch
      const rowMap = new Map<string, any>();
      
      for (const card of batch) {
        // Skip cards without names
        if (!card.name) continue;

        const row = buildScryfallCacheRowFromApiCard(card as unknown as Record<string, unknown>, {
          source: "bulk-scryfall",
        });
        if (!row) continue;

        const normalizedName = normalizeScryfallCacheName(String(card.name));
        
        // Only keep the first occurrence of each card name in this batch
        // This prevents "ON CONFLICT DO UPDATE command cannot affect row a second time"
        if (!rowMap.has(normalizedName)) {
          rowMap.set(normalizedName, row);
          uniqueNamesInBatches.add(normalizedName);
        }
      }
      
      // Convert Map back to array
      const rows = Array.from(rowMap.values());

      if (rows.length > 0) {
        try {
          // Use a more robust upsert approach
          const { error, count } = await admin
            .from('scryfall_cache')
            .upsert(rows, { 
              onConflict: 'name',
              ignoreDuplicates: false,
              defaultToNull: false
            });

          if (error) {
            console.error(`❌ Batch ${i}-${i + BATCH_SIZE} failed:`, error.message);
            console.error(`Sample failing row:`, JSON.stringify(rows[0], null, 2));
            errors++;
            
            // If too many consecutive errors, stop (schema issue)
            if (errors >= 5) {
              console.error("🛑 Too many consecutive errors, stopping bulk import. Please check database schema.");
              break;
            }
          } else {
            const actualInserted = count || rows.length;
            inserted += actualInserted;
            errors = 0; // Reset error counter on success
            
            // Log progress every 10 batches
            if (Math.floor(i / BATCH_SIZE) % 10 === 0) {
              console.log(`⚡ Progress: ${inserted}/${cards.length} (${Math.round(inserted/cards.length*100)}%)`);
            }
            
            // Verify the data was actually inserted by checking a sample
            if (Math.floor(i / BATCH_SIZE) === 0) {
              const { data: verifyData, error: verifyError } = await admin
                .from('scryfall_cache')
                .select('name')
                .eq('name', rows[0].name)
                .maybeSingle();
              
              if (verifyError || !verifyData) {
                console.warn(`⚠️ Verification failed for first batch - data may not be persisting`);
                console.warn(`Verify error:`, verifyError?.message);
                console.warn(`Sample row name:`, rows[0].name);
              } else {
                console.log(`✅ Verification passed - data is being persisted correctly`);
              }
            }
          }
        } catch (batchError: any) {
          console.error(`❌ Batch ${i}-${i + BATCH_SIZE} exception:`, batchError.message);
          errors++;
        }
        
        processed += batch.length;
      }
    }

    // 3. Record completion (job:last + detail handled by persistAdminJobRun when we log this chunk)
    try {
      // Update completion status if this is the final chunk
      if (isLastChunk) {
        await admin.from('app_config').upsert(
          { key: 'bulk_import_status', value: 'completed' }, 
          { onConflict: 'key' }
        );
        console.log("✅ Bulk import session completed!");
      }
      
      // Audit log
      await admin.from('admin_audit').insert({ 
        actor_id: actor || 'cron', 
        action: 'bulk_scryfall_chunk', 
        target: inserted,
        details: `chunk_${chunkStart}-${chunkStart + chunkSize}${isLastChunk ? '_final' : ''}` 
      });
    } catch (auditError) {
      console.warn("⚠️ Audit logging failed:", auditError);
    }

    // Final verification - check actual database state
    let finalCount: number | null = null;
    let imageCount = 0;
    try {
      // Get actual count of all entries
      const { count, error: countError } = await admin
        .from('scryfall_cache')
        .select('name', { count: 'exact', head: true });
        
      if (countError) {
        console.warn(`⚠️ Could not verify final cache state:`, countError.message);
      } else {
        finalCount = count || 0;
        console.log(`📊 Final cache verification: ${finalCount.toLocaleString()} total entries in cache`);
      }

      // Also check how many entries have images
      const { count: imageCountResult, error: imageCountError } = await admin
        .from('scryfall_cache')
        .select('name', { count: 'exact', head: true })
        .not('normal', 'is', null);
        
      if (!imageCountError && imageCountResult) {
        imageCount = imageCountResult;
        const imagePercentage = finalCount ? Math.round((imageCount / finalCount) * 100) : 0;
        console.log(`🖼️  Image verification: ${imageCount.toLocaleString()} entries have images (${imagePercentage}%)`);
      }
    } catch (verifyError: any) {
      console.warn(`⚠️ Could not verify final cache state:`, verifyError.message);
    }

    const cardsWithImages = cards.filter(c => 
      c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal
    ).length;
    const uniqueNormalizedNames = uniqueNamesInBatches.size;

    console.log(`\n📊 Import Summary:`);
    console.log(`   • Raw cards downloaded: ${cards.length.toLocaleString()}`);
    console.log(`   • Cards processed: ${processed.toLocaleString()}`);
    console.log(`   • Unique normalized names attempted: ${uniqueNormalizedNames.toLocaleString()}`);
    console.log(`   • Rows upserted (batches): ${inserted.toLocaleString()}`);
    console.log(`   • Final cache entries (actual): ${finalCount?.toLocaleString() || 'unknown'}`);
    console.log(`\n💡 Note: Multiple printings of the same card normalize to the same name, so`);
    console.log(`   upserts update existing rows. The final count represents unique card names.`);
    console.log(`\n📈 Image coverage: ${cardsWithImages.toLocaleString()}/${cards.length.toLocaleString()} cards had images (${Math.round(cardsWithImages / cards.length * 100)}%)`);

    const shouldPersist = useStreaming || isLastChunk;
    if (shouldPersist) {
      const finishedAt = new Date().toISOString();
      const durationMs = Date.now() - new Date(attemptStartedAt).getTime();
      const warnings: string[] = [];
      if (errors > 0) warnings.push(`${errors} batch upsert error(s) — see server logs`);
      const chunkLabel = useStreaming
        ? "full streaming import"
        : `legacy chunk ${chunkStart}-${chunkStart + chunkSize}${isLastChunk ? " (final)" : ""}`;
      const detail: AdminJobDetail = {
        jobId: JOB_ID,
        attemptStartedAt,
        finishedAt,
        ok: true,
        runResult: errors > 0 ? "partial" : "success",
        compactLine: `${chunkLabel}: ${inserted.toLocaleString()} rows upserted · ~${finalCount?.toLocaleString() ?? "?"} names in scryfall_cache · ${errors} batch errors`,
        destination: "scryfall_cache",
        source: "Scryfall default_cards bulk JSON (streaming or chunked)",
        durationMs,
        counts: {
          rows_upserted_this_request: inserted,
          cards_processed: processed,
          batch_errors: errors,
          final_cache_rows: finalCount ?? undefined,
          cache_with_images: imageCount,
        },
        warnings: warnings.length ? warnings : undefined,
        labels: {
          schedule: "Weekly Sunday ~02:00 UTC (prod) / local RUN NOW",
          local_only:
            "Admin button runs on your machine — production uses GitHub Actions hitting BASE_URL",
        },
        extra: {
          streaming_mode: useStreaming,
          is_last_chunk: isLastChunk,
          chunk_start: useStreaming ? 0 : chunkStart,
          total_cards_in_bulk: allCardsLength,
        },
      };
      await persistAdminJobRun(admin, JOB_ID, detail);
    }

    return NextResponse.json({ 
      ok: true, 
      imported: inserted, 
      processed: processed,
      unique_normalized_names: uniqueNormalizedNames,
      streaming_mode: useStreaming,
      chunk_start: chunkStart,
      chunk_size: chunkSize,
      chunk_cards: cards.length,
      total_cards: allCardsLength || null,
      is_last_chunk: isLastChunk,
      next_chunk_start: chunkStart + chunkSize,
      final_cache_count: finalCount,
      cache_entries_with_images: imageCount,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ Bulk import failed:", error);
    const msg = error?.message || "bulk_import_failed";
    try {
      const a = getAdmin();
      if (a) {
        await persistAdminJobRun(a, JOB_ID, {
          jobId: JOB_ID,
          finishedAt: new Date().toISOString(),
          ok: false,
          runResult: "failed",
          compactLine: `Failed: ${String(msg).slice(0, 200)}`,
          destination: "scryfall_cache",
          lastError: String(msg),
        });
      }
    } catch {
      /* ignore */
    }
    return NextResponse.json({ 
      ok: false, 
      error: msg
    }, { status: 500 });
  }
}
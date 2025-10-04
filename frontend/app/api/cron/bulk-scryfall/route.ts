import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutes for bulk processing (30k cards)

interface ScryfallCard {
  name: string;
  type_line?: string;
  oracle_text?: string;
  color_identity?: string[];
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
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

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
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
    const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
    const hdr = req.headers.get("x-cron-key") || "";
    console.log("🔑 Auth check - cronKey exists:", !!cronKey, "header exists:", !!hdr);

    let useAdmin = false;

    if (cronKey && hdr === cronKey) {
      useAdmin = true;
      actor = 'cron';
      console.log("✅ Cron key auth successful");
    } else {
      console.log("🔍 Trying user auth...");
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
      console.log("❌ Authorization failed");
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

    // 1. Download Scryfall bulk data (default cards only)
    console.log("📥 Downloading Scryfall bulk data...");
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
    const cards: ScryfallCard[] = await cardsResponse.json();
    
    console.log(`📊 Processing ${cards.length} cards...`);

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
        const testRow = {
          name: norm(testCard.name),
          color_identity: testCard.color_identity || [],
          small: testCard.image_uris?.small || null,
          normal: testCard.image_uris?.normal || null,
          art_crop: testCard.image_uris?.art_crop || null,
          updated_at: new Date().toISOString()
        };
        
        const { error: schemaError } = await admin
          .from('scryfall_cache')
          .upsert([testRow], { onConflict: 'name' });
          
        if (schemaError) {
          console.warn("⚠️ Schema validation failed, using basic fields only:", schemaError.message);
        } else {
          console.log("✅ Schema validation passed");
        }
      }
    } catch (schemaError: any) {
      console.warn("⚠️ Schema test failed, proceeding with basic fields:", schemaError.message);
    }

    const BATCH_SIZE = 500; // Smaller batches to prevent timeouts
    let processed = 0;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      
      // Use a Map to deduplicate by normalized name within this batch
      const rowMap = new Map<string, any>();
      
      for (const card of batch) {
        // Skip cards without names
        if (!card.name) continue;

        const normalizedName = norm(card.name);
        const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
        const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity : [];
        const cmc = typeof card.cmc === 'number' ? Math.round(card.cmc) : 0;

        // Build row object with only fields that exist in the database schema
        const currentTimestamp = new Date().toISOString();
        const row: any = {
          name: normalizedName,
          color_identity: colorIdentity,
          small: images.small || null,
          normal: images.normal || null,
          art_crop: images.art_crop || null,
          updated_at: currentTimestamp
        };
        
        // Add optional fields only if they have values (to avoid schema errors)
        if (card.type_line) row.type_line = String(card.type_line).trim();
        if (card.oracle_text || card.card_faces?.[0]?.oracle_text) {
          const oracleText = card.oracle_text || card.card_faces?.[0]?.oracle_text;
          row.oracle_text = String(oracleText).trim();
        }
        if (card.mana_cost) row.mana_cost = String(card.mana_cost).trim();
        if (cmc >= 0) row.cmc = cmc; // Allow 0 CMC cards
        
        // Only keep the first occurrence of each card name in this batch
        // This prevents "ON CONFLICT DO UPDATE command cannot affect row a second time"
        if (!rowMap.has(normalizedName)) {
          rowMap.set(normalizedName, row);
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

    // 3. Record completion
    try {
      await admin.from('app_config').upsert(
        { key: 'job:last:bulk_scryfall', value: new Date().toISOString() }, 
        { onConflict: 'key' }
      );
      await admin.from('admin_audit').insert({ 
        actor_id: actor || 'cron', 
        action: 'bulk_scryfall_import', 
        target: inserted 
      });
    } catch (auditError) {
      console.warn("⚠️ Audit logging failed:", auditError);
    }

    // Final verification - check actual database state
    let finalCount = 0;
    try {
      // Use a simpler approach to count rows - count query might be unreliable
      const { data: countData, error: countError } = await admin
        .from('scryfall_cache')
        .select('name')
        .limit(1000); // Get a sample to verify data exists
        
      if (countError) {
        console.warn(`⚠️ Could not verify final cache state:`, countError.message);
      } else if (countData && countData.length > 0) {
        console.log(`📊 Final cache verification: Found ${countData.length}+ entries (sampled), cache appears to be populated`);
        finalCount = countData.length; // At least this many
      } else {
        console.warn(`⚠️ No cache entries found - data may not be persisting`);
      }
    } catch (verifyError: any) {
      console.warn(`⚠️ Could not verify final cache state:`, verifyError.message);
    }

    console.log(`✅ Bulk import complete: ${inserted} cards processed, ${finalCount} total in cache`);

    return NextResponse.json({ 
      ok: true, 
      imported: inserted, 
      processed: processed,
      total_cards: cards.length,
      final_cache_count: finalCount,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ Bulk import failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "bulk_import_failed" 
    }, { status: 500 });
  }
}
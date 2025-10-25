import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute per batch - much safer

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
  console.log("🔥 Lightweight bulk import endpoint called");
  
  let actor: string | null = null;
  
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

    console.log("🚀 Authorization successful, starting lightweight import...");
  } catch (setupError: any) {
    console.error("💥 Setup error:", setupError);
    return NextResponse.json({ 
      ok: false, 
      error: "setup_failed",
      details: setupError.message 
    }, { status: 500 });
  }

  try {
    console.log("🚀 Starting lightweight Scryfall import...");
    const startTime = Date.now();

    // Check if this is a test run
    const testMode = req.headers.get('x-test-mode') === 'true';
    if (testMode) {
      console.log("🧪 Test mode - validating connections only");
      
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
        message: "Test successful - ready for lightweight import"
      });
    }

    // Get batch parameters
    const batchSize = parseInt(req.headers.get('x-batch-size') || '150'); // Small batches
    const pageNum = parseInt(req.headers.get('x-page') || '1');
    
    console.log(`📦 Processing batch: page ${pageNum}, size ${batchSize}`);

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Use Scryfall's search API instead of bulk download
    // This gets cards in smaller, manageable chunks
    const searchUrl = `https://api.scryfall.com/cards/search?q=format:standard&page=${pageNum}&format=json`;
    console.log(`🔍 Fetching from search API: page ${pageNum}`);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'MTG-AI-Assistant/1.0'
      }
    });

    if (!searchResponse.ok) {
      if (searchResponse.status === 404) {
        // No more pages
        console.log("📄 No more pages available");
        return NextResponse.json({
          ok: true,
          imported: 0,
          processed: 0,
          page: pageNum,
          has_more: false,
          message: "No more pages to process"
        });
      }
      throw new Error(`Search API failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const cards: ScryfallCard[] = searchData.data || [];
    const hasMore = searchData.has_more || false;

    console.log(`📊 Got ${cards.length} cards from page ${pageNum}, has_more: ${hasMore}`);

    if (cards.length === 0) {
      return NextResponse.json({
        ok: true,
        imported: 0,
        processed: 0,
        page: pageNum,
        has_more: false,
        message: "No cards found on this page"
      });
    }

    // Process cards in smaller database batches
    const DB_BATCH_SIZE = 50; // Very small database batches
    let inserted = 0;
    let processed = 0;

    for (let i = 0; i < cards.length; i += DB_BATCH_SIZE) {
      const batch = cards.slice(i, i + DB_BATCH_SIZE);
      
      // Deduplicate within batch
      const rowMap = new Map<string, any>();
      
      for (const card of batch) {
        if (!card.name) continue;

        const normalizedName = norm(card.name);
        const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
        const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity : [];

        const row: any = {
          name: normalizedName,
          color_identity: colorIdentity,
          small: images.small || null,
          normal: images.normal || null,
          art_crop: images.art_crop || null,
          updated_at: new Date().toISOString()
        };
        
        if (card.type_line) row.type_line = String(card.type_line).trim();
        if (card.oracle_text || card.card_faces?.[0]?.oracle_text) {
          const oracleText = card.oracle_text || card.card_faces?.[0]?.oracle_text;
          row.oracle_text = String(oracleText).trim();
        }
        if (card.mana_cost) row.mana_cost = String(card.mana_cost).trim();
        if (typeof card.cmc === 'number') row.cmc = Math.round(card.cmc);
        
        if (!rowMap.has(normalizedName)) {
          rowMap.set(normalizedName, row);
        }
      }
      
      const rows = Array.from(rowMap.values());
      
      if (rows.length > 0) {
        try {
          const { error, count } = await admin
            .from('scryfall_cache')
            .upsert(rows, { 
              onConflict: 'name',
              ignoreDuplicates: false 
            });

          if (error) {
            console.error(`❌ DB batch failed:`, error.message);
            // Continue with other batches instead of failing completely
          } else {
            const actualInserted = count || rows.length;
            inserted += actualInserted;
            console.log(`✅ Inserted ${actualInserted} cards`);
          }
        } catch (batchError: any) {
          console.error(`❌ DB batch exception:`, batchError.message);
          // Continue processing
        }
        
        processed += batch.length;
      }
    }

    // Record progress
    try {
      await admin.from('admin_audit').insert({ 
        actor_id: actor || 'cron', 
        action: 'lightweight_scryfall_page', 
        target: inserted,
        details: `page_${pageNum}_${cards.length}_cards` 
      });
    } catch (auditError) {
      console.warn("⚠️ Audit logging failed:", auditError);
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Page ${pageNum} completed in ${duration}ms: ${inserted} cards inserted`);

    return NextResponse.json({ 
      ok: true, 
      imported: inserted, 
      processed: processed,
      page: pageNum,
      batch_size: batchSize,
      cards_in_page: cards.length,
      has_more: hasMore,
      duration_ms: duration,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ Lightweight import failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "lightweight_import_failed" 
    }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for bulk processing

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
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";

  let useAdmin = false;
  let actor: string | null = null;

  if (cronKey && hdr === cronKey) {
    useAdmin = true;
    actor = 'cron';
  } else {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isAdmin(user)) {
        useAdmin = true;
        actor = user.id as string;
      }
    } catch {}
  }

  if (!useAdmin) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    console.log("🚀 Starting bulk Scryfall import...");

    // 1. Download Scryfall bulk data (default cards only)
    console.log("📥 Downloading Scryfall bulk data...");
    const bulkResponse = await fetch("https://api.scryfall.com/bulk-data");
    const bulkData = await bulkResponse.json();
    
    const defaultCardsUrl = bulkData.data.find((item: any) => item.type === "default_cards")?.download_uri;
    if (!defaultCardsUrl) {
      throw new Error("Could not find default_cards bulk data URL");
    }

    console.log("📦 Fetching card data from:", defaultCardsUrl);
    const cardsResponse = await fetch(defaultCardsUrl);
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

    const BATCH_SIZE = 1000;
    let processed = 0;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      const rows: any[] = [];

      for (const card of batch) {
        // Skip cards without names
        if (!card.name) continue;

        const normalizedName = norm(card.name);
        const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
        const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity : [];
        const cmc = typeof card.cmc === 'number' ? Math.round(card.cmc) : 0;

        // Build row object with only fields that exist in the database schema
        const row: any = {
          name: normalizedName,
          color_identity: colorIdentity,
          small: images.small || null,
          normal: images.normal || null,
          art_crop: images.art_crop || null,
          updated_at: new Date().toISOString()
        };
        
        // Add optional fields only if they have values (to avoid schema errors)
        if (card.type_line) row.type_line = card.type_line;
        if (card.oracle_text || card.card_faces?.[0]?.oracle_text) {
          row.oracle_text = card.oracle_text || card.card_faces?.[0]?.oracle_text;
        }
        if (card.mana_cost) row.mana_cost = card.mana_cost;
        if (cmc > 0) row.cmc = cmc;
        
        rows.push(row);
      }

      if (rows.length > 0) {
        const { error, count } = await admin
          .from('scryfall_cache')
          .upsert(rows, { onConflict: 'name' });

        if (error) {
          console.error(`❌ Batch ${i}-${i + BATCH_SIZE} failed:`, error.message);
          errors++;
          
          // If too many consecutive errors, stop (schema issue)
          if (errors >= 5) {
            console.error("🛑 Too many consecutive errors, stopping bulk import. Please check database schema.");
            break;
          }
        } else {
          inserted += rows.length;
          errors = 0; // Reset error counter on success
          
          // Log progress every 10 batches
          if (Math.floor(i / BATCH_SIZE) % 10 === 0) {
            console.log(`⚡ Progress: ${inserted}/${cards.length} (${Math.round(inserted/cards.length*100)}%)`);
          }
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

    console.log(`✅ Bulk import complete: ${inserted} cards cached`);

    return NextResponse.json({ 
      ok: true, 
      imported: inserted, 
      processed: processed,
      total_cards: cards.length,
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
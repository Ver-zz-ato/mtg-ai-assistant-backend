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

    // 2. Process cards in batches
    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    const BATCH_SIZE = 1000;
    let processed = 0;
    let inserted = 0;

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      const rows: any[] = [];

      for (const card of batch) {
        // Skip cards without names
        if (!card.name) continue;

        const normalizedName = norm(card.name);
        const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
        const colorIdentity = Array.isArray(card.color_identity) ? card.color_identity : [];

        rows.push({
          name: normalizedName,
          type_line: card.type_line || null,
          oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text || null,
          color_identity: colorIdentity,
          mana_cost: card.mana_cost || null,
          small: images.small || null,
          normal: images.normal || null,
          art_crop: images.art_crop || null,
          updated_at: new Date().toISOString()
        });
      }

      if (rows.length > 0) {
        const { error, count } = await admin
          .from('scryfall_cache')
          .upsert(rows, { onConflict: 'name' });

        if (error) {
          console.error(`❌ Batch ${i}-${i + BATCH_SIZE} failed:`, error.message);
        } else {
          inserted += rows.length;
          processed += batch.length;
          
          // Log progress every 10 batches
          if (Math.floor(i / BATCH_SIZE) % 10 === 0) {
            console.log(`⚡ Progress: ${processed}/${cards.length} (${Math.round(processed/cards.length*100)}%)`);
          }
        }
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
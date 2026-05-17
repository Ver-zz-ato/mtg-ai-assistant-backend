import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { logUnauthorizedCronAttempt, verifyCronRequest } from "@/lib/server/verifyCronRequest";

interface ScryfallCard {
  name: string;
  prices?: {
    usd?: string;
    usd_foil?: string;
    eur?: string;
    tix?: string;
  };
}

function norm(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "").split(/[\s,]+/).filter(Boolean).map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  console.log("Bulk price import endpoint called");

  let actor: string | null = null;

  try {
    let useAdmin = verifyCronRequest(req, {
      routePath: "/api/bulk-jobs/price-import",
      logUnauthorizedOnFailure: false,
    });

    if (useAdmin) {
      actor = "cron";
      console.log("cron auth successful");
    } else {
      console.log("Trying user auth...");
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && isAdmin(user)) {
          useAdmin = true;
          actor = user.id as string;
          console.log("admin user auth successful");
        }
      } catch (authError: any) {
        console.log("user auth failed:", authError.message);
      }
    }

    if (!useAdmin) {
      logUnauthorizedCronAttempt(req, { routePath: "/api/bulk-jobs/price-import" });
      console.log("authorization failed");
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    console.log("Authorization successful, starting bulk price import...");
  } catch (setupError: any) {
    console.error("Setup error:", setupError);
    return NextResponse.json(
      {
        ok: false,
        error: "setup_failed",
        details: setupError.message,
      },
      { status: 500 },
    );
  }

  try {
    console.log("Starting bulk price import...");
    const startTime = Date.now();

    const testMode = req.headers.get("x-test-mode") === "true";
    if (testMode) {
      console.log("Test mode - validating connections only");

      const admin = getAdmin();
      if (!admin) {
        throw new Error("Admin client not available");
      }

      const { data, error } = await admin.from("scryfall_cache").select("name").limit(1);
      if (error) {
        throw new Error(`Database test failed: ${error.message}`);
      }

      const bulkResponse = await fetch("https://api.scryfall.com/bulk-data");
      if (!bulkResponse.ok) {
        throw new Error(`Bulk data API test failed: ${bulkResponse.status}`);
      }

      return NextResponse.json({
        ok: true,
        test_mode: true,
        database_ok: true,
        bulk_api_ok: true,
        sample_cache_entries: data?.length || 0,
        message: "Test successful - ready for bulk price import",
      });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    console.log("Fetching bulk data info from Scryfall...");
    const bulkResponse = await fetch("https://api.scryfall.com/bulk-data", {
      headers: {
        "User-Agent": "MTG-AI-Assistant/1.0",
      },
    });

    if (!bulkResponse.ok) {
      throw new Error(`Failed to fetch bulk data info: ${bulkResponse.status} ${bulkResponse.statusText}`);
    }

    const bulkData = await bulkResponse.json();
    const defaultCardsInfo = bulkData.data.find((item: any) => item.type === "default_cards");

    if (!defaultCardsInfo) {
      throw new Error("Could not find default_cards bulk data");
    }

    const downloadUrl = defaultCardsInfo.download_uri;
    const fileSize = Math.round(defaultCardsInfo.size / 1024 / 1024);
    const lastUpdated = defaultCardsInfo.updated_at;

    console.log(`Found default_cards bulk data: ${fileSize}MB updated ${lastUpdated}`);

    console.log("Fetching cached card names...");
    const { data: cachedCards, error: cacheError } = await admin
      .from("scryfall_cache")
      .select("name")
      .order("name");

    if (cacheError) {
      throw new Error(`Failed to fetch cached cards: ${cacheError.message}`);
    }

    if (!cachedCards || cachedCards.length === 0) {
      console.log("No cached cards found to update prices for");
      return NextResponse.json({
        ok: true,
        updated: 0,
        processed: 0,
        cached_cards: 0,
        message: "No cached cards found",
      });
    }

    console.log(`Found ${cachedCards.length} cached cards to update prices for`);

    const cachedCardNames = new Set(cachedCards.map((card) => norm(card.name)));

    console.log(`Downloading ${fileSize}MB bulk card data...`);
    const cardsResponse = await fetch(downloadUrl, {
      headers: {
        "User-Agent": "MTG-AI-Assistant/1.0",
      },
    });

    if (!cardsResponse.ok) {
      throw new Error(`Failed to download bulk data: ${cardsResponse.status} ${cardsResponse.statusText}`);
    }

    console.log("Processing bulk data and extracting prices...");
    const allCards: ScryfallCard[] = await cardsResponse.json();

    console.log(`Downloaded ${allCards.length} total cards from Scryfall`);

    const priceMap = new Map<string, any>();
    let processed = 0;
    let found = 0;

    for (const card of allCards) {
      processed++;

      if (!card.name || !card.prices) {
        continue;
      }

      const normalizedName = norm(card.name);

      if (cachedCardNames.has(normalizedName)) {
        found++;

        const priceData = {
          card_name: normalizedName,
          usd_price: card.prices.usd ? parseFloat(card.prices.usd) : null,
          usd_foil_price: card.prices.usd_foil ? parseFloat(card.prices.usd_foil) : null,
          eur_price: card.prices.eur ? parseFloat(card.prices.eur) : null,
          tix_price: card.prices.tix ? parseFloat(card.prices.tix) : null,
          updated_at: new Date().toISOString(),
        };

        priceMap.set(normalizedName, priceData);
      }

      if (processed % 10000 === 0) {
        console.log(`Progress: ${processed}/${allCards.length} cards processed, ${found} price matches found`);
      }
    }

    const priceUpdates = Array.from(priceMap.values());
    const uniqueCards = priceUpdates.length;

    console.log(`Found prices for ${found} price entries, deduplicated to ${uniqueCards} unique cards out of ${cachedCards.length} cached cards (${Math.round(uniqueCards / cachedCards.length * 100)}% coverage)`);

    let updated = 0;
    const batchSize = 1000;

    console.log(`Updating price cache in batches of ${batchSize}...`);

    for (let i = 0; i < priceUpdates.length; i += batchSize) {
      const batch = priceUpdates.slice(i, i + batchSize);

      try {
        const { error: upsertError, count } = await admin
          .from("price_cache")
          .upsert(batch, {
            onConflict: "card_name",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`Batch ${i}-${i + batchSize} failed:`, upsertError.message);
        } else {
          const batchUpdated = count || batch.length;
          updated += batchUpdated;
          console.log(`Updated batch ${Math.floor(i / batchSize) + 1}: ${batchUpdated} price records`);
        }
      } catch (batchError: any) {
        console.error(`Batch ${i}-${i + batchSize} exception:`, batchError.message);
      }
    }

    try {
      await admin.from("admin_audit").insert({
        actor_id: actor || "cron",
        action: "bulk_price_import",
        target: updated,
        details: `${uniqueCards}_unique_${found}_matches_${processed}_processed_${fileSize}MB`,
      });

      await admin.from("app_config").upsert(
        { key: "job:last:bulk_price_import", value: new Date().toISOString() },
        { onConflict: "key" },
      );
    } catch (auditError) {
      console.warn("Audit logging failed:", auditError);
    }

    const duration = Date.now() - startTime;
    console.log(`Bulk price import completed in ${Math.round(duration / 1000)}s: ${updated} prices updated`);

    return NextResponse.json({
      ok: true,
      updated,
      processed,
      price_matches_found: found,
      unique_cards_with_prices: uniqueCards,
      duplicates_removed: found - uniqueCards,
      cached_cards_total: cachedCards.length,
      coverage_percent: Math.round(uniqueCards / cachedCards.length * 100),
      bulk_file_size_mb: fileSize,
      bulk_file_updated: lastUpdated,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Bulk price import failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "bulk_price_import_failed",
      },
      { status: 500 },
    );
  }
}

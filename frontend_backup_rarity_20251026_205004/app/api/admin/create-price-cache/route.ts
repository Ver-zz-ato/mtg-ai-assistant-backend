import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";

export async function POST(req: NextRequest) {
  console.log("🗄️ Creating price_cache table...");
  
  try {
    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    // Create the price_cache table
    const createTableSQL = `
      -- Create price_cache table for storing card pricing data
      CREATE TABLE IF NOT EXISTS price_cache (
          id BIGSERIAL PRIMARY KEY,
          card_name TEXT NOT NULL UNIQUE, -- Normalized card name for matching
          usd_price DECIMAL(10,2), -- USD price
          usd_foil_price DECIMAL(10,2), -- USD foil price  
          eur_price DECIMAL(10,2), -- EUR price
          tix_price DECIMAL(10,2), -- MTGO tix price
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Create index on card_name for fast lookups
      CREATE INDEX IF NOT EXISTS idx_price_cache_card_name ON price_cache(card_name);

      -- Create index on updated_at for cleanup operations
      CREATE INDEX IF NOT EXISTS idx_price_cache_updated_at ON price_cache(updated_at);
    `;

    console.log("📝 Executing table creation SQL...");
    const { error: tableError } = await admin.rpc('execute_sql', { sql: createTableSQL });
    
    if (tableError) {
      throw new Error(`Table creation failed: ${tableError.message}`);
    }

    // Create RLS policies
    const policySQL = `
      -- Add RLS policy for price_cache (allow public read access)
      ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

      -- Policy: Anyone can read price data
      DROP POLICY IF EXISTS "Allow public read access to price_cache" ON price_cache;
      CREATE POLICY "Allow public read access to price_cache"
      ON price_cache FOR SELECT
      TO public
      USING (true);

      -- Policy: Only authenticated users can insert/update (for admin operations)
      DROP POLICY IF EXISTS "Allow authenticated insert/update to price_cache" ON price_cache;
      CREATE POLICY "Allow authenticated insert/update to price_cache"  
      ON price_cache FOR ALL
      TO authenticated
      USING (true);
    `;

    console.log("🔒 Setting up RLS policies...");
    const { error: policyError } = await admin.rpc('execute_sql', { sql: policySQL });
    
    if (policyError) {
      console.warn("⚠️ Policy creation failed:", policyError.message);
      // Continue anyway - policies are not critical for basic functionality
    }

    // Create trigger function and trigger
    const triggerSQL = `
      -- Update the updated_at timestamp on changes
      CREATE OR REPLACE FUNCTION update_price_cache_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      -- Drop trigger if exists, then create
      DROP TRIGGER IF EXISTS update_price_cache_updated_at_trigger ON price_cache;
      CREATE TRIGGER update_price_cache_updated_at_trigger
          BEFORE UPDATE ON price_cache
          FOR EACH ROW
          EXECUTE FUNCTION update_price_cache_updated_at();
    `;

    console.log("⚡ Creating update trigger...");
    const { error: triggerError } = await admin.rpc('execute_sql', { sql: triggerSQL });
    
    if (triggerError) {
      console.warn("⚠️ Trigger creation failed:", triggerError.message);
      // Continue anyway - trigger is not critical for basic functionality
    }

    // Verify the table was created
    const { data: tableCheck, error: checkError } = await admin
      .from('price_cache')
      .select('card_name')
      .limit(1);

    if (checkError) {
      throw new Error(`Table verification failed: ${checkError.message}`);
    }

    console.log("✅ price_cache table created successfully!");
    
    return NextResponse.json({
      ok: true,
      message: "price_cache table created successfully",
      table_verified: true,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("❌ price_cache table creation failed:", error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "table_creation_failed"
    }, { status: 500 });
  }
}
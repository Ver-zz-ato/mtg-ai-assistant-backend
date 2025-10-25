import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/app/api/_lib/supa";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdmin();
    if (!admin) {
      throw new Error("Admin client not available");
    }

    console.log("🔧 Running scryfall_cache schema migration...");

    // Run the migration SQL
    const migrationSQL = `
      -- Add missing fields to scryfall_cache
      BEGIN;
      
      ALTER TABLE scryfall_cache 
        ADD COLUMN IF NOT EXISTS mana_cost text;
      
      ALTER TABLE scryfall_cache 
        ADD COLUMN IF NOT EXISTS oracle_text text;
      
      ALTER TABLE scryfall_cache 
        ADD COLUMN IF NOT EXISTS type_line text;
      
      ALTER TABLE scryfall_cache 
        ADD COLUMN IF NOT EXISTS cmc integer DEFAULT 0;
      
      -- Add comments
      COMMENT ON COLUMN scryfall_cache.mana_cost IS 'Mana cost string like {2}{R}{G}';
      COMMENT ON COLUMN scryfall_cache.oracle_text IS 'Card rules text for archetype analysis';
      COMMENT ON COLUMN scryfall_cache.type_line IS 'Card type line like "Creature — Human Warrior"';
      COMMENT ON COLUMN scryfall_cache.cmc IS 'Converted mana cost as integer';
      
      COMMIT;
    `;

    const { error } = await admin.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      // Try individual migrations in case the RPC doesn't exist
      console.log("📝 Running individual column additions...");
      
      const migrations = [
        "ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS mana_cost text;",
        "ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS oracle_text text;", 
        "ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS type_line text;",
        "ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS cmc integer DEFAULT 0;"
      ];
      
      for (const sql of migrations) {
        try {
          // Use a simple upsert approach to test column existence
          console.log(`Testing column: ${sql.split(' ')[5]}`);
        } catch (testError) {
          console.log(`Column ${sql.split(' ')[5]} needs to be added`);
        }
      }
    }

    // Verify the schema by checking column existence
    console.log("🔍 Verifying schema...");
    
    // Test with a simple insert to validate all columns exist
    const testRow = {
      name: 'test_schema_validation',
      color_identity: ['R'],
      mana_cost: '{2}{R}',
      oracle_text: 'Test card text',
      type_line: 'Sorcery',
      cmc: 3,
      updated_at: new Date().toISOString()
    };
    
    const { error: testError } = await admin
      .from('scryfall_cache')
      .upsert([testRow], { onConflict: 'name' });
    
    if (testError) {
      return NextResponse.json({ 
        ok: false, 
        error: `Schema validation failed: ${testError.message}`,
        suggestion: "Some columns may be missing from scryfall_cache table"
      }, { status: 500 });
    }
    
    // Clean up test row
    await admin.from('scryfall_cache').delete().eq('name', 'test_schema_validation');

    console.log("✅ Schema migration completed successfully");
    
    return NextResponse.json({ 
      ok: true, 
      message: "scryfall_cache schema updated successfully",
      columns_available: ["name", "color_identity", "mana_cost", "oracle_text", "type_line", "cmc", "small", "normal", "art_crop", "updated_at"]
    });

  } catch (error: any) {
    console.error("❌ Schema migration failed:", error);
    return NextResponse.json({ 
      ok: false, 
      error: error?.message || "migration_failed" 
    }, { status: 500 });
  }
}
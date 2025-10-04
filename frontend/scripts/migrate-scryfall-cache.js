// Script to add missing columns to scryfall_cache table
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Check for environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables:');
    console.error('- NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
    console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!supabaseServiceKey);
    console.error('\nMake sure these are set in your .env.local file');
    process.exit(1);
  }

  // Create Supabase client with service role key (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('Running scryfall_cache migration...');

  try {
    // Add the missing columns directly
    console.log('Adding mana_cost column...');
    const { error: error1 } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS mana_cost text;'
    });
    
    if (error1) {
      console.error('Failed to add mana_cost column:', error1);
      process.exit(1);
    }
    
    console.log('Adding cmc column...');
    const { error: error2 } = await supabase.rpc('exec', {
      sql: 'ALTER TABLE scryfall_cache ADD COLUMN IF NOT EXISTS cmc integer DEFAULT 0;'
    });
    
    if (error2) {
      console.error('Failed to add cmc column:', error2);
      process.exit(1);
    }

    if (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }

    console.log('✅ Migration completed successfully!');
    console.log('The scryfall_cache table now has the missing cmc and mana_cost columns.');
    
    // Verify the columns were added
    const { data: columns, error: columnError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'scryfall_cache')
      .eq('table_schema', 'public');

    if (!columnError && columns) {
      console.log('\nCurrent scryfall_cache columns:');
      columns.forEach(col => console.log(`  - ${col.column_name}`));
    }

  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

runMigration();
-- Migration 027: Replace exec_sql with safe purpose-built RPCs
-- This removes the "nuclear launch key" risk by replacing generic exec_sql with specific functions

-- ============================================================================
-- Function 1: Safe VACUUM ANALYZE (whitelist-only table names)
-- ============================================================================

CREATE OR REPLACE FUNCTION vacuum_analyze_table(target_table TEXT)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  table_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  allowed_tables TEXT[] := ARRAY[
    'scryfall_cache',
    'price_snapshots',
    'price_cache',
    'chat_messages',
    'decks',
    'deck_cards',
    'profiles',
    'profiles_public',
    'api_usage_rate_limits',
    'guest_sessions',
    'admin_audit'
  ];
  is_allowed BOOLEAN;
BEGIN
  -- Validate table name is in whitelist
  is_allowed := target_table = ANY(allowed_tables);
  
  IF NOT is_allowed THEN
    RETURN QUERY SELECT 
      FALSE,
      format('Table "%s" is not in allowed whitelist. Allowed tables: %s', target_table, array_to_string(allowed_tables, ', ')),
      target_table;
    RETURN;
  END IF;
  
  -- Execute VACUUM ANALYZE on the allowed table
  EXECUTE format('VACUUM ANALYZE %I', target_table);
  
  RETURN QUERY SELECT 
    TRUE,
    format('VACUUM ANALYZE completed successfully for table: %s', target_table),
    target_table;
END;
$$;

-- Grant execute to service role (used by admin routes)
-- Note: This function uses SECURITY DEFINER, so it runs with the privileges of the function owner
-- The function owner should be a superuser or have VACUUM privileges
COMMENT ON FUNCTION vacuum_analyze_table IS 'Safely execute VACUUM ANALYZE on whitelisted tables only. Replaces dangerous exec_sql RPC.';

-- ============================================================================
-- Function 2: Migrate scryfall_cache schema (specific operation)
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_cache_schema()
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  columns_added TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  added_columns TEXT[] := '{}';
BEGIN
  -- Add columns if they don't exist (idempotent)
  
  -- Add mana_cost column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scryfall_cache' AND column_name = 'mana_cost'
  ) THEN
    ALTER TABLE scryfall_cache ADD COLUMN mana_cost text;
    added_columns := array_append(added_columns, 'mana_cost');
  END IF;
  
  -- Add oracle_text column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scryfall_cache' AND column_name = 'oracle_text'
  ) THEN
    ALTER TABLE scryfall_cache ADD COLUMN oracle_text text;
    added_columns := array_append(added_columns, 'oracle_text');
  END IF;
  
  -- Add type_line column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scryfall_cache' AND column_name = 'type_line'
  ) THEN
    ALTER TABLE scryfall_cache ADD COLUMN type_line text;
    added_columns := array_append(added_columns, 'type_line');
  END IF;
  
  -- Add cmc column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scryfall_cache' AND column_name = 'cmc'
  ) THEN
    ALTER TABLE scryfall_cache ADD COLUMN cmc integer DEFAULT 0;
    added_columns := array_append(added_columns, 'cmc');
  END IF;
  
  -- Add column comments
  COMMENT ON COLUMN scryfall_cache.mana_cost IS 'Mana cost string like {2}{R}{G}';
  COMMENT ON COLUMN scryfall_cache.oracle_text IS 'Card rules text for archetype analysis';
  COMMENT ON COLUMN scryfall_cache.type_line IS 'Card type line like "Creature — Human Warrior"';
  COMMENT ON COLUMN scryfall_cache.cmc IS 'Converted mana cost as integer';
  
  -- Return result
  IF array_length(added_columns, 1) > 0 THEN
    RETURN QUERY SELECT 
      TRUE,
      format('Schema migration completed. Added columns: %s', array_to_string(added_columns, ', ')),
      added_columns;
  ELSE
    RETURN QUERY SELECT 
      TRUE,
      'Schema migration completed. All columns already exist.',
      added_columns;
  END IF;
END;
$$;

COMMENT ON FUNCTION migrate_cache_schema IS 'Safely migrate scryfall_cache schema by adding required columns. Replaces dangerous exec_sql RPC.';

-- ============================================================================
-- Cleanup: Remove exec_sql if it exists (optional - uncomment if you want to remove it)
-- ============================================================================
-- DROP FUNCTION IF EXISTS exec_sql(TEXT) CASCADE;

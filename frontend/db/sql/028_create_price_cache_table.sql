-- Create price_cache table for storing card pricing data
-- This table stores the latest pricing information for cards

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

-- Add RLS policy for price_cache (allow public read access)
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read price data
CREATE POLICY "Allow public read access to price_cache"
ON price_cache FOR SELECT
TO public
USING (true);

-- Policy: Only authenticated users can insert/update (for admin operations)
CREATE POLICY "Allow authenticated insert/update to price_cache"  
ON price_cache FOR ALL
TO authenticated
USING (true);

-- Update the updated_at timestamp on changes
CREATE OR REPLACE FUNCTION update_price_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_price_cache_updated_at_trigger
    BEFORE UPDATE ON price_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_price_cache_updated_at();
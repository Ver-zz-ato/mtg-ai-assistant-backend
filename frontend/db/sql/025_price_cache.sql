-- Create price cache table for 24-hour price caching
-- This reduces load on Scryfall API and improves price lookup performance

CREATE TABLE IF NOT EXISTS price_cache (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL, -- normalized card name
    usd DECIMAL(10,2), -- USD price
    eur DECIMAL(10,2), -- EUR price  
    gbp DECIMAL(10,2), -- GBP price (calculated)
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by name
CREATE UNIQUE INDEX IF NOT EXISTS price_cache_name_idx ON price_cache(name);

-- Index for cleaning up old entries
CREATE INDEX IF NOT EXISTS price_cache_updated_at_idx ON price_cache(updated_at);
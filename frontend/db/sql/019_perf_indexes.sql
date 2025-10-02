-- 019_perf_indexes.sql
-- Performance indexes for cache and high-traffic tables

-- scryfall_cache indexes
create index if not exists scryfall_cache_name_idx on scryfall_cache (name);
create index if not exists scryfall_cache_updated_idx on scryfall_cache (updated_at);

-- deck_cards: common filter by deck_id
create index if not exists deck_cards_deck_id_idx on deck_cards (deck_id);

-- deck_likes: fast counts by deck_id
create index if not exists deck_likes_deck_id_idx on deck_likes (deck_id);

-- likes_audit: windowed queries by created_at and ip_hash
create index if not exists likes_audit_created_idx on likes_audit (created_at);
create index if not exists likes_audit_ip_created_idx on likes_audit (ip_hash, created_at);
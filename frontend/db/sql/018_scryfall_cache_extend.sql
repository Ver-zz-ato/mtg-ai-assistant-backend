-- 018_scryfall_cache_extend.sql
-- Add type_line and oracle_text for card details caching
alter table scryfall_cache add column if not exists type_line text;
alter table scryfall_cache add column if not exists oracle_text text;

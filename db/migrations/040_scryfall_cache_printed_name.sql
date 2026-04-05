-- Optional: title as printed on the specific cached JPEG (e.g. Universes Beyond) when it differs from oracle `name`.
ALTER TABLE public.scryfall_cache
  ADD COLUMN IF NOT EXISTS printed_name text;

COMMENT ON COLUMN public.scryfall_cache.printed_name IS
  'From Scryfall printed_name when it differs from oracle PK name; matches small/normal art. Null when same as name or unknown.';

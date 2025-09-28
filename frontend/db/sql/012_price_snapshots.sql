-- db/sql/012_price_snapshots.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.price_snapshots (
  snapshot_date date NOT NULL,
  name_norm text NOT NULL,
  currency text NOT NULL,
  unit numeric(10,2) NOT NULL,
  source text NOT NULL DEFAULT 'Scryfall',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, name_norm, currency)
);

ALTER TABLE public.price_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_snapshots_owner_ro ON public.price_snapshots;
CREATE POLICY price_snapshots_owner_ro ON public.price_snapshots
FOR SELECT
USING ( true ); -- read is public; values are not sensitive

COMMIT;

-- Enforce a hard 200-card ceiling per deck across all zones.
-- Applies to website routes and direct mobile Supabase writes because both persist into public.deck_cards.

CREATE OR REPLACE FUNCTION public.enforce_deck_cards_max_200_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  projected_total integer;
BEGIN
  SELECT COALESCE(SUM(qty), 0)
    INTO projected_total
  FROM public.deck_cards
  WHERE deck_id = NEW.deck_id
    AND (TG_OP <> 'UPDATE' OR id <> OLD.id);

  projected_total := projected_total + GREATEST(COALESCE(NEW.qty, 0), 0);

  IF projected_total > 200 THEN
    RAISE EXCEPTION 'Decklists cannot exceed 200 total cards (attempted %).', projected_total
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deck_cards_max_200_total ON public.deck_cards;

CREATE TRIGGER trg_deck_cards_max_200_total
BEFORE INSERT OR UPDATE OF qty, deck_id
ON public.deck_cards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_deck_cards_max_200_total();

-- Expand shared_item_comments to support analysis report share comments.
-- This keeps the DB constraint aligned with the API route contract.

DO $$
BEGIN
  IF to_regclass('public.shared_item_comments') IS NOT NULL THEN
    ALTER TABLE public.shared_item_comments
      DROP CONSTRAINT IF EXISTS shared_item_comments_resource_type_check;

    ALTER TABLE public.shared_item_comments
      ADD CONSTRAINT shared_item_comments_resource_type_check
      CHECK (
        resource_type IN (
          'collection',
          'roast',
          'health_report',
          'analysis_report',
          'custom_card'
        )
      );
  END IF;
END $$;

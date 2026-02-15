-- Move bulk-imported public decks to a dedicated system user.
-- Previously they were under 990d69b2-3500-4833-81df-b05e07f929db, which may have been
-- the same as an admin account, causing those decks to appear in "My Decks".
-- This migration reassigns them to b8c7d6e5-f4a3-4210-9d00-000000000001 so they
-- only appear in Browse Public Decks, not in any user's My Decks.
-- NOTE: If you had personal decks under the old user_id, they will also move.
-- Run only if you want bulk-imported decks removed from your My Decks.

UPDATE decks
SET user_id = 'b8c7d6e5-f4a3-4210-9d00-000000000001'
WHERE user_id = '990d69b2-3500-4833-81df-b05e07f929db';

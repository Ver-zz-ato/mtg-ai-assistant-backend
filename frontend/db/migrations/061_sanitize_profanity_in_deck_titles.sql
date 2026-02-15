-- Sanitize existing deck titles that contain profanity.
-- Replaces with "Commander Name - Imported" or "Imported Deck" for 60-card formats.
-- Uses same word list as lib/profanity.ts (main terms).
-- \m and \M are PostgreSQL word boundaries.

UPDATE decks
SET title = CASE
  WHEN commander IS NOT NULL AND commander != '' THEN commander || ' - Imported'
  ELSE 'Imported Deck'
END
WHERE title ~* '\m(fuck|shit|bitch|cunt|twat|wanker|prick|dick|pussy|nigger|faggot|slut|whore|bastard|asshole|motherfucker|cock|dickhead|bellend|shithead|douche|bollocks)(s|es|ed|ing)?\M';

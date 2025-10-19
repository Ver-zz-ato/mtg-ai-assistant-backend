-- Seed fake likes and comments for public decks with 10+ cards
-- Run this in your Supabase SQL Editor
-- 
-- 🎭 SIMPLIFIED VERSION: Uses your existing user account for seeding
-- This will make it look like your decks already have engagement!

DO $$
DECLARE
  fake_user_ids uuid[] := ARRAY[
    'aaaaaaaa-1111-1111-1111-111111111111',
    'aaaaaaaa-2222-2222-2222-222222222222',
    'aaaaaaaa-3333-3333-3333-333333333333',
    'aaaaaaaa-4444-4444-4444-444444444444',
    'aaaaaaaa-5555-5555-5555-555555555555',
    'aaaaaaaa-6666-6666-6666-666666666666',
    'aaaaaaaa-7777-7777-7777-777777777777',
    'aaaaaaaa-8888-8888-8888-888888888888',
    'aaaaaaaa-9999-9999-9999-999999999999',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-dddd-dddd-dddd-dddddddddddd',
    'aaaaaaaa-eeee-eeee-eeee-eeeeeeeeeeee',
    'aaaaaaaa-ffff-ffff-ffff-ffffffffffff',
    'bbbbbbbb-1111-1111-1111-111111111111',
    'bbbbbbbb-2222-2222-2222-222222222222',
    'bbbbbbbb-3333-3333-3333-333333333333',
    'bbbbbbbb-4444-4444-4444-444444444444',
    'bbbbbbbb-5555-5555-5555-555555555555'
  ];
  fake_usernames text[] := ARRAY[
    'CardWizard',
    'ManaMaster',
    'DeckBuilder42',
    'PlaneswalkerPro',
    'TapLands',
    'MulliganKing',
    'CommanderFan',
    'ModernPlayer',
    'SpikeyMcSpike',
    'JohnnyCombo',
    'TimmyTokens',
    'MTGEnthusiast',
    'GathererPro',
    'MoxRuby',
    'LightningBolt',
    'CounterspellFTW',
    'SwordBro',
    'ArtifactLover',
    'TribalPlayer',
    'ComboCrafter'
  ];
  deck_record RECORD;
  comment_texts text[] := ARRAY[
    'Great deck! Love the card choices.',
    'This looks really solid! Keep it up!',
    'Interesting build, I like the synergy!',
    'Nice deck! Have you considered adding more removal?',
    'Love the theme! Very creative.',
    'This looks fun to play! Well done.',
    'Great job on this! The mana curve looks good.',
    'Really like this list! Might build something similar.',
    'Solid construction! Would love to see this in action.',
    'Nice work! This looks competitive.',
    'Cool deck! The card choices make sense.',
    'This is awesome! Really well thought out.',
    'Great synergy between the cards!',
    'I like the direction you took with this.',
    'Very interesting take on this archetype!',
    'This looks powerful! Nice build.',
    'Really clean decklist! Well done.',
    'Love the interaction between these cards!',
    'This looks like a lot of fun to pilot!',
    'Solid deck! The strategy is clear.'
  ];
  i int;
  num_likes int;
  num_comments int;
  selected_comment text;
  your_user_id uuid;
  your_username text;
  deck_owner_id uuid;
BEGIN
  -- Get YOUR user ID (the deck owner)
  SELECT id, username INTO your_user_id, your_username
  FROM profiles
  WHERE is_admin = true
  LIMIT 1;
  
  IF your_user_id IS NULL THEN
    -- Fallback: get any user
    SELECT id, username INTO your_user_id, your_username
    FROM profiles
    LIMIT 1;
  END IF;
  
  IF your_user_id IS NULL THEN
    RAISE EXCEPTION 'No user found! Please ensure you have a profile created.';
  END IF;

  RAISE NOTICE '👤 Using user: % (ID: %)', your_username, your_user_id;

  -- Seed likes for public decks with 10+ cards
  -- We'll just increase the like count in a realistic way
  FOR deck_record IN 
    SELECT d.id, d.title, d.user_id
    FROM decks d
    WHERE d.is_public = true
    AND (
      SELECT COUNT(*)
      FROM deck_cards dc
      WHERE dc.deck_id = d.id
    ) >= 10
  LOOP
    deck_owner_id := deck_record.user_id;
    
    -- Only add like if the owner hasn't already liked their own deck
    INSERT INTO deck_likes (deck_id, user_id, created_at)
    VALUES (
      deck_record.id,
      deck_owner_id,
      NOW() - (random() * interval '60 days')
    )
    ON CONFLICT (deck_id, user_id) DO NOTHING;

    -- Generate random number of comments (3-5) with varied authors
    num_comments := 3 + floor(random() * 3)::int;
    
    RAISE NOTICE '💬 Adding % comments to deck: %', num_comments, deck_record.title;
    
    -- Add varied comments
    FOR i IN 1..num_comments LOOP
      selected_comment := comment_texts[1 + floor(random() * array_length(comment_texts, 1))::int];
      
      INSERT INTO deck_comments (deck_id, user_id, content, created_at, updated_at)
      VALUES (
        deck_record.id,
        deck_owner_id, -- Using deck owner's ID
        selected_comment,
        NOW() - (random() * interval '45 days'),
        NOW() - (random() * interval '45 days')
      );
    END LOOP;

  END LOOP;

  RAISE NOTICE '✅ Social proof seeding complete!';
END $$;

-- Query to verify the results
SELECT 
  d.title,
  d.is_public,
  (SELECT COUNT(*) FROM deck_cards dc WHERE dc.deck_id = d.id) as card_count,
  (SELECT COUNT(*) FROM deck_likes dl WHERE dl.deck_id = d.id) as likes,
  (SELECT COUNT(*) FROM deck_comments dc WHERE dc.deck_id = d.id) as comments
FROM decks d
WHERE d.is_public = true
ORDER BY likes DESC;


-- 🎭 BETTER Social Proof Seeding (with real test accounts)
-- 
-- STEP 1: First, manually create 5-10 test accounts in Supabase:
--   1. Go to Supabase Dashboard > Authentication > Users
--   2. Click "Add user" > "Create new user"
--   3. Create accounts like:
--      - cardwizard@test.com (password: TestPass123!)
--      - manamaster@test.com (password: TestPass123!)
--      - deckbuilder@test.com (password: TestPass123!)
--      - etc. (see usernames below for ideas)
--   4. After creating, copy their UUIDs
--
-- STEP 2: Replace the UUIDs below with the real test account UUIDs
--
-- STEP 3: Run this script!

DO $$
DECLARE
  -- ✅ Real test account UUIDs
  test_user_ids uuid[] := ARRAY[
    '3f63df66-fc00-43a5-bb42-b50a7e309335',
    '4cbba350-dcf1-448f-954a-288597949ee1',
    'a987ed7f-ff80-4ed1-99ff-d0320f9ba765',
    'e2663961-3d65-461c-aa12-0a0f0bd8e242',
    'e72f2422-1139-49e2-b45d-cbacca17fa62'
  ];
  
  test_usernames text[] := ARRAY[
    'CardWizard',
    'ManaMaster',
    'DeckBuilder42',
    'PlaneswalkerPro',
    'CommanderFan'
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
  selected_user_id uuid;
  selected_comment text;
  
BEGIN
  -- Update profiles with nice usernames
  FOR i IN 1..array_length(test_user_ids, 1) LOOP
    UPDATE profiles
    SET username = test_usernames[i]
    WHERE id = test_user_ids[i];
    
    UPDATE profiles_public
    SET username = test_usernames[i],
        display_name = test_usernames[i]
    WHERE id = test_user_ids[i];
  END LOOP;
  
  RAISE NOTICE '✅ Updated % test account usernames', array_length(test_user_ids, 1);

  -- Seed likes and comments for public decks with 10+ cards
  FOR deck_record IN 
    SELECT d.id, d.title
    FROM decks d
    WHERE d.is_public = true
    AND (
      SELECT COUNT(*)
      FROM deck_cards dc
      WHERE dc.deck_id = d.id
    ) >= 10
  LOOP
    -- Generate random number of likes (10-20)
    num_likes := 10 + floor(random() * 11)::int;
    
    RAISE NOTICE '💙 Adding ~%  likes to deck: %', num_likes, deck_record.title;
    
    -- Add likes from random test users (with repetition for higher counts)
    FOR i IN 1..num_likes LOOP
      selected_user_id := test_user_ids[1 + floor(random() * array_length(test_user_ids, 1))::int];
      
      INSERT INTO deck_likes (deck_id, user_id, created_at)
      VALUES (
        deck_record.id,
        selected_user_id,
        NOW() - (random() * interval '60 days')
      )
      ON CONFLICT (deck_id, user_id) DO NOTHING; -- Skip duplicates
    END LOOP;

    -- Generate random number of comments (2-4)
    num_comments := 2 + floor(random() * 3)::int;
    
    RAISE NOTICE '💬 Adding % comments to deck: %', num_comments, deck_record.title;
    
    -- Add comments from random test users
    FOR i IN 1..num_comments LOOP
      selected_user_id := test_user_ids[1 + floor(random() * array_length(test_user_ids, 1))::int];
      selected_comment := comment_texts[1 + floor(random() * array_length(comment_texts, 1))::int];
      
      INSERT INTO deck_comments (deck_id, user_id, content, created_at, updated_at)
      VALUES (
        deck_record.id,
        selected_user_id,
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


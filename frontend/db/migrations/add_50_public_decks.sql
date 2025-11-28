-- Add 50 public decks for user 990d69b2-3500-4833-81df-b05e07f929db
-- This script creates diverse Commander decks with realistic deck lists

DO $$
DECLARE
  user_id_val uuid := '990d69b2-3500-4833-81df-b05e07f929db';
  deck_id_val uuid;
  deck_titles text[] := ARRAY[
    'Atraxa, Praetors Voice - +1/+1 Counters',
    'Yuriko, the Tigers Shadow - Ninja Tribal',
    'Krenko, Mob Boss - Goblin Tokens',
    'Meren of Clan Nel Toth - Reanimator',
    'Chulane, Teller of Tales - Landfall',
    'Korvold, Fae-Cursed King - Treasure Storm',
    'Jodah, Archmage Eternal - Big Spells',
    'Prosper, Tome-Bound - Exile Matters',
    'Edgar Markov - Vampire Tribal',
    'The Ur-Dragon - Dragon Tribal',
    'Atraxa, Grand Unifier - Superfriends',
    'Korvold, Gleeful Glutton - Food Tokens',
    'Miirym, Sentinel Wyrm - Dragon Tribal',
    'Kinnan, Bonder Prodigy - Artifact Ramp',
    'Niv-Mizzet, Parun - Spellslinger',
    'Tymna the Weaver + Kraum - Card Draw',
    'Kenrith, the Returned King - 5-Color Goodstuff',
    'Ghave, Guru of Spores - Token Combo',
    'Muldrotha, the Gravetide - Value Engine',
    'Breya, Etherium Shaper - Artifact Combo',
    'Yawgmoth, Thran Physician - Aristocrats',
    'Gitrog Monster - Lands Matter',
    'Kess, Dissident Mage - Spellslinger',
    'Tymna + Thrasios - Control',
    'Najeela, the Blade-Blossom - Warrior Tribal',
    'Korvold, Fae-Cursed King - Sacrifice',
    'Chulane, Teller of Tales - Bounce',
    'Golos, Tireless Pilgrim - 5-Color',
    'Jodah, Archmage Eternal - Cascade',
    'Atraxa, Praetors Voice - Infect',
    'Yuriko, the Tigers Shadow - Topdeck',
    'Krenko, Mob Boss - Aggro',
    'Meren of Clan Nel Toth - Value',
    'Chulane, Teller of Tales - Combo',
    'Korvold, Fae-Cursed King - Value',
    'Jodah, Archmage Eternal - Big Mana',
    'Prosper, Tome-Bound - Exile',
    'Edgar Markov - Aggro',
    'The Ur-Dragon - Tribal',
    'Atraxa, Grand Unifier - Control',
    'Korvold, Gleeful Glutton - Tokens',
    'Miirym, Sentinel Wyrm - Tribal',
    'Kinnan, Bonder Prodigy - Ramp',
    'Niv-Mizzet, Parun - Draw',
    'Tymna + Kraum - Midrange',
    'Kenrith, the Returned King - Goodstuff',
    'Ghave, Guru of Spores - Combo',
    'Muldrotha, the Gravetide - Graveyard',
    'Breya, Etherium Shaper - Artifacts'
  ];
  
  commanders text[] := ARRAY[
    'Atraxa, Praetors Voice',
    'Yuriko, the Tigers Shadow',
    'Krenko, Mob Boss',
    'Meren of Clan Nel Toth',
    'Chulane, Teller of Tales',
    'Korvold, Fae-Cursed King',
    'Jodah, Archmage Eternal',
    'Prosper, Tome-Bound',
    'Edgar Markov',
    'The Ur-Dragon',
    'Atraxa, Grand Unifier',
    'Korvold, Gleeful Glutton',
    'Miirym, Sentinel Wyrm',
    'Kinnan, Bonder Prodigy',
    'Niv-Mizzet, Parun',
    'Tymna the Weaver',
    'Kenrith, the Returned King',
    'Ghave, Guru of Spores',
    'Muldrotha, the Gravetide',
    'Breya, Etherium Shaper',
    'Yawgmoth, Thran Physician',
    'The Gitrog Monster',
    'Kess, Dissident Mage',
    'Thrasios, Triton Hero',
    'Najeela, the Blade-Blossom',
    'Korvold, Fae-Cursed King',
    'Chulane, Teller of Tales',
    'Golos, Tireless Pilgrim',
    'Jodah, Archmage Eternal',
    'Atraxa, Praetors Voice',
    'Yuriko, the Tigers Shadow',
    'Krenko, Mob Boss',
    'Meren of Clan Nel Toth',
    'Chulane, Teller of Tales',
    'Korvold, Fae-Cursed King',
    'Jodah, Archmage Eternal',
    'Prosper, Tome-Bound',
    'Edgar Markov',
    'The Ur-Dragon',
    'Atraxa, Grand Unifier',
    'Korvold, Gleeful Glutton',
    'Miirym, Sentinel Wyrm',
    'Kinnan, Bonder Prodigy',
    'Niv-Mizzet, Parun',
    'Tymna the Weaver',
    'Kenrith, the Returned King',
    'Ghave, Guru of Spores',
    'Muldrotha, the Gravetide',
    'Breya, Etherium Shaper',
    'Yawgmoth, Thran Physician'
  ];
  
  color_combos text[][] := ARRAY[
    ARRAY['W', 'U', 'B', 'G'],
    ARRAY['U', 'B'],
    ARRAY['R'],
    ARRAY['B', 'G'],
    ARRAY['W', 'U', 'G'],
    ARRAY['B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['B', 'R'],
    ARRAY['W', 'B', 'R'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'G'],
    ARRAY['B', 'R', 'G'],
    ARRAY['U', 'R', 'G'],
    ARRAY['U', 'G'],
    ARRAY['U', 'R'],
    ARRAY['W', 'B'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'B', 'G'],
    ARRAY['B', 'G', 'U'],
    ARRAY['W', 'U', 'B', 'R'],
    ARRAY['B'],
    ARRAY['B', 'G'],
    ARRAY['U', 'B', 'R'],
    ARRAY['W', 'U', 'B', 'G'],
    ARRAY['W', 'U', 'B', 'R'],
    ARRAY['B', 'R', 'G'],
    ARRAY['W', 'U', 'G'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'G'],
    ARRAY['U', 'B'],
    ARRAY['R'],
    ARRAY['B', 'G'],
    ARRAY['W', 'U', 'G'],
    ARRAY['B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['B', 'R'],
    ARRAY['W', 'B', 'R'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'U', 'B', 'G'],
    ARRAY['B', 'R', 'G'],
    ARRAY['U', 'R', 'G'],
    ARRAY['U', 'G'],
    ARRAY['U', 'R'],
    ARRAY['W', 'B'],
    ARRAY['W', 'U', 'B', 'R', 'G'],
    ARRAY['W', 'B', 'G'],
    ARRAY['B', 'G', 'U'],
    ARRAY['W', 'U', 'B', 'R'],
    ARRAY['B']
  ];
  
  i int;
  deck_title text;
  commander_name text;
  colors_array text[];
  deck_text_sample text;
  created_time timestamptz;
  card_lines text[];
  card_line text;
  card_name text;
  card_qty int;
  line_parts text[];
BEGIN
  FOR i IN 1..50 LOOP
    deck_title := deck_titles[i];
    commander_name := commanders[i];
    colors_array := color_combos[i];
    created_time := now() - (random() * interval '30 days');
    
    -- Generate a realistic deck list
    deck_text_sample := commander_name || E'\n';
    deck_text_sample := deck_text_sample || '1 Sol Ring' || E'\n';
    deck_text_sample := deck_text_sample || '1 Arcane Signet' || E'\n';
    deck_text_sample := deck_text_sample || '1 Command Tower' || E'\n';
    
    -- Add some staples based on colors
    IF 'U' = ANY(colors_array) THEN
      deck_text_sample := deck_text_sample || '1 Counterspell' || E'\n';
      deck_text_sample := deck_text_sample || '1 Cyclonic Rift' || E'\n';
    END IF;
    IF 'B' = ANY(colors_array) THEN
      deck_text_sample := deck_text_sample || '1 Demonic Tutor' || E'\n';
      deck_text_sample := deck_text_sample || '1 Toxic Deluge' || E'\n';
    END IF;
    IF 'R' = ANY(colors_array) THEN
      deck_text_sample := deck_text_sample || '1 Chaos Warp' || E'\n';
      deck_text_sample := deck_text_sample || '1 Blasphemous Act' || E'\n';
    END IF;
    IF 'G' = ANY(colors_array) THEN
      deck_text_sample := deck_text_sample || '1 Cultivate' || E'\n';
      deck_text_sample := deck_text_sample || '1 Kodamas Reach' || E'\n';
      deck_text_sample := deck_text_sample || '1 Beast Within' || E'\n';
    END IF;
    IF 'W' = ANY(colors_array) THEN
      deck_text_sample := deck_text_sample || '1 Swords to Plowshares' || E'\n';
      deck_text_sample := deck_text_sample || '1 Path to Exile' || E'\n';
      deck_text_sample := deck_text_sample || '1 Wrath of God' || E'\n';
    END IF;
    
    -- Add lands (36 total for Commander)
    deck_text_sample := deck_text_sample || '8 Island' || E'\n';
    deck_text_sample := deck_text_sample || '8 Mountain' || E'\n';
    deck_text_sample := deck_text_sample || '8 Swamp' || E'\n';
    deck_text_sample := deck_text_sample || '8 Forest' || E'\n';
    deck_text_sample := deck_text_sample || '4 Plains' || E'\n';
    
    -- Add some random cards to fill to ~100
    deck_text_sample := deck_text_sample || '1 Lightning Bolt' || E'\n';
    deck_text_sample := deck_text_sample || '1 Brainstorm' || E'\n';
    deck_text_sample := deck_text_sample || '1 Dark Ritual' || E'\n';
    deck_text_sample := deck_text_sample || '1 Rampant Growth' || E'\n';
    deck_text_sample := deck_text_sample || '1 Opt' || E'\n';
    deck_text_sample := deck_text_sample || '1 Ponder' || E'\n';
    deck_text_sample := deck_text_sample || '1 Preordain' || E'\n';
    deck_text_sample := deck_text_sample || '1 Fatal Push' || E'\n';
    deck_text_sample := deck_text_sample || '1 Abrupt Decay' || E'\n';
    deck_text_sample := deck_text_sample || '1 Terminate' || E'\n';
    
    -- Insert deck
    INSERT INTO decks (
      user_id,
      title,
      format,
      plan,
      colors,
      currency,
      deck_text,
      commander,
      is_public,
      public,
      created_at,
      updated_at
    ) VALUES (
      user_id_val,
      deck_title,
      'Commander',
      'Optimized',
      colors_array,
      'USD',
      deck_text_sample,
      commander_name,
      true,
      true,
      created_time,
      created_time
    ) RETURNING id INTO deck_id_val;
    
    -- Insert deck cards (parse deck_text and insert each card)
    card_lines := string_to_array(trim(both E'\n' from deck_text_sample), E'\n');
    FOREACH card_line IN ARRAY card_lines
    LOOP
      -- Parse "1 Card Name" or "2x Card Name"
      line_parts := string_to_array(trim(card_line), ' ');
      IF array_length(line_parts, 1) >= 2 THEN
        -- Try to parse quantity (first part)
        BEGIN
          card_qty := CAST(trim(both 'x' from line_parts[1]) AS int);
        EXCEPTION WHEN OTHERS THEN
          card_qty := 1;
        END;
        
        IF card_qty IS NULL OR card_qty < 1 THEN
          card_qty := 1;
        END IF;
        
        -- Card name is everything after the quantity
        card_name := array_to_string(line_parts[2:], ' ');
        
        IF card_name IS NOT NULL AND length(card_name) > 0 THEN
          INSERT INTO deck_cards (deck_id, name, qty)
          VALUES (deck_id_val, card_name, card_qty)
          ON CONFLICT (deck_id, name) DO UPDATE SET qty = deck_cards.qty + card_qty;
        END IF;
      END IF;
    END LOOP;
    
    RAISE NOTICE 'Created deck %: %', i, deck_title;
  END LOOP;
  
  RAISE NOTICE 'Successfully created 50 public decks for user %', user_id_val;
END $$;


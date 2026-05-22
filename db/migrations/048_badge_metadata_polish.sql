-- Badge metadata polish.
-- Additive only: rarity metadata plus description and progression ordering cleanup.

alter table public.badge_definitions
  add column if not exists rarity text not null default 'common';

alter table public.badge_definitions
  drop constraint if exists badge_definitions_rarity_check;

alter table public.badge_definitions
  add constraint badge_definitions_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'mythic'));

update public.badge_definitions
set
  description = case id
    when 'first_deck' then 'Create your first deck'
    when 'importer' then 'Import your first decklist'
    when 'chatterbox' then 'Send 10 chat messages'
    when 'brewer' then 'Create 5 manual decks from scratch'
    when 'deck_collector' then 'Own 10 decks'
    when 'idea_spark' then 'Use Turn my idea into a deck'
    when 'commander_picker' then 'Use Help me choose a commander 3 times'
    when 'card_whisperer' then 'Use Build around a card 5 times'
    when 'analyst' then 'Run deck analysis 5 times'
    when 'mathlete' then 'Use Probability Calculator 10 times'
    when 'mulligan_master' then 'Run 25,000 mulligan iterations'
    when 'budget_brain' then 'Run Budget Swaps 5 times'
    when 'traders_eye' then 'Use Price Tracker 10 times'
    when 'roasted' then 'Generate your first deck roast'
    when 'salt_miner' then 'Generate 10 deck roasts'
    when 'customizer' then 'Create your first custom card'
    when 'card_collector' then 'Add 100 cards to your collection'
    when 'curator' then 'Add 500 cards to your collection'
    when 'social_mage' then 'Create your first public or shareable profile item'
    when 'inbox_received' then 'Receive your first comment'
    when 'deck_hoarder' then 'Own 50 decks'
    when 'deck_lord' then 'Own 100 decks'
    when 'pro_tactician' then 'Unlock Pro'
    else description
  end,
  sort_order = case id
    when 'first_deck' then 10
    when 'importer' then 20
    when 'chatterbox' then 30
    when 'brewer' then 40
    when 'deck_collector' then 50
    when 'idea_spark' then 60
    when 'commander_picker' then 70
    when 'card_whisperer' then 80
    when 'analyst' then 90
    when 'mathlete' then 100
    when 'mulligan_master' then 110
    when 'budget_brain' then 120
    when 'traders_eye' then 130
    when 'roasted' then 140
    when 'salt_miner' then 150
    when 'customizer' then 160
    when 'card_collector' then 170
    when 'curator' then 180
    when 'social_mage' then 190
    when 'inbox_received' then 200
    when 'deck_hoarder' then 210
    when 'deck_lord' then 220
    when 'pro_tactician' then 230
    else sort_order
  end,
  rarity = case id
    when 'first_deck' then 'common'
    when 'importer' then 'common'
    when 'chatterbox' then 'common'
    when 'idea_spark' then 'common'
    when 'analyst' then 'common'
    when 'roasted' then 'common'
    when 'social_mage' then 'common'
    when 'inbox_received' then 'common'
    when 'brewer' then 'uncommon'
    when 'deck_collector' then 'uncommon'
    when 'commander_picker' then 'uncommon'
    when 'mathlete' then 'uncommon'
    when 'budget_brain' then 'uncommon'
    when 'traders_eye' then 'uncommon'
    when 'customizer' then 'uncommon'
    when 'card_collector' then 'uncommon'
    when 'card_whisperer' then 'rare'
    when 'mulligan_master' then 'rare'
    when 'salt_miner' then 'rare'
    when 'curator' then 'rare'
    when 'deck_hoarder' then 'rare'
    when 'deck_lord' then 'mythic'
    when 'pro_tactician' then 'mythic'
    else rarity
  end,
  updated_at = now()
where id in (
  'first_deck',
  'importer',
  'chatterbox',
  'brewer',
  'deck_collector',
  'idea_spark',
  'commander_picker',
  'card_whisperer',
  'analyst',
  'mathlete',
  'mulligan_master',
  'budget_brain',
  'traders_eye',
  'roasted',
  'salt_miner',
  'customizer',
  'card_collector',
  'curator',
  'social_mage',
  'inbox_received',
  'deck_hoarder',
  'deck_lord',
  'pro_tactician'
);

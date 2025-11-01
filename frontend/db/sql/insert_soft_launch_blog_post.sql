-- Soft Launch Blog Post for ManaTap AI
-- Inserts a welcoming soft launch announcement into the changelog

-- First, let's see what's currently in the changelog (optional check)
-- SELECT value->'entries' FROM app_config WHERE key = 'changelog';

-- Insert or update the changelog with the soft launch post
-- This will add the soft launch entry at the TOP of existing entries (if any)
INSERT INTO app_config (key, value)
VALUES (
  'changelog',
  jsonb_build_object(
    'entries', jsonb_build_array(
      jsonb_build_object(
        'version', 'v1.0.0',
        'date', CURRENT_DATE::text,
        'title', '🎉 Welcome to ManaTap AI – Your MTG Deck Building Assistant is Here!',
        'description', 'We''re thrilled to officially launch ManaTap AI! After months of development and testing, we''re opening the gates to help you build better Magic: The Gathering decks with the power of AI.

This is a **soft launch** – we''re starting small and growing with your feedback. We''d love to hear what you think, what features you''d like to see, and how we can make your deck-building experience even better.

**What You Can Do:**
- Build and analyze Commander, Modern, Legacy, and other format decks
- Get AI-powered suggestions for card swaps and budget optimization  
- Test your opening hands with our interactive mulligan simulator
- Track card prices and manage your collection
- Calculate probabilities and deck statistics

**Try It Out & Share Your Thoughts:**
We''re building this for the MTG community, and your input matters. Found a bug? Have an idea? Love something? Hate something? Let us know via the feedback button or reach out directly.

Thanks for being part of this journey with us. Let''s build some amazing decks together! 🎴✨',
        'features', jsonb_build_array(
          '💬 **AI-Powered Deck Assistant** – Get intelligent suggestions for card swaps, curve balancing, and deck optimization',
          '🎯 **Interactive Mulligan Simulator** – Test your opening hands with the London mulligan and see real card artwork',
          '📊 **Probability Calculator** – Calculate the odds of drawing key cards by turn using hypergeometric distribution',
          '💰 **Budget Optimization** – Smart AI suggestions to keep your deck competitive without breaking the bank',
          '📦 **Collection Management** – Track your cards, build wishlists, and manage your MTG collection all in one place',
          '📈 **Price Tracking** – Monitor card prices with historical snapshots and get alerts when prices drop',
          '🎨 **Beautiful Deck Builder** – Create and edit decks with an intuitive interface and real-time price updates',
          '🔍 **Smart Search** – Natural language search that understands what you''re looking for',
          '📋 **Export & Import** – Export to Moxfield, MTGO, and other popular formats'
        ),
        'type', 'feature'
      )
    ),
    'last_updated', CURRENT_TIMESTAMP::text
  )
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = jsonb_set(
    app_config.value,
    '{entries}',
    jsonb_build_array(
      jsonb_build_object(
        'version', 'v1.0.0',
        'date', CURRENT_DATE::text,
        'title', '🎉 Welcome to ManaTap AI – Your MTG Deck Building Assistant is Here!',
        'description', 'We''re thrilled to officially launch ManaTap AI! After months of development and testing, we''re opening the gates to help you build better Magic: The Gathering decks with the power of AI.

This is a **soft launch** – we''re starting small and growing with your feedback. We''d love to hear what you think, what features you''d like to see, and how we can make your deck-building experience even better.

**What You Can Do:**
- Build and analyze Commander, Modern, Legacy, and other format decks
- Get AI-powered suggestions for card swaps and budget optimization  
- Test your opening hands with our interactive mulligan simulator
- Track card prices and manage your collection
- Calculate probabilities and deck statistics

**Try It Out & Share Your Thoughts:**
We''re building this for the MTG community, and your input matters. Found a bug? Have an idea? Love something? Hate something? Let us know via the feedback button or reach out directly.

Thanks for being part of this journey with us. Let''s build some amazing decks together! 🎴✨',
        'features', jsonb_build_array(
          '💬 **AI-Powered Deck Assistant** – Get intelligent suggestions for card swaps, curve balancing, and deck optimization',
          '🎯 **Interactive Mulligan Simulator** – Test your opening hands with the London mulligan and see real card artwork',
          '📊 **Probability Calculator** – Calculate the odds of drawing key cards by turn using hypergeometric distribution',
          '💰 **Budget Optimization** – Smart AI suggestions to keep your deck competitive without breaking the bank',
          '📦 **Collection Management** – Track your cards, build wishlists, and manage your MTG collection all in one place',
          '📈 **Price Tracking** – Monitor card prices with historical snapshots and get alerts when prices drop',
          '🎨 **Beautiful Deck Builder** – Create and edit decks with an intuitive interface and real-time price updates',
          '🔍 **Smart Search** – Natural language search that understands what you''re looking for',
          '📋 **Export & Import** – Export to Moxfield, MTGO, and other popular formats'
        ),
        'type', 'feature'
      )
    ) || COALESCE(app_config.value->'entries', '[]'::jsonb)
  )
  || jsonb_build_object('last_updated', CURRENT_TIMESTAMP::text);

-- Verify it was inserted correctly
-- SELECT value->'entries'->0 FROM app_config WHERE key = 'changelog';

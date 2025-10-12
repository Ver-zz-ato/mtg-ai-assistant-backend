-- Insert/update changelog entries in the app_config table
-- Run this in your Supabase SQL editor

INSERT INTO app_config (key, value, updated_at)
VALUES (
  'changelog',
  '{
    "entries": [
      {
        "version": "v1.3.0",
        "date": "2025-10-10",
        "title": "Enhanced User Experience & AI Intelligence", 
        "type": "feature",
        "description": "Major platform improvements focused on personalization, trust, and seamless sharing. Your MTG deck building experience just got significantly smarter and more intuitive.",
        "features": [
          "🤖 Personalized AI Memory: The AI now remembers your recent decks and cards to provide more relevant suggestions and greetings",
          "🔗 Enhanced Sharing: Share your decks to Discord, Reddit, Twitter with one click and platform-specific formatting",
          "💡 Pro Feature Insights: Hover over Pro features to see detailed benefits and upgrade information",
          "🔍 Transparent AI: See exactly which AI model (GPT-4o Mini) and data sources (Scryfall) power your experience",
          "📢 What''s New System: Stay updated with platform changes through our new changelog page"
        ],
        "fixes": [
          "⚡ Improved analytics tracking for better feature discovery",
          "🛡️ Enhanced privacy controls for AI personalization features",
          "🎨 Better visual feedback for sharing actions and tooltips"
        ]
      },
      {
        "version": "v1.2.5",
        "date": "2025-10-03",
        "title": "Building Trust Through Transparency",
        "type": "improvement", 
        "description": "We believe in transparent AI. Now you can see exactly how your deck analysis works and where our data comes from.",
        "features": [
          "🔎 AI Model Attribution: See which OpenAI GPT model powers your analysis",
          "📊 Data Source Transparency: Clear attribution to Scryfall for card data and pricing",
          "🔒 Privacy-First Design: Explicit consent for personalization features with easy opt-out"
        ],
        "fixes": [
          "📈 Better error reporting with more helpful context",
          "🎯 Improved feature discovery through enhanced navigation"
        ]
      },
      {
        "version": "v1.2.0",
        "date": "2025-09-26",
        "title": "Analytics & Performance Foundation",
        "type": "improvement",
        "description": "Behind-the-scenes improvements to make your deck building experience smoother and help us understand what features you love most.",
        "features": [
          "📊 Enhanced usage analytics to improve feature development",
          "🔍 Better search tracking for card discovery",
          "⚠️ Improved error detection and user support"
        ],
        "fixes": [
          "🚀 Better page loading performance",
          "🛠️ Enhanced error boundary reporting",
          "📱 Improved mobile responsiveness across components"
        ]
      }
    ],
    "last_updated": "2025-10-12T19:35:00.000Z"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) 
DO UPDATE SET 
  value = EXCLUDED.value,
  updated_at = EXCLUDED.updated_at;
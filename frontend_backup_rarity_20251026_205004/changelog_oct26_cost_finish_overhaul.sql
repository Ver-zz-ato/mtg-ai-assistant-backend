-- Cost to Finish Overhaul - October 26, 2025
-- Major visual and functional improvements

INSERT INTO changelog (version, title, description, category, created_at) VALUES
(
  '2.8.0',
  'Cost to Finish Visual & UX Overhaul',
  '## Visual Enhancements
- ✨ Massive gradient cost display with 5xl font
- 📊 Progress bar showing deck completion percentage
- 💎 Enhanced "Top Missing Cards" grid with card thumbnails & prices
- 🎯 Direct Budget Swaps integration per card
- 💵 Improved distribution charts with emojis and colored borders
- ⚡ Loading shimmers during computation
- 🎨 Enhanced action buttons with Pro badges

## UX Improvements
- ⬆️ Moved "Subtract cards I already own" above collection dropdown
- 💬 Better Pro toasts with direct link to pricing page
- 🔗 "Find budget alternative" buttons on Top Missing Cards
- ✅ Better success feedback for all export actions
- 📱 Responsive card hover previews
- 🎭 Better empty states and loading indicators

## Bug Fixes
- Fixed Budget Swaps commander art loading (now uses robust API)
- Fixed compute button styling and feedback
- Fixed distribution chart headers (no longer flat)
- Improved action button clarity with yellow Pro badges',
  'feature',
  NOW()
);










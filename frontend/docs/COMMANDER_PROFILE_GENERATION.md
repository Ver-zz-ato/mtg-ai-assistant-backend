# Commander Profile Generation Guide

This document provides instructions for generating commander profiles using ChatGPT or another LLM.

## Current State

The app currently has **20 commander profiles** in `lib/data/commander_profiles.json`. These profiles help the AI provide better deck-building suggestions by understanding each commander's:
- Primary game plan
- Preferred synergy tags
- Cards/strategies to avoid
- Special notes for optimization

## Commanders Needing Profiles

The following popular commanders need profiles added. Prioritized by EDHREC popularity and user demand.

### Tier 1 - High Priority (Most Played)
1. Teysa Karlov
2. Korvold, Fae-Cursed King
3. Meren of Clan Nel Toth
4. Animar, Soul of Elements
5. Prosper, Tome-Bound
6. Winota, Joiner of Forces
7. Selvala, Heart of the Wilds
8. Urza, Lord High Artificer
9. Najeela, the Blade-Blossom
10. Arcades, the Strategist
11. Wilhelt, the Rotcleaver
12. Sythis, Harvest's Hand
13. Kess, Dissident Mage
14. Brago, King Eternal
15. Chatterfang, Squirrel General
16. Zada, Hedron Grinder
17. Feather, the Redeemed
18. Omnath, Locus of Creation
19. Tasigur, the Golden Fang
20. Muldrotha, the Gravetide

### Tier 2 - Medium Priority
21. Breya, Etherium Shaper
22. Yarok, the Desecrated
23. Niv-Mizzet, Parun
24. Ghired, Conclave Exile
25. Syr Konrad, the Grim
26. Zur the Enchanter
27. Ezuri, Claw of Progress
28. Marchesa, the Black Rose
29. Saskia the Unyielding
30. Maelstrom Wanderer
31. Xenagos, God of Revels
32. Gishath, Sun's Avatar
33. Kadena, Slinking Sorcerer
34. Alela, Artful Provocateur
35. Kalamax, the Stormsire
36. Osgir, the Reconstructor
37. Adrix and Nev, Twincasters
38. Volo, Guide to Monsters
39. Tovolar, Dire Overlord
40. Old Stickfingers

### Tier 3 - Additional Popular Commanders
41. Aesi, Tyrant of Gyre Strait
42. Magda, Brazen Outlaw
43. Light-Paws, Emperor's Voice
44. Raffine, Scheming Seer
45. Jetmir, Nexus of Revels
46. Jan Jansen, Chaos Crafter
47. Rocco, Cabaretti Caterer
48. Hinata, Dawn-Crowned
49. Satoru Umezawa
50. Go-Shintai of Life's Origin

## ChatGPT Prompt Template

Copy and paste this prompt into ChatGPT to generate profiles:

```
Generate MTG Commander deck-building profiles in JSON format for an AI assistant.
Each profile should be detailed enough to help suggest cards and identify deck weaknesses.

For each commander below, provide:
1. "plan": 1-2 sentence core strategy description
2. "preferTags": array of 4-6 synergy keywords (e.g., "tokens", "sacrifice", "aristocrats", "graveyard")
3. "avoid": array of 2-4 things to avoid (bad synergies, anti-patterns)
4. "notes": Additional deck-building guidance, key cards to include, or pitfalls

Format as valid JSON object where keys are exact commander names:

{
  "Commander Name": {
    "plan": "Brief strategy",
    "preferTags": ["tag1", "tag2", "tag3", "tag4"],
    "avoid": ["anti-pattern1", "anti-pattern2"],
    "notes": "Additional guidance"
  }
}

Commanders to profile:
[PASTE COMMANDER LIST HERE]

Be specific and accurate. Reference actual card names and strategies. Each profile should help an AI assistant:
- Suggest cards that synergize with the commander's strategy
- Avoid recommending cards that don't fit the game plan
- Identify when a deck is unfocused or missing key synergies
```

## Example Output

Here's what a good profile looks like:

```json
{
  "Teysa Karlov": {
    "plan": "Aristocrats combo leveraging death triggers doubling; sacrifice tokens for card advantage and damage.",
    "preferTags": ["aristocrats", "tokens", "sacrifice", "death triggers", "lifedrain"],
    "avoid": ["non-synergistic big creatures", "combat-focused strategies", "exile-based removal"],
    "notes": "Prioritize Blood Artist effects, token generators, and free sacrifice outlets. Key pieces: Pitiless Plunderer, Grave Pact, Dictate of Erebos. Keep curve low to enable repeated sacrifice loops."
  }
}
```

## Integration Instructions

After receiving the generated JSON from ChatGPT:

1. Validate the JSON is properly formatted
2. Review each profile for accuracy
3. Merge into `frontend/lib/data/commander_profiles.json`
4. Run `npm run build` to verify no syntax errors

## Profile Quality Checklist

For each profile, verify:
- [ ] Plan accurately describes the commander's primary strategy
- [ ] PreferTags are relevant synergy keywords (not generic terms)
- [ ] Avoid list contains actual anti-patterns for the deck
- [ ] Notes mention specific cards or interactions where helpful
- [ ] No typos in card names or commander names

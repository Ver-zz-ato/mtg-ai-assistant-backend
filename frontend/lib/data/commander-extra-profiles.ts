import type { FlagshipGuideContent, GuideTier } from "@/lib/commanders";

export type ExtraCommanderProfileSource = {
  plan: string;
  preferTags: string[];
  notes: string;
  avoid: string[];
  guideTier?: GuideTier;
  featuredGuide?: boolean;
  flagship?: FlagshipGuideContent;
};

export const EXTRA_COMMANDER_PROFILES: Record<string, ExtraCommanderProfileSource> = {
  "Breya, Etherium Shaper": {
    plan: "Artifact combo-value shell that uses Breya's tokens as mana pieces, sacrifice fodder, and clean finishers.",
    preferTags: ["artifacts", "combo", "sacrifice", "treasures", "control"],
    notes: "Prioritize cheap artifact density, clean mana, and payoffs that turn incidental thopters or treasures into a real engine. Breya gets much better when your removal, ramp, and combo pieces all overlap.",
    avoid: ["creature-heavy piles without artifact support", "cute four-color goodstuff", "top end with no early artifact density"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Breya turns ordinary artifact setup into pressure, removal, and combo lines without wasting slots.",
      bestFor: "Players who like toolbox artifacts, layered combo finishes, and flexible four-color control shells.",
      winPaths: [
        "Assemble artifact loops that generate mana, damage, or infinite ETBs",
        "Chip in with thopters, then convert resources into a decisive Breya activation turn",
        "Play value-control until artifact payoffs snowball out of reach"
      ],
      traps: [
        "Running shiny artifact cards that do not advance your engine",
        "Too many expensive haymakers and not enough cheap artifacts",
        "Four-color mana that looks playable but cannot curve cleanly"
      ],
      upgradePriority: [
        "1. Smooth artifact-heavy mana and cheap acceleration",
        "2. Sac outlets, untap effects, and compact payoff pieces",
        "3. Interaction that doubles as artifact support",
        "4. Finishers only after the shell is consistent"
      ],
      openingPlan: [
        "Turn 1: cheap rock, bauble, or setup piece",
        "Turn 2: develop artifact count and hold efficient interaction where possible",
        "Turn 3+: land Breya into a board that can use the tokens immediately"
      ],
      tableReputation: "Usually respected as a combo deck once Breya hits the table with mana already set up.",
      communityHeadline: "How people build Breya now",
      communitySubhead: "Compare value-control shells, combo density, and artifact packages in public lists."
    }
  },
  "Rhys the Redeemed": {
    plan: "Go-wide token deck that wins by flooding the board early and turning token doubling into lethal combat.",
    preferTags: ["tokens", "elves", "go wide", "anthems", "doublers"],
    notes: "The deck is strongest when your first token makers are cheap and your payoffs multiply boards instead of adding one more medium creature. Rhys wants mana sinks, token velocity, and finishers that reward width.",
    avoid: ["single tall threats", "too many defensive value creatures", "token cards that do not scale with doubling"],
  },
  "Osgir, the Reconstructor": {
    plan: "Artifact recursion deck that turns the graveyard into a second hand and copies key utility artifacts for burst value.",
    preferTags: ["artifacts", "recursion", "graveyard", "tokens", "value"],
    notes: "Cheap artifacts that replace themselves are premium here because they keep Osgir's activation live without overcommitting. The best builds line up mana rocks, fodder artifacts, and a few high-impact targets to copy.",
    avoid: ["artifact bombs with no setup", "too many nonartifact spells", "graveyard plans without self-stock or sacrifice support"],
  },
  "Esix, Fractal Bloom": {
    plan: "Token-copy deck that turns ordinary token makers into the best creature on the table at the right moment.",
    preferTags: ["tokens", "clones", "ETB", "ramp", "value"],
    notes: "Esix rewards patient sequencing more than raw greed. Token makers that can become utility creatures, card-draw threats, or finishers are far better than generic bodies with no immediate impact.",
    avoid: ["token makers with no meaningful copy targets", "expensive clones without token support", "ramp-only hands that never produce pressure"],
  },
  "Chulane, Teller of Tales": {
    plan: "Creature engine deck that chains cheap creatures into cards, lands, and combo-adjacent snowball turns.",
    preferTags: ["creatures", "ramp", "draw", "combo", "ETB"],
    notes: "Low-curve creatures and bounce loops matter more than splashy finishers. Chulane becomes unfair when your deck keeps turning one creature cast into mana, another card, and another trigger.",
    avoid: ["high-curve creature piles", "noncreature filler that breaks creature density", "hands with payoffs but no early velocity"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Chulane rewards efficient creature sequencing so hard that fair-looking turns suddenly become enormous.",
      bestFor: "Players who enjoy creature-combo tension, value engines, and decks that snowball through small decisions.",
      winPaths: [
        "Outdraw the table while making every land drop",
        "Loop creatures or bounce effects into a combo finish",
        "Overwhelm with value creatures once your hand never empties"
      ],
      traps: [
        "Too many expensive creatures that do not trigger clean chains",
        "Noncreature cards that interrupt your engine density",
        "Keeping slow hands because Chulane looks strong on paper"
      ],
      upgradePriority: [
        "1. One- and two-mana creatures that replace themselves",
        "2. Bounce, untap, and combo-friendly utility creatures",
        "3. Protection and efficient interaction",
        "4. Finishers only after the chain starts smoothly"
      ],
      openingPlan: [
        "Turn 1: dork or cheap setup creature",
        "Turn 2: add velocity or hold up cheap interaction",
        "Turn 3+: deploy Chulane when you can follow with another creature quickly"
      ],
      tableReputation: "Often underestimated for one turn, then treated like a combo deck once the draw engine starts.",
      communityHeadline: "How people build Chulane now",
      communitySubhead: "See curve choices, bounce packages, and creature-engine density in live lists."
    }
  },
  "Krenko, Tin Street Kingpin": {
    plan: "Combat-first goblin swarm that uses +1/+1 counters and haste support to turn one attacker into a huge board.",
    preferTags: ["goblins", "tokens", "combat", "haste", "go wide"],
    notes: "Tin Street Krenko wants cheap enablers and protection more than expensive goblin top end. The deck gets paid when your first clean attack step multiplies bodies fast enough to threaten the next one.",
    avoid: ["slow goblin tribal filler", "hands with payoffs but no haste or attack support", "too many expensive noncreature spells"],
  },
  "Etali, Primal Storm": {
    plan: "Big red attack deck that ramps into Etali and turns attack steps into free spells and overwhelming tempo.",
    preferTags: ["big mana", "attack triggers", "chaos value", "ramp", "haste"],
    notes: "The deck wants to bridge into Etali quickly and keep attack steps safe. Extra combat support, haste, and protection usually matter more than adding one more expensive threat that does nothing if Etali never swings.",
    avoid: ["too many 7+ mana threats", "no haste support", "reactive hands that do not accelerate toward Etali"],
  },
  "Xyris, the Writhing Storm": {
    plan: "Wheel deck that converts table-wide card draw into a snake swarm and wins through pressure or payoff damage.",
    preferTags: ["wheels", "tokens", "card draw", "tempo", "damage payoffs"],
    notes: "Xyris is at its best when wheel effects, protection, and token payoffs are all live together. The deck wants to turn one big draw-seven into either lethal pressure or a protected board the table cannot cleanly reset.",
    avoid: ["group hug draws without punishment", "token payoffs with too few wheel effects", "slow midrange cards that do not scale with hand refills"],
  },
  "Tivit, Seller of Secrets": {
    plan: "Esper artifact-control shell that uses Clues and Treasures for mana, cards, and combo pressure.",
    preferTags: ["artifacts", "control", "clues", "treasures", "combo"],
    notes: "Tivit rewards staying disciplined on mana and interaction until the artifact tokens actually convert into a lead. Your best cards either make Tivit safer to land or turn the extra artifacts into a closing engine.",
    avoid: ["expensive esper goodstuff with no artifact payoff", "cute voting cards that do not matter", "slow starts with no ramp into Tivit"],
  },
  "Prossh, Skyraider of Kher": {
    plan: "Token-sacrifice commander that turns one cast into a sacrifice engine, burst damage, or combo finish.",
    preferTags: ["tokens", "sacrifice", "aristocrats", "dragons", "combo"],
    notes: "Prossh is strongest when every kobold matters. Free sac outlets, damage payoffs, and mana lines that let you cast Prossh early or repeatedly will outperform generic Jund beaters almost every time.",
    avoid: ["dragon tribal dilution", "expensive fodder-light hands", "payoffs with no sacrifice outlet support"],
  },
  "Aesi, Tyrant of Gyre Strait": {
    plan: "Lands deck that ramps hard, converts extra land drops into cards, and wins by overwhelming the table with mana and value.",
    preferTags: ["lands", "ramp", "draw", "landfall", "big mana"],
    notes: "Aesi wants land velocity first and finishers second. Cheap ramp, extra land-drop effects, and cards that turn landfall into pressure are what make the seven-mana commander worth the setup time.",
    avoid: ["too many payoff monsters and not enough early ramp", "cute landfall cards with no volume", "hands that cannot reliably cast Aesi on time"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Aesi turns basic land development into an absurd amount of mana and card flow without needing weird hoops.",
      bestFor: "Players who love smooth ramp, huge turns, and the feeling that every fetch or extra land drop matters.",
      winPaths: [
        "Overwhelm the table with landfall value and giant mana turns",
        "Chain draw into a board too big to answer cleanly",
        "Use extra land velocity to enable explosive finishers or combo-adjacent loops"
      ],
      traps: [
        "Payoff-heavy hands with no early ramp",
        "Landfall cards that look flashy but do not swing the game",
        "Assuming Aesi alone fixes a clunky early game"
      ],
      upgradePriority: [
        "1. Cheap ramp and extra-land-drop support",
        "2. Landfall cards that generate real cards or pressure",
        "3. Protection and interaction so you survive to your big turns",
        "4. Expensive finishers only after velocity is solved"
      ],
      openingPlan: [
        "Turn 1: land plus setup if available",
        "Turn 2: ramp again rather than getting cute",
        "Turn 3+: keep making extra land drops so Aesi immediately snowballs when it resolves"
      ],
      tableReputation: "Often reads fair until the mana and card advantage suddenly jump a full turn cycle ahead.",
      communityHeadline: "How people build Aesi now",
      communitySubhead: "Compare ramp density, landfall payoffs, and finish packages in public decks."
    }
  },
  "Teferi, Temporal Archmage": {
    plan: "Mono-blue control-combo shell that abuses untap effects on mana rocks, planeswalkers, and lock pieces.",
    preferTags: ["planeswalkers", "control", "untap", "artifacts", "stax"],
    notes: "Teferi decks need to survive long enough for the untap ability to matter, so cheap interaction and rock density are critical. The best versions know exactly which permanents Teferi is supposed to untap and why.",
    avoid: ["slow draw-go piles with no mana-rock support", "cute planeswalkers that do not protect the plan", "high-curve spells that leave Teferi exposed"],
  },
  "Derevi, Empyrial Tactician": {
    plan: "Tap-untap tempo deck that leverages combat triggers, stax pressure, and tricky sequencing to stay ahead.",
    preferTags: ["tap untap", "tempo", "stax", "combat", "evasion"],
    notes: "Derevi gets paid when small creatures and mana development keep mattering into the midgame. Your best cards either multiply combat triggers, punish opponents for being slowed down, or let you use untap triggers as mana and interaction.",
    avoid: ["midrange bodies with no tap value", "stax pieces your deck cannot break parity on", "slow hands with no early board presence"],
  },
  "Gishath, Sun's Avatar": {
    plan: "Naya dinosaur deck that ramps aggressively, attacks fast, and converts one clean hit into a huge board.",
    preferTags: ["dinosaurs", "ramp", "combat", "tribal", "haste"],
    notes: "Gishath is much better when the first attack step is protected and meaningful. Favor dino density, ramp that curves into eight mana, and top-end creatures you are happy to flip into play rather than cast fairly.",
    avoid: ["cute enrage packages with no pressure", "too many non-dinosaur spells", "hands that ramp poorly into an eight-mana commander"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Few commanders feel better than turning one combat step into an entire dinosaur board state.",
      bestFor: "Players who want tribal ramp, giant combat turns, and a deck that wins by making its commander hit once.",
      winPaths: [
        "Ramp into Gishath and flood the board off one clean swing",
        "Use haste or combat support to make the first hit immediate",
        "Win on board presence before slower decks recover"
      ],
      traps: [
        "Too many cute dinosaurs and not enough ramp",
        "Low dinosaur density that makes Gishath flips disappointing",
        "No protection for the first crucial attack step"
      ],
      upgradePriority: [
        "1. Ramp and fixing that actually get you to eight mana",
        "2. Dino density plus a few premium top-end hits",
        "3. Haste, protection, and combat support",
        "4. Utility cards only after the core attack plan is tight"
      ],
      openingPlan: [
        "Turn 1: mana source if available",
        "Turn 2: keep ramping rather than holding cute setup",
        "Turn 3+: sequence toward a fast Gishath with protection or haste support"
      ],
      tableReputation: "Usually seen as explosive but honest; people respect the first attack step a lot.",
      communityHeadline: "How people build Gishath now",
      communitySubhead: "See how public lists balance ramp, dinosaur count, and combat support."
    }
  },
  "Maelstrom Wanderer": {
    plan: "Temur big-mana cascade deck that uses Wanderer as both finisher and engine for haymaker turns.",
    preferTags: ["cascade", "big mana", "haste", "ramp", "value"],
    notes: "The deck gets stronger when you trim low-impact cards that make cascade hits embarrassing. Maelstrom Wanderer wants ramp, high-value hits, and enough interaction to survive until its eight-mana turn matters.",
    avoid: ["tiny hits that waste cascade", "too few ramp slots", "cute reactive cards that are bad cascade flips"],
  },
  "Sliver Overlord": {
    plan: "Five-color sliver toolbox that tutors for the exact tribal piece you need and can pivot between combat and combo pressure.",
    preferTags: ["slivers", "tribal", "toolbox", "combo", "five-color"],
    notes: "Overlord is strongest when the sliver suite is intentional rather than just 'all the slivers.' Your mana, protection, and tutor targets should all support finding the right sliver for the table state.",
    avoid: ["five-color greed with weak fixing", "tribal filler with no tutor purpose", "hands that cannot develop before tutoring matters"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Tutoring from the command zone makes tribal choices matter in a way most sliver decks do not get.",
      bestFor: "Players who love creature toolboxes, five-color sequencing, and tribal decks with real decision density.",
      winPaths: [
        "Tutor a combat suite that snowballs through the board",
        "Assemble a sliver package that protects and closes quickly",
        "Outvalue the table by finding exactly the right tribal effect"
      ],
      traps: [
        "Playing every sliver instead of the correct slivers",
        "Weak five-color mana that delays Overlord too long",
        "No protection for the commander in removal-heavy pods"
      ],
      upgradePriority: [
        "1. Five-color fixing and early acceleration",
        "2. High-impact utility slivers and protection",
        "3. Tutor targets that actually close games",
        "4. Luxury tribal cards only after the shell is stable"
      ],
      openingPlan: [
        "Turn 1: fixing or acceleration",
        "Turn 2: keep setting mana and board presence",
        "Turn 3+: land Overlord only when the tutor line will matter"
      ],
      tableReputation: "Usually reads threatening because the command zone tutor makes every untap step scary.",
      communityHeadline: "How people build Sliver Overlord now",
      communitySubhead: "Compare toolbox sliver suites, protection density, and five-color mana bases."
    }
  },
  "The First Sliver": {
    plan: "Cascade tribal deck that turns sliver density into explosive chain turns and overwhelming board snowball.",
    preferTags: ["slivers", "cascade", "tribal", "tempo", "five-color"],
    notes: "The First Sliver rewards discipline on curve more than just raw sliver count. Your cheap slivers and mana need to make every cascade step live, because the deck wins by chaining velocity before the table resets.",
    avoid: ["too many expensive slivers", "weak early fixing", "non-sliver cards that dilute cascade quality"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "A tribal deck where every extra sliver can become another spell is an absurdly fun snowball pattern.",
      bestFor: "Players who want tribal identity, chain-casting turns, and a five-color deck that rewards curve discipline.",
      winPaths: [
        "Cascade through a cheap sliver curve until the board is overwhelming",
        "Leverage haste or anthem effects to turn one big turn into lethal combat",
        "Pressure the table with compounding tribal value before wraths line up"
      ],
      traps: [
        "Stuffing the deck with expensive slivers that clog cascades",
        "Non-sliver support cards that lower chain quality",
        "Mana bases that are technically playable but too slow"
      ],
      upgradePriority: [
        "1. Fast five-color fixing and sliver-friendly ramp",
        "2. Cheap sliver density and high-quality cascade hits",
        "3. Protection, haste, and anthem support",
        "4. Expensive flex slots only after the chain is smooth"
      ],
      openingPlan: [
        "Turn 1: fixing matters more than flashiness",
        "Turn 2: develop mana or the first meaningful sliver",
        "Turn 3+: set up The First Sliver so the first cascade turn actually snowballs"
      ],
      tableReputation: "Often perceived as less precise than Overlord, but just as scary once cascade starts chaining.",
      communityHeadline: "How people build The First Sliver now",
      communitySubhead: "See sliver curves, cascade density, and payoff choices from community lists."
    }
  },
  "Narset, Enlightened Master": {
    plan: "Attack-trigger spells deck that uses Narset to cheat expensive noncreature payoffs into extra combats or extra turns.",
    preferTags: ["spells", "extra combats", "extra turns", "attack triggers", "tempo"],
    notes: "Narset rewards brutal clarity: protect the commander, connect once, and make that attack step count. The deck improves when your top-end is full of true game-swingers instead of flashy cards that are only medium off the trigger.",
    avoid: ["creature-heavy shells", "filler spells that do not matter off Narset", "hands that cast Narset with no protection plan"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Few commanders make one combat step feel as explosive and unfair as Narset does.",
      bestFor: "Players who enjoy high-impact attack turns, protecting a key commander, and winning off one clean opening.",
      winPaths: [
        "Trigger Narset into extra combats or turns that the table cannot recover from",
        "Protect the commander long enough to chain free spell value",
        "Use one decisive attack to create lethal pressure immediately"
      ],
      traps: [
        "Too many medium spells that are weak Narset hits",
        "No protection or setup before committing six mana",
        "Trying to play fair midrange when Narset wants explosive turns"
      ],
      upgradePriority: [
        "1. Protection and setup that guarantee the first attack",
        "2. High-impact spell hits instead of filler",
        "3. Mana that casts Narset on time",
        "4. Extra-turn or extra-combat luxuries after consistency is there"
      ],
      openingPlan: [
        "Turn 1: mana or setup piece",
        "Turn 2: keep smoothing mana and hold efficient interaction",
        "Turn 3+: sequence toward a protected Narset attack, not just a fast Narset cast"
      ],
      tableReputation: "Almost always treated as a kill-on-sight commander once players know the list.",
      communityHeadline: "How people build Narset now",
      communitySubhead: "Compare trigger packages, protection density, and finishing lines in public decks."
    }
  },
  "Xenagos, God of Revels": {
    plan: "Gruul combat deck that turns each big creature into an immediate, hasty, doubled-power threat.",
    preferTags: ["aggro", "big creatures", "haste", "combat", "power matters"],
    notes: "Xenagos does not need many tricks, but it desperately needs threat quality and turn pacing. The best builds ramp early, stick one creature that matters, and make every combat step threaten lethal chunks of damage.",
    avoid: ["small-value creatures", "too many noncreature payoff cards", "hands that ramp poorly into no real threat"],
    guideTier: "flagship",
    featuredGuide: true,
    flagship: {
      loveReason: "Xenagos turns straightforward creature combat into a terrifying clock with almost no wasted text.",
      bestFor: "Players who like clean Gruul sequencing, giant creatures, and winning through combat without apology.",
      winPaths: [
        "Curve into one hasty oversized threat after another",
        "Exploit double power to remove players in two swings or less",
        "Use combat support to force through lethal before control decks stabilize"
      ],
      traps: [
        "Creatures that are big but not impactful enough on attack",
        "Too little ramp for a commander that wants fast threats",
        "Cute support cards that do not increase damage output"
      ],
      upgradePriority: [
        "1. Ramp and mana consistency",
        "2. High-impact creatures at the correct points on curve",
        "3. Protection and combat support",
        "4. Fancy finishers only after the threat core is tight"
      ],
      openingPlan: [
        "Turn 1: mana source if possible",
        "Turn 2: keep ramping rather than drifting",
        "Turn 3+: line up Xenagos so a real threat follows immediately"
      ],
      tableReputation: "Usually seen as honest but dangerous; every untap step can represent a huge hit.",
      communityHeadline: "How people build Xenagos now",
      communitySubhead: "See creature curves, haste pressure, and combat support packages in real lists."
    }
  },
  "Omnath, Locus of Rage": {
    plan: "Gruul landfall deck that turns every extra land into board presence and every death into damage.",
    preferTags: ["lands", "landfall", "elementals", "tokens", "damage"],
    notes: "Omnath of Rage wants land volume, not just generic Gruul monsters. The best lists make land drops relentlessly, create elemental pressure, and use sacrifice or wrath-proof lines to convert the board into damage if needed.",
    avoid: ["big-creature Gruul filler", "too few ramp spells or fetch-style effects", "landfall cards that do not pressure the board"],
  },
  "Aragorn, the Unifier": {
    plan: "Five-color legends and multicolor-value deck that turns each gold spell into layered combat or board advantages.",
    preferTags: ["legends", "multicolor", "humans", "combat", "value"],
    notes: "Aragorn improves when the deck is dense with truly castable multicolor spells rather than just expensive five-color cards. The best shells keep the curve practical and use Aragorn's trigger spread to snowball tempo and board pressure.",
    avoid: ["greedy five-color piles", "legend cards with weak cast triggers", "mana bases that cannot reliably cast multicolor spells on time"],
  },
  "Rocco, Cabaretti Caterer": {
    plan: "Naya creature-toolbox commander that tutors the right creature for the right stage of the game and can pivot into combo lines.",
    preferTags: ["toolbox", "tutor", "creatures", "combo", "tokens"],
    notes: "Rocco is strongest when your creature suite has clear jobs: ramp, protection, removal, card flow, and finishers. Treat the command zone tutor as your glue, not just a way to find the splashiest target.",
    avoid: ["toolbox targets with no clear purpose", "hands that cannot make enough mana for a meaningful Rocco", "midrange creatures that are fine everywhere and great nowhere"],
  },
};

export type CommanderGuideOverride = {
  intro: string;
  howWins: string;
  mistakes: string;
  mulligan: {
    keep: string;
    ship: string;
    pattern: string;
  };
  bestCards: {
    engines: string;
    interaction: string;
    finishers: string;
  };
  budget: {
    first: string;
    cheap: string;
    premium: string;
  };
};

export const COMMANDER_GUIDE_OVERRIDES: Record<string, CommanderGuideOverride> = {
  "the-ur-dragon": {
    intro:
      "[[The Ur-Dragon]] is strongest when the deck behaves like five-color ramp first and dragon tribal second. The good lists spend their first three turns on mana and cost reduction with cards like [[Dragon's Hoard]], [[Orb of Dragonkind]], and [[Urza's Incubator]], then start chaining dragons that immediately snowball cards, treasure, or damage instead of playing nine-mana haymakers that do nothing until the next turn.",
    howWins:
      "Most tuned [[The Ur-Dragon]] decks win by making the first dragon stick and turning every later dragon into a second payoff. [[Lathliss, Dragon Queen]], [[Scourge of Valkas]], [[Terror of the Peaks]], [[Old Gnawbone]], and [[Miirym, Sentinel Wyrm]] convert one combat step into lethal pressure very quickly, while the commander's attack trigger refills your hand so the deck does not run out of gas after the first wipe.",
    mistakes:
      "The common trap is building a binder deck instead of a curve. Hands full of seven-drops, too many tapped five-color lands, and dragons that are only 'big' rather than game-changing make [[The Ur-Dragon]] look clumsy. Cut filler dragons before you cut two-mana ramp, and do not skip enablers like [[Sarkhan's Triumph]] or haste sources just because they are less flashy.",
    mulligan: {
      keep:
        "Keep hands that already function as ramp hands, not dragon hands. Three lands plus one of [[Nature's Lore]], [[Three Visits]], [[Farseek]], [[Dragon's Hoard]], or [[Orb of Dragonkind]] is usually better than a seven with two giant dragons and no acceleration. Cost reducers like [[Dragonlord's Servant]] and [[Urza's Incubator]] also count because they effectively buy a full turn.",
      ship:
        "Ship clunky openers that only become good if you naturally hit every land drop until turn six. A hand with perfect colors but no ramp is still risky here, and a hand with multiple expensive dragons but no early setup is usually a trap unless it also has [[Sol Ring]] or another truly explosive start.",
      pattern:
        "Your first three turns should usually look like land, ramp, ramp or reduction. If your opener cannot realistically cast a relevant dragon by turn four or five, it is below rate for [[The Ur-Dragon]]. When you do keep a slower hand, it should include a payoff dragon that immediately stabilizes the table such as [[Terror of the Peaks]] or [[Old Gnawbone]].",
    },
    bestCards: {
      engines:
        "The cards that hold the shell together are the ones that cheat on dragon mana without being dead later. [[Dragon's Hoard]], [[Urza's Incubator]], [[Orb of Dragonkind]], [[Dragonlord's Servant]], [[Sarkhan's Triumph]], and [[The World Tree]] all make your expensive half actually castable. After that, prioritize dragons that generate value on entry or attack, especially [[Lathliss, Dragon Queen]], [[Miirym, Sentinel Wyrm]], [[Terror of the Peaks]], and [[Old Gnawbone]].",
      interaction:
        "The best interaction in [[The Ur-Dragon]] is cheap enough that you can protect your setup without losing a full turn. [[Swords to Plowshares]], [[Anguished Unmaking]], [[Cyclonic Rift]], [[Swan Song]], and [[Crux of Fate]] are the kinds of cards that keep you alive while still letting you commit dragons on curve. Expensive 'dragon-flavored' removal is usually worse than efficient answers.",
      finishers:
        "Your cleanest closes come from damage multiplication, not from fair combat math. [[Scourge of Valkas]] and [[Terror of the Peaks]] punish every dragon that enters, [[Lathliss, Dragon Queen]] widens the board, and [[Aggravated Assault]] or a huge [[Old Gnawbone]] turn can end the game immediately. If a top-end dragon does not threaten that kind of swing, it has to be truly exceptional to deserve a slot.",
    },
    budget: {
      first:
        "Spend early budget on the mana and reduction pieces that appear every game. Upgrading from slow taplands into cleaner fixing and adding reliable ramp like [[Nature's Lore]], [[Farseek]], [[Dragon's Hoard]], and [[Orb of Dragonkind]] matters more than buying one premium dragon while the deck still stumbles.",
      cheap:
        "The best cheaper upgrades are role players that do real work: [[Sarkhan's Triumph]] as a tutor, [[Lathliss, Dragon Queen]] as a board-builder, [[Scourge of Valkas]] as reach, [[Dragonlord's Servant]] as acceleration, and [[Patriarch's Bidding]] as recovery after wipes. These improve the deck's real game flow, not just the ceiling.",
      premium:
        "The expensive upgrades worth saving for are the ones that change how explosive the deck feels: cleaner five-color lands, [[Urza's Incubator]], [[The Great Henge]], [[Old Gnawbone]], and [[Terror of the Peaks]]. Premium dragons that still need another full turn cycle are lower priority than mana and immediate payoffs.",
    },
  },
  "edgar-markov": {
    intro:
      "[[Edgar Markov]] is not a slow vampire midrange commander. The best versions are brutal low-curve snowball decks that abuse eminence with one-drops, token payoffs, and card draw that turns every free body into real cardboard. If your list is full of six-mana vampires and fancy lifegain cards, it will feel far weaker than Edgar's reputation suggests.",
    howWins:
      "[[Edgar Markov]] wins by making the board wider than everyone else's, then turning that width into real damage with anthem and combat payoffs. [[Cordial Vampire]], [[Stromkirk Captain]], [[Shared Animosity]], [[Skullclamp]], and [[Champion of Dusk]] are the cards that let your free tokens stay relevant instead of becoming filler after the first wrath.",
    mistakes:
      "The biggest mistake is confusing 'vampire tribal' with 'play every cool vampire.' Edgar wants a lot of one- and two-mana vampires, not a pile of expensive legends. The other common trap is leaning too hard on lifegain subthemes when your best games are about early pressure, token scaling, and drawing back up after you dump your hand.",
    mulligan: {
      keep:
        "Keep aggressive hands with two or three lands, at least one cheap vampire, and a way to keep the cards flowing. [[Voldaren Epicure]], [[Skymarcher Aspirant]], [[Knight of the Ebon Legion]], [[Esper Sentinel]], [[Skullclamp]], and [[Welcoming Vampire]] are exactly the kinds of cards that make Edgar openers feel unfair.",
      ship:
        "Ship hands that start on turn three, hands that only contain expensive tribal payoffs, and hands that are all removal with no clock. Edgar is at his best when he makes the table answer you first; if your opener is waiting around to 'play good cards later,' it is probably not good enough.",
      pattern:
        "Your ideal start is cheap vampire into cheap vampire into Edgar or a payoff that punishes blocks. Even without casting the commander early, you want your first turns to manufacture bodies that later turn on [[Skullclamp]], [[Cordial Vampire]], [[Shared Animosity]], or [[Patriarch's Bidding]].",
    },
    bestCards: {
      engines:
        "The best Edgar cards are the ones that reward free bodies immediately. [[Skullclamp]] is obscene here, [[Champion of Dusk]] refills without asking you to slow down, [[Welcoming Vampire]] and [[Tocasia's Welcome]] keep the cards coming, and [[Cordial Vampire]] turns random tokens into a serious clock. These are the real backbone of the deck, not flashy top-end vampires.",
      interaction:
        "Edgar still needs cheap interaction because your fastest draws lose hard to one hate piece or one combo deck if you ignore the table. [[Swords to Plowshares]], [[Anguished Unmaking]], [[Wear // Tear]], [[Path to Exile]], and [[Boros Charm]] do the job without forcing you to spend a whole turn off-plan. Expensive wraths are much less appealing than flexible one-for-ones plus recovery.",
      finishers:
        "The closes that matter are the ones that punish opponents for letting your tokens exist. [[Shared Animosity]] is one of the cleanest ways to kill out of nowhere, [[Stromkirk Captain]] and [[Legion Lieutenant]] make combat math miserable, and [[Patriarch's Bidding]] turns one sweeper into a lethal rebuild. If your list is trying to win with fair five-mana flyers, it is leaving damage on the table.",
    },
    budget: {
      first:
        "Spend budget on early vampires and cheap card draw before buying luxury lands. Edgar becomes scary when his first three turns are smooth, so adding cards like [[Skullclamp]], [[Welcoming Vampire]], and efficient one-drops usually does more than upgrading one splashy finisher.",
      cheap:
        "Good affordable upgrades include [[Voldaren Epicure]], [[Indulgent Aristocrat]], [[Legion Lieutenant]], [[Cordial Vampire]], and [[Patriarch's Bidding]] if your build can support it. These either improve the curve or make your token starts scale much harder.",
      premium:
        "The premium cards worth saving for are the ones that change the deck's resilience or burst damage, especially cleaner lands, [[Shared Animosity]], [[Esper Sentinel]], and [[Cavern of Souls]] if your local pods are heavy on blue. High-cost vampires should come after the shell is already lean.",
    },
  },
  "atraxa-praetors-voice": {
    intro:
      "[[Atraxa, Praetors' Voice]] gets generic when the deck tries to be counters, superfriends, and infect all at once. Current popular lists lean hardest into poison-proliferate control because that lane makes Atraxa's end-step trigger matter every turn and gives the deck a real closing speed instead of just accumulating counters forever.",
    howWins:
      "The efficient [[Atraxa, Praetors' Voice]] wins come from giving opponents their first poison counter and then turning every later spell into multiplication. [[Venerated Rotpriest]], [[Bloated Contaminator]], [[Prologue to Phyresis]], [[Inexorable Tide]], [[Tekuthal, Inquiry Dominus]], and [[Vorinclex, Monstrous Raider]] are the cards that turn a fair board into a lethal clock quickly.",
    mistakes:
      "The usual mistake is mixing three separate Atraxa decks and ending up with no real endgame. If your list has planeswalker payoffs, infect creatures, and random +1/+1 counter cards all fighting for space, the deck will feel slower than it should. Pick a primary lane and let the support cards serve that lane.",
    mulligan: {
      keep:
        "Keep hands that have clean mana, early ramp, and at least one card that starts the poison or proliferate plan. [[Farseek]], [[Nature's Lore]], [[Prologue to Phyresis]], [[Venerated Rotpriest]], [[Bloated Contaminator]], and [[Experimental Augury]] are the kinds of cards that make an Atraxa hand cohesive instead of speculative.",
      ship:
        "Ship 'goodstuff' sevens that only promise value later. Atraxa costs four colors and wants a board or poison counter already in motion, so hands that are all taplands, late payoffs, or off-plan counters cards without a way to start pressure are much worse than they look.",
      pattern:
        "Your best first three turns usually set up mana on turns one and two, then land the first poisonous threat or card that establishes inevitability. If you resolve [[Atraxa, Praetors' Voice]] into a board that already has one poison counter on each opponent, you are usually in excellent shape.",
    },
    bestCards: {
      engines:
        "In the current proliferate-control builds, the engine cards are the ones that either place the first poison counter or multiply them efficiently. [[Prologue to Phyresis]], [[Venerated Rotpriest]], [[Bloated Contaminator]], [[Inexorable Tide]], [[Tekuthal, Inquiry Dominus]], and [[Deepglow Skate]] all do real work immediately. They are stronger here than random generically good counter cards that never end the game.",
      interaction:
        "Atraxa plays best when the interaction is cheap enough to protect your poison tempo. [[Swords to Plowshares]], [[Path to Exile]], [[Counterspell]], [[Swan Song]], and [[Cyclonic Rift]] keep you alive while proliferate does the heavy lifting. Removal that also advances counters, such as [[Drown in Ichor]], earns extra points because it keeps the deck from getting too reactive.",
      finishers:
        "The finishers are usually compact, not flashy. [[Vorinclex, Monstrous Raider]] cuts the clock in half, [[Triumph of the Hordes]] ends stalled boards, and [[Tekuthal, Inquiry Dominus]] turns every proliferate effect into a kill shot. If your deck only 'wins eventually,' it probably needs more cards in this class and fewer cute counter-matter cards.",
    },
    budget: {
      first:
        "The first budget dollars should go into mana and the actual poison package, because that is what makes Atraxa feel focused. A stable four-color base plus cards like [[Prologue to Phyresis]], [[Experimental Augury]], and [[Bloated Contaminator]] usually outperforms buying one expensive superfriends staple.",
      cheap:
        "Affordable upgrades that matter include [[Experimental Augury]], [[Drown in Ichor]], [[Contentious Plan]], [[Thrummingbird]], and [[Viral Drake]]. These are not glamorous, but they reliably keep poison counts moving and make Atraxa's end step far scarier.",
      premium:
        "The premium cards worth saving for are [[Vorinclex, Monstrous Raider]], cleaner four-color lands, and the best protection or interaction pieces in your budget range. Expensive planeswalkers are lower priority unless you are intentionally building the separate superfriends version.",
    },
  },
  "krenko-mob-boss": {
    intro:
      "[[Krenko, Mob Boss]] is one of the cleanest 'if it untaps, you die' commanders in EDH. The real deckbuilding puzzle is not whether you can make goblins; it is whether your list can give Krenko haste, protect one activation, and turn that activation into mana or damage before the table untaps.",
    howWins:
      "The deck wins by converting one Krenko tap into exponential resources. [[Skirk Prospector]], [[Battle Hymn]], [[Thornbite Staff]], [[Staff of Domination]], [[Goblin Bombardment]], [[Impact Tremors]], and [[Purphoros, God of the Forge]] let your token count become mana, cards, or lethal damage instead of just more 1/1s.",
    mistakes:
      "The biggest trap is overloading on cute goblins and underloading on haste, untaps, and payoff damage. A second common mistake is keeping reactive hands because mono-red has some removal. Your best Krenko games are proactive combo-aggro games, not fair tribal games.",
    mulligan: {
      keep:
        "Keep hands that can cast Krenko quickly and let him activate right away or safely. [[Skirk Prospector]], [[Goblin Instigator]], [[Battle Hymn]], [[Goblin Warchief]], [[Lightning Greaves]], and fast mana all make excellent keeps because they bridge directly into the first meaningful tap.",
      ship:
        "Ship hands that are all expensive goblins, all payoff enchantments, or all lands with no acceleration. If the hand cannot present Krenko with support by turn three or four, it is usually slower than the average table will let you be.",
      pattern:
        "You want your first turns to build either haste or a token floor. A great pattern is small goblin into mana or haste enabler into [[Krenko, Mob Boss]]. Once he is active, every card in hand should either protect him, untap him, or turn tokens into immediate damage.",
    },
    bestCards: {
      engines:
        "The cards that actually make Krenko busted are [[Skirk Prospector]], [[Goblin Warchief]], [[Battle Hymn]], [[Thornbite Staff]], [[Staff of Domination]], and [[Skullclamp]]. They either multiply activations or ensure that the goblin flood translates into mana and cards instead of overextending into a wrath.",
      interaction:
        "Mono-red interaction needs to be cheap because your mana is busy exploding. [[Abrade]], [[Chaos Warp]], [[Pyroblast]], [[Deflecting Swat]], and [[Red Elemental Blast]] are the sort of cards that protect a winning turn without slowing you down. Expensive removal spells are usually worse than one more proactive enabler.",
      finishers:
        "Your cleanest closes are the damage converters: [[Goblin Bombardment]], [[Impact Tremors]], [[Purphoros, God of the Forge]], and [[Mob Justice]]. Combat still matters, but the stronger lists make it possible to kill through fogs or after sacrificing half the board for mana.",
    },
    budget: {
      first:
        "First upgrades should buy speed and redundancy, not bulk goblin count. Haste, token-to-mana pieces, and cheap card draw are what keep Krenko from being a one-card trap commander.",
      cheap:
        "High-value cheaper upgrades include [[Battle Hymn]], [[Goblin Instigator]], [[Skullclamp]], [[Goblin Bombardment]], and [[Impact Tremors]]. These all matter immediately and make mediocre goblin bodies play above their rate.",
      premium:
        "The expensive cards worth stretching for are [[Thornbite Staff]], [[Deflecting Swat]], and the better fast mana pieces. Premium six-mana goblins are much lower priority than cards that help Krenko activate one extra time.",
    },
  },
  "yuriko-the-tiger-s-shadow": {
    intro:
      "[[Yuriko, the Tiger's Shadow]] is not a normal Dimir ninjas deck. It is a tempo deck built to cheat mana value from the top of your library while spending very little real mana on the battlefield. The best lists keep their creature curve tiny, maximize evasive one-drops, and use top-deck manipulation so each Yuriko trigger hits like a spell that cost six or more.",
    howWins:
      "[[Yuriko, the Tiger's Shadow]] wins by repeatedly connecting with cheap evasive creatures, turning ninjutsu into cards, and flipping oversized mana values that no one expects you to actually cast. [[Sensei's Divining Top]], [[Scroll Rack]], [[Brainstorm]], [[Draco]], [[Temporal Trespass]], and [[Shadow of Mortality]] are the classic ways to make the trigger matter without clogging your hand.",
    mistakes:
      "The common traps are running too many expensive ninjas, not enough one-drop enablers, and trying to play a fair midrange game. Yuriko is excellent precisely because you are spending one or two mana for cards that function like six- and eight-mana swings. Do not dilute that edge.",
    mulligan: {
      keep:
        "Keep any hand with cheap evasion, stable mana, and either a payoff ninja or top-deck sculpting. [[Changeling Outcast]], [[Faerie Seer]], [[Ornithopter]], [[Moon-Circuit Hacker]], [[Sensei's Divining Top]], and [[Brainstorm]] are exactly the cards that make opening hands smooth.",
      ship:
        "Ship hands full of expensive flip cards with no enabler, hands with only tapped mana, and hands where Yuriko cannot realistically trigger on turn two. A good Yuriko seven starts dealing damage and drawing cards almost immediately.",
      pattern:
        "Your early turns should be evasive one-drop into ninjutsu or top-deck setup. If you can choose between adding another fair body and guaranteeing a big Yuriko trigger with [[Sensei's Divining Top]] or [[Scroll Rack]], the trigger usually matters more.",
    },
    bestCards: {
      engines:
        "The glue cards are cheap enablers and top-of-library manipulation. [[Changeling Outcast]], [[Faerie Seer]], [[Moon-Circuit Hacker]], [[Ingenious Infiltrator]], [[Sensei's Divining Top]], and [[Scroll Rack]] all keep the deck doing what it is meant to do: connect, redraw, and line up painful flips.",
      interaction:
        "Because Yuriko is a tempo deck, the interaction should be efficient and preferably free or nearly free. [[Snuff Out]], [[Deadly Rollick]], [[Force of Negation]], [[Swan Song]], and [[Drown in the Loch]] help you keep pressure up without taking whole turns off. Clunky sweeper-heavy control packages usually make the deck worse.",
      finishers:
        "The finishing package is mostly top-end cards you are happy to reveal rather than cast. [[Draco]], [[Shadow of Mortality]], [[Temporal Trespass]], and [[Commandeer]] are popular for a reason. They let innocuous attack steps chunk the entire table while your real mana stays available for interaction.",
    },
    budget: {
      first:
        "Budget money should go into the consistency package first: one-drop evasive creatures, cheap cantrips, and top-deck tools. Those upgrades make every Yuriko game smoother and are more important than chasing one luxury counterspell.",
      cheap:
        "Affordable cards that pull real weight include [[Faerie Seer]], [[Moon-Circuit Hacker]], [[Brainstorm]], [[Consider]], and [[Soothsaying]]. These make the deck feel much closer to the tuned version without asking for premium staples immediately.",
      premium:
        "The premium upgrades that change the deck most are [[Sensei's Divining Top]], [[Scroll Rack]], free interaction, and the stronger mana base pieces. Buy those before buying extra flashy ninjas that do not improve turn-two Yuriko starts.",
    },
  },
  "isshin-two-heavens-as-one": {
    intro:
      "[[Isshin, Two Heavens as One]] is best when you treat him like an attack-trigger doubler, not generic Mardu aggro. The strongest lists are full of creatures and permanents that immediately pay you for turning sideways, so that casting Isshin is effectively doubling tokens, treasure, cards, or combats the same turn cycle you start attacking.",
    howWins:
      "[[Isshin, Two Heavens as One]] closes by turning medium combat steps into absurd ones. [[Anim Pakal, Thousandth Moon]], [[Adeline, Resplendent Cathar]], [[Professional Face-Breaker]], [[Krenko, Tin Street Kingpin]], [[Karlach, Fury of Avernus]], and [[Aurelia, the Warleader]] all become dramatically stronger when their triggers happen twice.",
    mistakes:
      "The easiest way to weaken Isshin is stuffing the list with cards that are merely 'good in combat' instead of cards that actually trigger on attack. Pillow-fort cards, slow planeswalkers, and expensive haymakers that do not snowball the first attack step usually underperform compared to one more efficient trigger creature.",
    mulligan: {
      keep:
        "Keep hands that curve into attack triggers, not just creatures. Two or three lands plus a ramp piece and cards like [[Adeline, Resplendent Cathar]], [[Krenko, Tin Street Kingpin]], [[Anim Pakal, Thousandth Moon]], or [[Professional Face-Breaker]] are where you want to be.",
      ship:
        "Ship hands that are all removal, all equipment with no creature pressure, or top-heavy extra-combat spells with no board. Isshin punishes stumbles by asking you to commit to the board early and then multiply that board's value.",
      pattern:
        "A good opening sequence is develop mana, play a creature that rewards attacking, then land [[Isshin, Two Heavens as One]] when you can immediately attack next turn or protect him. If Isshin resolves into an empty board, he is much easier to answer fairly.",
    },
    bestCards: {
      engines:
        "The best cards are the ones that already reward combat before Isshin doubles them. [[Adeline, Resplendent Cathar]], [[Anim Pakal, Thousandth Moon]], [[Krenko, Tin Street Kingpin]], [[Professional Face-Breaker]], and [[Breena, the Demagogue]] all generate enough material that one extra trigger changes the texture of the game.",
      interaction:
        "Isshin wants low-cost interaction that clears blockers or protects a big combat turn. [[Swords to Plowshares]], [[Generous Gift]], [[Boros Charm]], [[Teferi's Protection]], and [[Wear // Tear]] fit that job well. Clunky wraths that reset your own trigger board should be rarer than in normal Mardu midrange.",
      finishers:
        "Your cleanest finishers are extra combats and damage scaling. [[Karlach, Fury of Avernus]], [[Aurelia, the Warleader]], [[Blade of Selves]], and a wide board under [[Shared Animosity]] or similar effects end games quickly once Isshin is online. If your deck cannot punish one successful attack step, it is probably too fair.",
    },
    budget: {
      first:
        "Budget upgrades should first improve the creature suite that actually triggers Isshin. The commander is powerful enough already; what matters is whether the board you built before turn four is worth doubling.",
      cheap:
        "Good lower-cost upgrades include [[Krenko, Tin Street Kingpin]], [[Anim Pakal, Thousandth Moon]], [[Mardu Strike Leader]], [[Professional Face-Breaker]] if available in budget, and cheaper protection like [[Boros Charm]]. These all do real work the turn you attack.",
      premium:
        "The premium buys worth saving for are cleaner mana, [[Teferi's Protection]], and the best extra-combat pieces. Expensive Mardu goodstuff cards are less important than cards that make the attack-trigger plan consistent every game.",
    },
  },
  "korvold-fae-cursed-king": {
    intro:
      "[[Korvold, Fae-Cursed King]] is a sacrifice engine disguised as a dragon. The commander is best when nearly every permanent in the deck either replaces itself when sacrificed or creates the treasure, food, blood, or body that lets Korvold keep drawing. If your list has too many nonpermanent spells, Korvold stops feeling broken very quickly.",
    howWins:
      "The deck wins by turning sacrifice into both velocity and a finisher. [[Dockside Extortionist]], [[Pitiless Plunderer]], [[Mayhem Devil]], [[Tireless Provisioner]], [[Mirkwood Bats]], and compact loop pieces from Commander Spellbook-style builds let Korvold draw through the deck while every treasure or dead creature also pressures life totals.",
    mistakes:
      "The trap is playing Jund value cards that do not feed the commander. Korvold is at his nastiest when fetchlands, treasures, tokens, and disposable permanents all count as cards. The second trap is overvaluing big dragons and under-valuing free sacrifice outlets.",
    mulligan: {
      keep:
        "Keep hands with mana acceleration and at least one card that naturally provides fodder. [[Dockside Extortionist]], [[Tireless Provisioner]], [[Fable of the Mirror-Breaker]], [[Goblin Bombardment]], [[Deadly Dispute]], and cheap treasure makers are all strong because they bridge directly into Korvold.",
      ship:
        "Ship hands that ramp into Korvold but have nothing to sacrifice, or hands with only reactive spells and no engine permanent. Casting the commander on time matters, but casting him into an empty battlefield is much weaker than it looks.",
      pattern:
        "Your first turns should establish either treasure production or a sacrifice outlet. A turn-four [[Korvold, Fae-Cursed King]] backed by a fetchland, treasure, or food token is excellent because the commander replaces the first sacrifice immediately and often snowballs from there.",
    },
    bestCards: {
      engines:
        "The best Korvold cards are permanents that make the first sacrifice free. [[Dockside Extortionist]], [[Pitiless Plunderer]], [[Tireless Provisioner]], [[Mayhem Devil]], [[Goblin Bombardment]], and [[Yawgmoth, Thran Physician]] all convert ordinary sacrifices into mana, cards, or damage. Those overlapping roles are why tuned Korvold lists feel so redundant.",
      interaction:
        "Jund gives Korvold excellent interactive glue. [[Abrupt Decay]], [[Assassin's Trophy]], [[Nature's Claim]], [[Deflecting Swat]], and [[Deadly Dispute]]-style instant-speed value all help you survive while still feeding the engine. The best answers are the ones you can cast without stepping off your permanent plan for a full turn.",
      finishers:
        "Korvold finishes either by attacking as a huge flyer or by making the sacrifice engine lethal. [[Mayhem Devil]], [[Mirkwood Bats]], [[Marionette Apprentice]], and tighter combo shells around [[Pitiless Plunderer]] or treasure loops all close games cleanly. If the deck only draws cards and never converts them into a kill, it needs more payoff density.",
    },
    budget: {
      first:
        "The first upgrade dollars should go into fodder and sacrifice infrastructure, because that is what Korvold actually consumes. Clean lands are great, but the deck improves faster when every draw step can produce something to sacrifice.",
      cheap:
        "Excellent budget-friendly upgrades include [[Tireless Provisioner]], [[Deadly Dispute]], [[Village Rites]], [[Goblin Bombardment]], [[Pitiless Plunderer]] when affordable, and token makers that leave behind treasure or food. These make the commander feel live immediately.",
      premium:
        "The premium upgrades worth saving for are the cards that massively compress setup, especially fetchlands, [[Dockside Extortionist]], and the strongest free interaction. Premium beaters are far lower priority than mana and sacrifice redundancy.",
    },
  },
  "meren-of-clan-nel-toth": {
    intro:
      "[[Meren of Clan Nel Toth]] is at her best when the creature suite is basically a toolbox of things you are happy to kill over and over. The deck does not want random Golgari fatties; it wants creatures that ramp, kill something, draw a card, or lock combat, then come back every turn once experience counters are online.",
    howWins:
      "Most Meren games are won by grinding opponents out of useful permanents and eventually converting that material edge into a combo or a soft lock. [[Sakura-Tribe Elder]], [[Spore Frog]], [[Plaguecrafter]], [[Caustic Caterpillar]], [[Birthing Pod]], and [[Protean Hulk]] are the classic cards because they keep doing their job from the graveyard.",
    mistakes:
      "The biggest mistake is playing too few creatures that sacrifice themselves naturally. The second is adding too many spells that look powerful but cannot be replayed with Meren. If a slot could be a permanent and is currently a sorcery, that is often the first thing to question.",
    mulligan: {
      keep:
        "Keep hands that have mana, a sacrifice-friendly creature, and a clear way to start accumulating experience. [[Sakura-Tribe Elder]], [[Stitcher's Supplier]], [[Viscera Seer]], [[Caustic Caterpillar]], and [[Skullclamp]] are exactly the kind of cards that make early Meren turns productive.",
      ship:
        "Ship hands full of expensive reanimation targets, spell-only hands, and sevens that cannot put a creature into the graveyard before Meren arrives. The commander is much better when she comes down after you already traded resources once or twice.",
      pattern:
        "Your first turns should usually be one of three things: ramp creature, self-mill creature, or sacrifice outlet. A turn-four [[Meren of Clan Nel Toth]] with even one or two experience counters already built is far stronger than rushing her out onto an empty board.",
    },
    bestCards: {
      engines:
        "The engine pieces are cheap creatures that do a job on the way in or out. [[Sakura-Tribe Elder]], [[Spore Frog]], [[Plaguecrafter]], [[Caustic Caterpillar]], [[Skullclamp]], and [[Birthing Pod]] are premium because they never feel dead once Meren is active. Every slot that behaves like that raises the deck's floor.",
      interaction:
        "Meren wants interaction attached to permanents whenever possible. [[Shriekmaw]], [[Plaguecrafter]], [[Haywire Mite]], [[Caustic Caterpillar]], and [[Outland Liberator]]-style cards keep you from spending whole turns on one-shot answers. You can still play the best instants, but permanent-based interaction is what makes Meren oppressive.",
      finishers:
        "The closes are usually recursive value engines that eventually turn the corner or a dedicated combo line. [[Protean Hulk]] packages, repeated edict effects, or aristocrats payoffs like [[Zulaport Cutthroat]] all do that better than random green beaters. When Meren wins fairly, it is because no one else gets to keep meaningful resources on the table.",
    },
    budget: {
      first:
        "Budget should go into the cheap recursive shell before it goes into marquee finishers. Meren becomes great once the floor of every draw step is respectable.",
      cheap:
        "Affordable cards that overperform include [[Sakura-Tribe Elder]], [[Caustic Caterpillar]], [[Viscera Seer]], [[Village Rites]], [[Victimize]], and [[Skullclamp]] when it fits budget. They make the graveyard engine start earlier and more often.",
      premium:
        "The premium cards worth saving for are the ones that compress the whole deck, such as stronger lands, [[Birthing Pod]], and the best combo finishers for your build. Expensive splashy creatures come well after the sacrifice engine is fully built.",
    },
  },
  "prosper-tome-bound": {
    intro:
      "[[Prosper, Tome-Bound]] is really a Rakdos engine deck where exile is just the fuel source. The good versions are dense with cheap impulse draw, treasure payoffs, and finishers that punish you for taking normal Prosper turns. If your list is just playing random red exile cards without a payoff shell, it will feel much flatter than it should.",
    howWins:
      "Prosper wins by turning exile value into mana and then turning that mana into a lethal damage or treasure engine. [[Jeska's Will]], [[Light Up the Stage]], [[Ignite the Future]], [[Nalfeshnee]], [[Passionate Archaeologist]], and [[Marionette Master]] are exactly the kinds of cards that make one Prosper turn spiral into a kill.",
    mistakes:
      "The common traps are too many expensive cards that only work when Prosper is already in play and too few cheap exile effects that keep treasure flowing. Another mistake is forgetting that the deck still needs real removal and card selection, not just cute cards that say 'play from exile.'",
    mulligan: {
      keep:
        "Keep hands with mana plus at least one card that either impulses from exile or profits from treasure. [[Light Up the Stage]], [[Jeska's Will]], [[Reckless Impulse]], [[Arcane Signet]], and [[Talisman of Indulgence]] are exactly what you want to see early.",
      ship:
        "Ship hands that only become functional after Prosper resolves and untaps. A seven with expensive payoffs and no early exile spell is usually worse than a leaner six that starts making treasure immediately.",
      pattern:
        "Your early turns should set up mana, then start the exile chain before or right after Prosper lands. If Prosper comes down and your next turn includes [[Jeska's Will]] or a two-mana impulse draw spell, you are usually far ahead.",
    },
    bestCards: {
      engines:
        "The real engine cards are the cheap exile spells and treasure multipliers, not just the commander. [[Jeska's Will]], [[Light Up the Stage]], [[Ignite the Future]], [[Reckless Impulse]], [[Nalfeshnee]], and [[Birgi, God of Storytelling]] all extend Prosper turns in a way generic Rakdos staples do not.",
      interaction:
        "Prosper still needs efficient answers so your engine survives long enough to matter. [[Chaos Warp]], [[Feed the Swarm]], [[Abrade]], [[Bedevil]], and [[Deadly Dispute]]-style flexible spells fit well because they keep the curve low and do not strand treasure mana.",
      finishers:
        "The deck closes best with cards that make every spell or treasure hurt. [[Marionette Master]], [[Passionate Archaeologist]], [[Reckless Fireweaver]], and big mana sinks like [[Torment of Hailfire]] convert ordinary Prosper value into actual endgames. Without cards like these, the deck can spin its wheels for too long.",
    },
    budget: {
      first:
        "Spend your first budget dollars on the cheap impulse-draw suite and reliable Rakdos ramp. Prosper improves a lot when the deck can fire small exile spells every turn instead of waiting for one huge turn.",
      cheap:
        "Affordable upgrades that matter include [[Reckless Impulse]], [[Light Up the Stage]], [[Big Score]], [[Unexpected Windfall]], and [[Passionate Archaeologist]]. These all improve the deck's baseline gameplay without needing luxury support.",
      premium:
        "The premium upgrades worth saving for are [[Jeska's Will]], better mana, and the strongest payoff permanents in your version. Expensive cards that only say 'cast from exile' are secondary to the cards that actually convert treasure into wins.",
    },
  },
  "omnath-locus-of-creation": {
    intro:
      "[[Omnath, Locus of Creation]] is one of the few landfall commanders where it is correct to obsess over fetchlands, extra land drops, and replaying lands from the graveyard. The commander pays you on the first, second, and third land each turn, so your list should be full of cards that let those triggers happen now, not eventually.",
    howWins:
      "Omnath lists usually win by chaining landfall turns that bury the table in mana and board presence. [[Exploration]], [[Dryad of the Ilysian Grove]], [[Lotus Cobra]], [[Ancient Greenwarden]], [[Scapeshift]], [[Splendid Reclamation]], and [[Field of the Dead]] are the classic cards because they make the second and third land drops realistic instead of magical Christmas land.",
    mistakes:
      "The biggest mistake is playing Omnath like generic four-color ramp. If your list cannot repeatedly trigger the second and third landfall lines, you are leaving a huge amount of the commander's text unused. The next mistake is playing too many payoffs and not enough effects that actually put extra lands onto the battlefield.",
    mulligan: {
      keep:
        "Keep hands with access to early ramp and at least one card that pushes multiple land drops. [[Farseek]], [[Nature's Lore]], [[Exploration]], [[Dryad of the Ilysian Grove]], [[Lotus Cobra]], and fetchlands are exactly what you want.",
      ship:
        "Ship speculative keepable sevens that have lands and big payoffs but no landfall acceleration. Omnath costs four colors and wants to start generating extra value immediately, so clunky hands fall behind faster than they do in normal ramp decks.",
      pattern:
        "Your first turns should set up either an extra land-drop effect or a fetchland turn that turbocharges Omnath on turn four. If Omnath enters and immediately sees two lands that turn, the deck feels completely different.",
    },
    bestCards: {
      engines:
        "The best Omnath cards are the ones that change one land drop into several. [[Exploration]], [[Dryad of the Ilysian Grove]], [[Lotus Cobra]], [[Ancient Greenwarden]], [[Scapeshift]], and [[Splendid Reclamation]] all do that while also raising the ceiling on every fetchland you draw.",
      interaction:
        "Because the deck is mana-rich, the best interaction is cheap and broad so you can keep progressing the board. [[Swords to Plowshares]], [[Boseiju, Who Endures]], [[Beast Within]], [[Cyclonic Rift]], and [[Force of Vigor]] all protect your landfall engine without demanding awkward setup.",
      finishers:
        "The cleanest closes come from landfall bursts, not just giant creatures. [[Scapeshift]] plus [[Omnath, Locus of Creation]] or [[Field of the Dead]], [[Moraug, Fury of Akoum]] with extra land drops, and a huge [[Felidar Retreat]] or [[Avenger of Zendikar]] turn all end games much faster than normal midrange combat.",
    },
    budget: {
      first:
        "The first money should improve your land engine, because Omnath's power ceiling is directly tied to how many meaningful land drops you can create. Upgrading into better ramp and utility lands beats buying one expensive payoff creature.",
      cheap:
        "High-value cheaper upgrades include [[Explore]], [[Escape to the Wilds]], [[Splendid Reclamation]], [[Dryad of the Ilysian Grove]] when affordable, and extra-land-drop effects that do not cost a fortune. These all make the commander's trigger text matter more often.",
      premium:
        "The expensive upgrades worth saving for are fetchlands, the cleaner mana base, and premier engine cards like [[Ancient Greenwarden]] and [[Scapeshift]]. Luxury four-color staples come after the land core is already working.",
    },
  },
  "breya-etherium-shaper": {
    intro:
      "[[Breya, Etherium Shaper]] is best when every artifact slot has overlap. The ideal Breya deck is not random Esper plus red artifact goodstuff; it is a shell where mana rocks, token makers, sacrifice outlets, and combo pieces all help Breya make removal, pressure, or infinite loops from the same battlefield.",
    howWins:
      "Breya wins either by grinding with thopters and artifact value or by assembling compact artifact loops. [[Goblin Engineer]], [[Krark-Clan Ironworks]], [[Ashnod's Altar]], [[Time Sieve]], [[Thopter Foundry]], [[Sword of the Meek]], and the Commander Spellbook-style blink or copy loops all turn the commander into a real finisher instead of just a fair value card.",
    mistakes:
      "The biggest trap is filling the deck with expensive artifacts that do not advance an engine. The second is building four-color mana that technically casts your spells but cannot sequence early rocks into a meaningful Breya turn. Breya rewards tight infrastructure more than flashy top-end.",
    mulligan: {
      keep:
        "Keep hands with at least two mana sources, an artifact accelerator, and one card that meaningfully interacts with the graveyard or sacrifice plan. [[Arcane Signet]], [[Talisman of Dominance]], [[Goblin Engineer]], [[Ichor Wellspring]], and [[Emry, Lurker of the Loch]] are exactly the sort of cards that make a seven real.",
      ship:
        "Ship hands that are all colored haymakers, all reactive spells, or artifact hands with no payoff or card flow. Breya is powerful, but she is much better when she enters a board that already has artifacts worth converting.",
      pattern:
        "Your first turns should establish artifact count and mana, not just colors. A turn-three or turn-four [[Breya, Etherium Shaper]] backed by fodder, a sacrifice outlet, or a recursion piece is much scarier than simply curving into the commander with no follow-up.",
    },
    bestCards: {
      engines:
        "The premium engine cards are the ones that make ordinary artifacts part of a loop. [[Goblin Engineer]], [[Krark-Clan Ironworks]], [[Ashnod's Altar]], [[Time Sieve]], [[Thopter Foundry]], and [[Sword of the Meek]] all create real pressure or combo texture with Breya's thopters.",
      interaction:
        "Breya wants interaction that overlaps with the artifact plan or is cheap enough to protect a combo turn. [[Dispatch]], [[Wear // Tear]], [[Cyclonic Rift]], [[An Offer You Can't Refuse]], and [[Swords to Plowshares]] do that better than clunky four-mana catch-alls.",
      finishers:
        "The closes are usually compact engines, not giant artifact monsters. [[Time Sieve]] turns token production into extra turns, [[Marionette Master]] punishes mass sacrifice, and altar plus token loops let Breya convert artifacts directly into damage. If a finisher cannot be found, fed, or protected by the rest of the shell, it is probably too cute.",
    },
    budget: {
      first:
        "Spend budget on cheap artifact velocity and clean mana first. Breya becomes much stronger once the rocks, baubles, and recursion pieces are dense enough that the commander always has something to work with.",
      cheap:
        "Good affordable upgrades include [[Ichor Wellspring]], [[Mycosynth Wellspring]], [[Goblin Engineer]], [[Emry, Lurker of the Loch]], and the talisman cycle. These are not glamorous, but they dramatically improve how often your Breya turns actually function.",
      premium:
        "The premium upgrades worth saving for are the compact combo pieces and stronger mana base cards, especially [[Krark-Clan Ironworks]] and the best untapped four-color sources. Expensive artifact bombs come later.",
    },
  },
  "chulane-teller-of-tales": {
    intro:
      "[[Chulane, Teller of Tales]] is at his scariest when the list is a creature-combo engine with an honest creature curve. The commander rewards you for making every one- and two-mana creature replace itself, make mana, or bounce something, then snowballing that advantage until one turn becomes three turns' worth of cards and lands.",
    howWins:
      "Chulane usually wins by building a self-feeding battlefield where every creature cast replaces itself and advances mana. [[Shrieking Drake]], [[Whitemane Lion]], [[Cloudstone Curio]], [[Intruder Alarm]], [[Beast Whisperer]], and [[Aluren]] are the kinds of cards that turn a normal Bant value board into a combo turn.",
    mistakes:
      "The common mistake is jamming expensive value creatures because Chulane 'draws cards anyway.' In reality, the deck is much better when the curve is low and the creatures let you keep casting multiple spells per turn. Too many noncreature slots also quietly weaken the commander.",
    mulligan: {
      keep:
        "Keep hands with early mana creatures and at least one cheap creature that keeps the engine going. [[Birds of Paradise]], [[Llanowar Elves]], [[Wall of Roots]], [[Shrieking Drake]], and [[Whitemane Lion]] are exactly the sort of cards that make Chulane hands explosive.",
      ship:
        "Ship hands full of five-drops, hands that rely entirely on Chulane resolving, and hands with ramp but no creatures to chain afterward. You want the deck to function before the commander, not only after him.",
      pattern:
        "The best opening pattern is mana creature into more cheap board development, then cast [[Chulane, Teller of Tales]] when you can immediately follow with another creature. That first follow-up cast is where the commander stops being fair.",
    },
    bestCards: {
      engines:
        "The true engine cards are the cheap bounce and chain pieces. [[Shrieking Drake]], [[Whitemane Lion]], [[Cloudstone Curio]], [[Beast Whisperer]], [[Intruder Alarm]], and [[Aluren]] all create turns where every creature cast is really several actions.",
      interaction:
        "Chulane wants interaction attached to creatures or cheap protective spells that do not interrupt the chain. [[Skyclave Apparition]], [[Aether Channeler]], [[Swords to Plowshares]], [[Eladamri's Call]], and [[Teferi's Protection]] all fit much better than expensive reactive packages.",
      finishers:
        "The usual finishes are either creature loops or one giant combat payoff. [[Craterhoof Behemoth]] is still excellent, but combo lines involving [[Aluren]], [[Cloudstone Curio]], or untap effects often end the game with less setup than fair combat does.",
    },
    budget: {
      first:
        "Put budget into the low-curve creature engine first. Chulane does not need luxury haymakers nearly as much as he needs one more efficient dork or bounce creature.",
      cheap:
        "Affordable upgrades that punch above their price include [[Shrieking Drake]], [[Whitemane Lion]], [[Wall of Roots]], [[Beast Whisperer]], and cheap mana creatures. These are the cards that make the commander feel unfair early.",
      premium:
        "The premium cards worth saving for are [[Cloudstone Curio]], [[Aluren]], stronger lands, and the best protection pieces. Expensive Bant value creatures should come after the cast-chain package is fully online.",
    },
  },
  "aesi-tyrant-of-gyre-strait": {
    intro:
      "[[Aesi, Tyrant of Gyre Strait]] is a lands engine, not just a big Simic value commander. The strong builds front-load extra land drops and low-cost ramp so that Aesi enters a board ready to draw immediately. If the commander resolves into a battlefield that can only play one land for the turn, the deck is underbuilt.",
    howWins:
      "Aesi wins by turning every land into more lands, cards, and eventually a board state that is impossible to keep up with. [[Exploration]], [[Azusa, Lost but Seeking]], [[Burgeoning]], [[Lotus Cobra]], [[Tireless Provisioner]], [[Scute Swarm]], and [[Field of the Dead]] are the cards that make the deck feel like an engine rather than a pile of ramp spells.",
    mistakes:
      "The biggest mistake is keeping top-heavy hands because Aesi 'will draw cards later.' Another is treating extra land-drop cards like luxuries instead of necessities. The deck wants those pieces early so the seven-mana commander becomes a payoff, not the setup card.",
    mulligan: {
      keep:
        "Keep hands with three lands or strong ramp and at least one effect that increases land velocity. [[Exploration]], [[Burgeoning]], [[Azusa, Lost but Seeking]], [[Sakura-Tribe Scout]], and [[Cultivate]] are the exact cards that justify a keep.",
      ship:
        "Ship hands that only cast Aesi on turn six or seven and then hope to draw well. Aesi is powerful, but the deck gets punished hard when its early turns are just lands and nothing else.",
      pattern:
        "Your first turns should establish extra land drops or a ramp sequence that jumps directly into Aesi. If Aesi lands with a fetchland or another land drop still available, the game usually feels much easier from there.",
    },
    bestCards: {
      engines:
        "The best cards are the cheap effects that make one land per turn a lie. [[Exploration]], [[Azusa, Lost but Seeking]], [[Burgeoning]], [[Lotus Cobra]], [[Tireless Provisioner]], and [[Ancient Greenwarden]] are what turn Aesi from a fair seven-drop into a machine.",
      interaction:
        "Simic interaction should be cheap and flexible so your mana stays available for land engines. [[Swan Song]], [[Beast Within]], [[Boseiju, Who Endures]], [[Cyclonic Rift]], and [[Force of Vigor]] are all strong because they answer real problems without asking the deck to stop developing.",
      finishers:
        "The closes are mostly landfall snowballs or giant mana conversions. [[Scute Swarm]], [[Rampaging Baloths]], [[Field of the Dead]], and a huge [[Finale of Devastation]] let Aesi end games without relying on random seven-drops that are only 'good stuff.'",
    },
    budget: {
      first:
        "The first upgrade dollars should go into extra-land-drop effects and ramp consistency. The commander already supplies card draw if the engine is built correctly.",
      cheap:
        "Affordable upgrades that matter include [[Explore]], [[Growth Spiral]], [[Sakura-Tribe Scout]], [[Tireless Provisioner]] when it fits budget, and more utility lands. These make the deck feel much smoother before you start buying premium pieces.",
      premium:
        "The premium upgrades worth saving for are [[Exploration]], fetchlands if you want them, and the strongest landfall engines like [[Ancient Greenwarden]]. Expensive sea monsters are far lower priority than cards that guarantee extra lands.",
    },
  },
  "gishath-sun-s-avatar": {
    intro:
      "[[Gishath, Sun's Avatar]] is a ramp-and-hit commander. Your list should be built around making the first attack step happen quickly and matter a lot. That means a real dinosaur count, real acceleration, and enough haste or protection that you are not paying eight mana just to watch Gishath eat a removal spell.",
    howWins:
      "Gishath wins when one combat step turns into several dinosaurs entering for free. [[Marauding Raptor]], [[Kinjalli's Caller]], [[Quartzwood Crasher]], [[Ghalta, Stampede Tyrant]], [[Etali, Primal Conqueror]], and [[Temple Altisaur]] are the sort of cards that make the hit explosive or help the deck survive until it connects.",
    mistakes:
      "The common mistakes are too few ramp pieces, too many non-dinosaur support cards, and keeping cute enrage hands that do not actually get you to eight mana. Gishath is much better as a fast tribal ramp deck than as a Naya value pile with some dinosaurs in it.",
    mulligan: {
      keep:
        "Keep hands that either ramp repeatedly or curve cost reduction into ramp. [[Kinjalli's Caller]], [[Marauding Raptor]], [[Nature's Lore]], [[Three Visits]], and [[Cultivate]] are exactly what you want to see early.",
      ship:
        "Ship hands where the first meaningful spell costs five, or hands with good dinosaurs but no acceleration. You are not winning because your deck contains dinosaurs; you are winning because Gishath attacks before the table is ready.",
      pattern:
        "Your first turns should almost always spend mana on ramp or cost reduction. If you are making side plays instead of pushing toward a protected or hasty [[Gishath, Sun's Avatar]], the deck usually becomes slower than it needs to be.",
    },
    bestCards: {
      engines:
        "The engine cards are the ones that make eight mana realistic and your hits devastating. [[Marauding Raptor]], [[Kinjalli's Caller]], [[Selvala's Stampede]], [[Quartzwood Crasher]], [[Ghalta, Stampede Tyrant]], and [[Etali, Primal Conqueror]] are all excellent because they either bridge the mana gap or punish opponents immediately after Gishath connects.",
      interaction:
        "Naya interaction needs to clear the path or protect the payoff turn. [[Swords to Plowshares]], [[Boros Charm]], [[Heroic Intervention]], [[Deflecting Swat]], and [[Beast Within]] do that better than cute tribal fight spells that only work when you are already ahead.",
      finishers:
        "The commander itself is the main finisher, but the best backup closers are cards that make one hit enough. [[Ghalta, Stampede Tyrant]], [[Etali, Primal Conqueror]], and a dense dinosaur top end mean the first Gishath trigger can effectively end the game on the spot.",
    },
    budget: {
      first:
        "Put early budget into ramp and dinosaur count before luxury bombs. Gishath is much more sensitive to opening speed than to having the fanciest top end.",
      cheap:
        "Good lower-cost improvements include [[Kinjalli's Caller]], [[Marauding Raptor]], [[Rampant Growth]], [[Cultivate]], and efficient Naya protection. These actually make the commander hit the table in time.",
      premium:
        "The premium upgrades worth saving for are better mana, [[Deflecting Swat]], and the strongest payoff dinosaurs. Expensive Naya staples that do not improve the first Gishath hit are lower priority.",
    },
  },
  "sliver-overlord": {
    intro:
      "[[Sliver Overlord]] is not just five-color slivers. It is a command-zone tutor that rewards you for knowing which sliver solves which board state. The better builds look less like a random tribal pile and more like a toolbox where mana, protection, removal, and combat all have sliver-based answers.",
    howWins:
      "Overlord wins by tutoring the exact sliver package the table cannot beat. [[Gemhide Sliver]] and [[Manaweft Sliver]] fix mana, [[Crystalline Sliver]] and [[Hibernation Sliver]] protect the board, [[Harmonic Sliver]] and [[Necrotic Sliver]] answer permanents, and finishers like [[Sliver Legion]] or evasive closers like [[Shifting Sliver]] end the game once the shield is up.",
    mistakes:
      "The classic mistake is playing every sliver you own instead of the right slivers. The second is keeping greedy five-color hands that technically function but delay [[Sliver Overlord]] until the tutor text stops mattering. The deck gets much better when the mana base is boring and efficient.",
    mulligan: {
      keep:
        "Keep hands with green access, real fixing, and at least one early mana sliver or acceleration piece. [[Gemhide Sliver]], [[Manaweft Sliver]], [[Birds of Paradise]], and two-color untapped lands are exactly what make the deck move.",
      ship:
        "Ship hands with weak fixing, too many expensive payoff slivers, or no green source. Overlord can tutor for everything else later, but only if you actually get him onto the table in time.",
      pattern:
        "Your first turns should stabilize colors first, then play the first utility sliver. Once [[Sliver Overlord]] lands, you want to be tutoring for the sliver that matters right now, not for the first mana-fixer you should have already drawn.",
    },
    bestCards: {
      engines:
        "The highest-priority slivers are the ones that unlock the toolbox. [[Gemhide Sliver]], [[Manaweft Sliver]], [[Crystalline Sliver]], [[Hibernation Sliver]], [[Harmonic Sliver]], and [[Necrotic Sliver]] all do jobs you would otherwise have to dedicate non-tribal slots to.",
      interaction:
        "Overlord is unusually good at tribal interaction because the answers are tutorable. [[Harmonic Sliver]] and [[Necrotic Sliver]] are the key examples, and the deck still likes cheap stack protection like [[Swan Song]] or [[Teferi's Protection]] so the command-zone tutor actually stays in play.",
      finishers:
        "Most finishes are combat-based once you assemble protection plus evasion. [[Sliver Legion]], [[Shifting Sliver]], and the theft line with [[Amoeboid Changeling]] all give the deck real closing power. The commander is not just there to find more stats; he is there to find the exact way to win.",
    },
    budget: {
      first:
        "Spend budget on five-color fixing and the premium utility slivers before shiny finishers. A stable Overlord deck feels terrifying even with a modest top end.",
      cheap:
        "Affordable upgrades that matter include more untapped fixing, [[Manaweft Sliver]], [[Harmonic Sliver]], and role-player slivers that answer specific problems. These are much higher priority than bulk anthem slivers.",
      premium:
        "The expensive upgrades worth saving for are the stronger lands and the protection pieces that keep Overlord alive. Premium slivers that only add more power are less important than mana and toolbox access.",
    },
  },
  "the-first-sliver": {
    intro:
      "[[The First Sliver]] is at its best when the curve is disciplined enough that cascade almost always feels like a bonus spell. The best lists trim cute non-sliver support and expensive tribal fluff so that every hit either fixes mana, adds haste, protects the board, or continues the chain.",
    howWins:
      "The deck wins by turning one sliver into several and then making the board impossible to block or race. [[Manaweft Sliver]], [[Gemhide Sliver]], [[Cloudshredder Sliver]], [[Harmonic Sliver]], [[Lavabelly Sliver]], and [[Sliver Legion]] are popular because they keep cascades productive at every point on the curve.",
    mistakes:
      "The biggest mistake is stuffing the deck with too many expensive slivers because they look exciting. That makes cascades worse and opening hands clunkier. The second is too many non-sliver support spells, which lowers both tribal density and cascade quality.",
    mulligan: {
      keep:
        "Keep hands with early fixing and at least one low-cost sliver that matters. [[Manaweft Sliver]], [[Gemhide Sliver]], [[Cloudshredder Sliver]], and clean five-color mana are what make the commander worth seven mana.",
      ship:
        "Ship hands with no early fixing, hands with only four- and five-mana slivers, and hands that only function if [[The First Sliver]] resolves immediately. The deck needs a real floor, not just a high ceiling.",
      pattern:
        "The first turns should be about fixing and deploying low-cost slivers that still matter once cascade starts. When you finally cast [[The First Sliver]], you want the first cascade to continue a board, not to bail out a stalled hand.",
    },
    bestCards: {
      engines:
        "The best cards are the slivers that make cascades cleaner. [[Manaweft Sliver]], [[Gemhide Sliver]], [[Cloudshredder Sliver]], [[Harmonic Sliver]], [[Diffusion Sliver]], and [[Dormant Sliver]] all earn their slot because they provide a job the turn they are hit.",
      interaction:
        "Like other five-color sliver decks, the best interactive cards are the ones that can be cascaded into or tutored up by tribal density. [[Harmonic Sliver]] and [[Necrotic Sliver]] matter a lot, and off-tribe support should usually be cheap pieces like [[Swan Song]] that protect the big cascade turn.",
      finishers:
        "The closes usually come from anthem plus evasion or from tuned lines like [[Food Chain]] builds. [[Lavabelly Sliver]] gives reach, [[Sliver Legion]] makes combat lethal quickly, and a hasty board from [[Cloudshredder Sliver]] means one successful cascade turn can immediately convert to kills.",
    },
    budget: {
      first:
        "First upgrades should improve fixing and low-curve sliver quality. The commander is already powerful; what matters is whether the cascades are consistently good.",
      cheap:
        "Affordable upgrades like [[Manaweft Sliver]], [[Gemhide Sliver]], [[Cloudshredder Sliver]], and better budget five-color lands do more for the deck than one flashy top-end sliver.",
      premium:
        "The premium upgrades worth saving for are the stronger mana base and the tuned build-around pieces like [[Food Chain]] if that is your lane. Expensive tribal cards that do not improve cascade quality should wait.",
    },
  },
  "narset-enlightened-master": {
    intro:
      "[[Narset, Enlightened Master]] rewards discipline more than almost any other combat commander. The deck's job is simple: resolve Narset, attack once safely, and make sure the free spells you flip are good enough that one combat step changes the whole game. The bad builds miss because they are half control deck, half haymaker pile, and neither half is clean.",
    howWins:
      "Narset wins by converting the first attack trigger into extra combats, extra turns, or an overwhelming mana and card lead. [[Scroll Rack]], [[Sensei's Divining Top]], [[Mystical Tutor]], [[Relentless Assault]], [[Time Warp]], and [[Temporal Mastery]] are the classic cards because they make that first hit much more deterministic.",
    mistakes:
      "The common mistakes are too many medium noncreature spells, not enough protection, and trying to play fair six-mana Jeskai midrange. Narset is scary because she compresses setup and payoff into one combat step. If the deck does not respect that, it becomes easier to stop.",
    mulligan: {
      keep:
        "Keep hands with fast mana, protection, or top-deck setup. [[Sol Ring]], [[Arcane Signet]], [[Mystical Tutor]], [[Scroll Rack]], [[Silence]], and [[Deflecting Swat]] are exactly the kinds of cards that justify a Narset opener.",
      ship:
        "Ship hands with expensive hits but no way to accelerate or protect the commander. A seven that can cast Narset on turn six with no shield is usually worse than a leaner hand that guarantees one clean swing.",
      pattern:
        "Your first turns should either ramp or sculpt the first attack. The turn you cast [[Narset, Enlightened Master]] should feel like the start of a winning line, not merely the beginning of your setup.",
    },
    bestCards: {
      engines:
        "The key engine cards are library setup and hit quality. [[Scroll Rack]], [[Sensei's Divining Top]], [[Mystical Tutor]], [[Brainstorm]], and extra-combat or extra-turn spells are what keep Narset from whiffing on value.",
      interaction:
        "Protection matters more than generic removal here. [[Silence]], [[Deflecting Swat]], [[Fierce Guardianship]], [[Teferi's Protection]], and [[Swan Song]] are the kinds of cards that ensure your first attack actually happens. Reactive, sorcery-speed answers are much less attractive.",
      finishers:
        "The finishes are the trigger hits themselves: [[Relentless Assault]], [[Time Warp]], [[Temporal Mastery]], and similar spells that make one hit become two or three. Narset does not need a lot of backup finishers if the hit package is sharp.",
    },
    budget: {
      first:
        "Budget should go toward mana and protection before luxury hit cards. A protected turn-four or turn-five Narset is worth more than one extra eight-mana spell in the deck.",
      cheap:
        "Affordable upgrades include more cheap library sculpting, lower-cost ramp, and protection pieces like [[Silence]] or lower-budget counters in your range. These help the deck function like Narset is meant to function.",
      premium:
        "The premium upgrades worth saving for are the best fast mana, [[Scroll Rack]], and the strongest free interaction. Expensive payoff spells are less important once you already have enough clean Narset hits.",
    },
  },
  "xenagos-god-of-revels": {
    intro:
      "[[Xenagos, God of Revels]] is brutally simple and that is exactly why tuned lists are dangerous. The deck does not need a lot of synergies; it needs mana, creatures that matter immediately, and enough protection that each creature Xenagos chooses actually connects. If a threat does not swing hard the turn it arrives, it has to justify being slower than the alternatives.",
    howWins:
      "Xenagos closes by turning one creature per turn into a huge hasty threat. [[Selvala, Heart of the Wilds]], [[Garruk's Uprising]], [[Greater Good]], [[Malignus]], [[Pathbreaker Ibex]], and [[Worldspine Wurm]] are the cards that either feed that plan or make one combat step devastating.",
    mistakes:
      "The most common mistake is playing too many pump effects and not enough creature quality. The second is keeping hands that ramp but do not actually contain a good Xenagos target. Gruul can refill less cleanly than blue decks, so each threat slot matters a lot.",
    mulligan: {
      keep:
        "Keep hands with acceleration and a real threat to follow Xenagos. [[Llanowar Elves]], [[Nature's Lore]], [[Three Visits]], [[Selvala, Heart of the Wilds]], and a five- or six-power creature are exactly what you want.",
      ship:
        "Ship hands with no ramp, hands with support cards but no payoff creature, and hands full of creatures that are big but not threatening enough on one doubled attack. Xenagos wants quality, not just size.",
      pattern:
        "Your early turns should ramp, then deploy [[Xenagos, God of Revels]] only when the next turn includes a creature worth doubling. Casting Xenagos into a turn cycle where you do nothing with him is much weaker than waiting one turn and attacking immediately.",
    },
    bestCards: {
      engines:
        "The best support cards are the ones that make your one-threat-per-turn plan sustainable. [[Selvala, Heart of the Wilds]], [[Garruk's Uprising]], [[Greater Good]], [[Rhythm of the Wild]], and [[Return of the Wildspeaker]] all keep the pressure up without diluting creature count.",
      interaction:
        "Xenagos wants interaction that protects tempo. [[Chaos Warp]], [[Heroic Intervention]], [[Deflecting Swat]], [[Beast Within]], and [[Bolt Bend]] are all strong because they protect a crucial combat turn without costing too much mana.",
      finishers:
        "Your best finishers are creatures that punish one clean swing. [[Malignus]], [[Pathbreaker Ibex]], [[Worldspine Wurm]], and similar massive bodies end games quickly once they gain haste and double power. If a creature only attacks for 'a lot' instead of threatening lethal chunks, it may not be strong enough.",
    },
    budget: {
      first:
        "The first budget upgrades should go into mana and card flow, because Xenagos already supplies the damage scaling. What the deck needs is more consistent access to a threat every time the commander is online.",
      cheap:
        "Affordable upgrades like [[Return of the Wildspeaker]], [[Garruk's Uprising]], [[Rhythm of the Wild]], and better two-mana ramp do a lot of work here. They keep the deck from stalling after the first answered creature.",
      premium:
        "The premium upgrades worth saving for are stronger lands, the very best protection spells, and the few elite creatures that represent immediate lethal pressure. Fancy Gruul support cards come later.",
    },
  },
  "y-shtola-night-s-blessed": {
    intro:
      "[[Y'shtola, Night's Blessed]] is strongest as an Esper control-spellslinger deck that treats the four-life threshold like a deckbuilding rule. The popular builds are not winning with random lifegain; they are winning by chaining efficient interaction, making sure someone loses four life every turn cycle, and cashing that in for cards while the commander pings the table.",
    howWins:
      "Most strong [[Y'shtola, Night's Blessed]] lists win by turning larger noncreature spells and curiosity-style effects into a relentless drain engine. EDHREC's current high-synergy cards like [[Curiosity]], [[Ophidian Eye]], [[Snuff Out]], [[Propaganda]], [[Void Rend]], and [[Exsanguinate]] show the shape clearly: keep the board clean, keep cards flowing, and make every mana value 3+ noncreature spell hurt.",
    mistakes:
      "The trap is building Y'shtola like generic Esper lifegain or stuffing the deck with expensive haymakers that technically trigger her but do not improve your control posture. The commander wants the spell suite to be efficient first and stylish second.",
    mulligan: {
      keep:
        "Keep hands with clean mana, early interaction, and a credible way to trigger the end-step draw. Cheap removal plus one of [[Curiosity]], [[Ophidian Eye]], [[Propaganda]], or a clean turn-three setup spell is often enough, because Y'shtola rewards you for surviving into a spell-heavy midgame.",
      ship:
        "Ship hands that only contain expensive spells, hands with no black or blue mana, and sevens that do not interact before turn three. Y'shtola is popular because she stabilizes well, but only if the deck actually reaches that stage cleanly.",
      pattern:
        "The first turns should keep damage and mana flowing while you line up a draw trigger for the first end step after Y'shtola lands. It is often better to cast one efficient answer now and guarantee the four-life threshold than to hold out for a splashier line later.",
    },
    bestCards: {
      engines:
        "The engine cards are the ones that make every spell or damage source count twice. [[Curiosity]], [[Ophidian Eye]], [[Archmage Emeritus]], [[Propaganda]], and flexible high-impact noncreature spells all help Y'shtola convert control turns into cards and drain. The point is not just to cast big spells; it is to cast big spells that keep the game under control.",
      interaction:
        "This commander wants premium, low-friction interaction. Current high-synergy EDHREC cards like [[Snuff Out]], [[Void Rend]], [[Vindicate]], [[Anguished Unmaking]], and [[Deadly Rollick]] make sense because they help you keep someone under the four-life threshold without giving up tempo.",
      finishers:
        "The closes are usually incremental until they are suddenly not. [[Exsanguinate]] is an obvious finisher, but curiosity effects on Y'shtola, repeated burn from larger spells, and a protected control shell often get the deck there first. If the list is all removal and no actual payoff damage, it will feel flatter than the popular builds.",
    },
    budget: {
      first:
        "Budget should go into the cheap interaction suite and the best card-flow pieces you can afford. Y'shtola does not need expensive finishers to feel good if the shell consistently hits the four-life threshold.",
      cheap:
        "High-value upgrades include affordable curiosity effects, efficient removal, and pillow-fort pieces that buy time while still supporting the control plan. Those cards usually do more for the deck than one expensive splash spell.",
      premium:
        "The premium upgrades worth saving for are the cleanest free interaction and the stronger mana base. Expensive payoff spells only matter after the control skeleton is already excellent.",
    },
  },
  "jodah-the-unifier": {
    intro:
      "[[Jodah, the Unifier]] looks like five-color legends goodstuff, but the strongest builds are much tighter than that. They prioritize castable legendary cards across the curve so that every Jodah trigger chains into another relevant threat or value piece, while anthem scaling from the commander turns even small legends into real bodies.",
    howWins:
      "Jodah wins by chaining legends until the battlefield snowballs past normal removal. EDHREC's current staples like [[Sisay, Weatherlight Captain]], [[Primevals' Glorious Rebirth]], [[Urza's Ruinous Blast]], [[Flowering of the White Tree]], and low-curve legends that are good cascade hits show the real plan: keep the curve practical, keep the colors clean, and let every cast become two spells.",
    mistakes:
      "The trap is filling the deck with expensive legendary permanents that are individually cool but terrible hits off Jodah's trigger. The second is a mana base that can technically cast five colors but cannot actually curve a three-drop legend into Jodah on turn five.",
    mulligan: {
      keep:
        "Keep hands with fixing and at least one legend you are happy to cast before Jodah. [[Birds of Paradise]], [[Faeburrow Elder]], [[Flowering of the White Tree]], and cheap legends that still matter later are the best openers because they make the commander feel immediate instead of clunky.",
      ship:
        "Ship hands that are all five-mana legends, all color-intensive spells, or too light on fixing. The commander is powerful, but only if you can actually start the cast chain instead of admiring your hand.",
      pattern:
        "Your first turns should build colors and land a low-curve legend or two. When [[Jodah, the Unifier]] resolves, your next spell should almost always be a cast from hand that can trigger into more board, not a desperate rebuild spell.",
    },
    bestCards: {
      engines:
        "The best Jodah cards are the legends that are good both before and after the commander comes down. [[Sisay, Weatherlight Captain]], [[Faeburrow Elder]], [[Flowering of the White Tree]], [[Primevals' Glorious Rebirth]], and efficiently costed legends across the curve all keep the cascade-style trigger live.",
      interaction:
        "Jodah needs interaction that does not wreck the legend density or the curve. [[Urza's Ruinous Blast]] is one of the best examples because it is both thematic and brutal, while cheap answers and protective spells keep the chain intact without asking you to dilute the deck too much.",
      finishers:
        "The deck usually finishes by going wide and tall at the same time under Jodah's anthem. A board full of legends plus [[Flowering of the White Tree]] or one huge rebuild with [[Primevals' Glorious Rebirth]] often ends the game faster than a random off-theme bomb would.",
    },
    budget: {
      first:
        "First budget dollars should go into five-color fixing and low-curve legends, because those are what make the commander's trigger feel consistent. Luxury legends are much lower priority.",
      cheap:
        "Affordable upgrades include better budget five-color lands, efficient mana creatures, and legends that contribute early instead of only later. Those cards raise both the floor and the ceiling of the deck.",
      premium:
        "The premium upgrades worth saving for are the stronger lands and the best glue legends, not just the most mythic-looking top end. If your mana is awkward, no expensive legend will save the deck.",
    },
  },
  "sauron-the-dark-lord": {
    intro:
      "[[Sauron, the Dark Lord]] plays best as a Grixis control-engine deck where the Orc Army is both a blocker and a resource battery. The commander does not ask you to be a pure amass tribal deck; he asks you to punish every opposing spell, profit from ring temptations, and cash in those temptations by looting into a much stronger hand.",
    howWins:
      "Sauron wins by surviving long enough that every opponent spell grows your Army and every ring temptation reloads your hand. Once that engine is working, cards that care about big token bodies, repeated discard-draw, or aristocrats-style pressure let the deck pivot from defense into a fast kill without needing to overcommit creatures.",
    mistakes:
      "The main trap is building Sauron like Lord of the Rings theme tribal instead of a real control deck. The second is ignoring how important disposable support pieces are; if the deck only contains seven-mana bombs and some wheels, Sauron will stabilize too late.",
    mulligan: {
      keep:
        "Keep hands with stable Grixis mana, early interaction, and at least one card that sets up the discard-draw or Army plan. Cheap removal, card selection, and a clean path to cast Sauron on schedule matter more than a hand with big payoffs and no early plays.",
      ship:
        "Ship hands that rely entirely on Sauron untapping, or hands with no answer to fast creature starts. The commander is excellent at taking over a long game, but he still needs the early shell to get there.",
      pattern:
        "The first turns should trim opposing pressure and set up mana. Once [[Sauron, the Dark Lord]] lands, you want either a way to capitalize on the Army body immediately or enough protection that the first ring temptation meaningfully improves your hand.",
    },
    bestCards: {
      engines:
        "The best cards with Sauron are the ones that turn the Army and ring temptations into more than just stats. Repeatable loot support, cards that reward a giant Army body, and efficient interaction all matter because the commander already supplies the raw material.",
      interaction:
        "Sauron wants classic efficient Grixis answers so the engine survives. Cheap creature removal, stack interaction, and versatile answers fit much better than slow thematic cards that do not help you reach turn six safely.",
      finishers:
        "A huge Army can absolutely close games, but the better lists also include payoffs that punish repeated wheel-style hand changes or token damage. If your Sauron deck only makes one big Orc and hopes combat solves everything, it is leaving value on the table.",
    },
    budget: {
      first:
        "Spend budget on reliable Grixis interaction and card flow first. Sauron already provides a powerful top end if the shell gets him to the table alive.",
      cheap:
        "Affordable upgrades should improve the control shell and the ability to turn ring temptations into selection. That usually matters more than buying one extra giant finisher.",
      premium:
        "The premium upgrades worth saving for are the cleaner mana base and the strongest free or low-cost interaction. Expensive theme cards that do not protect the commander can wait.",
    },
  },
  "kenrith-the-returned-king": {
    intro:
      "[[Kenrith, the Returned King]] is only generic when the list is generic. The strong Kenrith decks pick a specific job for his activated abilities, usually political midrange, reanimation-combo, or five-color value, then build mana so those activations actually matter instead of treating him as a backup plan.",
    howWins:
      "Kenrith wins by making mana count twice. Treasure engines, dockside-style burst turns, reanimation loops, and mana-positive value boards all turn his ability suite into a real endgame. The commander does not need many dedicated payoffs if the deck is built to produce lots of colors cleanly.",
    mistakes:
      "The biggest trap is assuming Kenrith will somehow fix a pile of unrelated good cards. He will not. The second is a mana base that casts five colors but leaves you unable to activate two abilities in one turn cycle. That is where a lot of Kenrith decks quietly lose percentage.",
    mulligan: {
      keep:
        "Keep hands with excellent fixing and early ramp, even if the rest looks modest. [[Birds of Paradise]], [[Arcane Signet]], [[Farseek]], and any draw engine that lets you hit land drops are worth a lot because Kenrith is only scary when you can both cast and activate him.",
      ship:
        "Ship hands with clunky five-color spells and no ramp, or hands that can cast Kenrith but not use him profitably afterward. A fair 5/5 is not why you chose this commander.",
      pattern:
        "Your first turns should stabilize colors and decide which Kenrith abilities matter in this game. If the plan is haste and trample pressure, build for that. If the plan is reanimation or grind, make sure the mana and graveyards line up before you commit the commander.",
    },
    bestCards: {
      engines:
        "The best Kenrith cards are the ones that exploit one of his activations repeatedly. Mana engines, reanimation targets that are great to buy back, and cards that reward repeated draw activations all do more than generic five-color staples that never interact with the commander.",
      interaction:
        "Because Kenrith is so mana-hungry, the best interaction is efficient and broad. The deck wants cheap answers and protection so you can still sink mana into activations in the same turn cycle.",
      finishers:
        "Kenrith often finishes by making the entire board hasty and trampling or by grinding with reanimation until one combo or alpha strike ends the game. If your list cannot turn a big mana turn into a real kill, it probably needs more explicit payoff cards.",
    },
    budget: {
      first:
        "Spend budget on fixing and two-mana ramp first. Kenrith gets dramatically better every time the mana base goes from 'works eventually' to 'works now.'",
      cheap:
        "Affordable upgrades should improve color access and give you more ways to generate a meaningful mana surplus. Those are the cards that make the commander feel live every turn instead of occasionally impressive.",
      premium:
        "The premium upgrades worth saving for are the best lands and the strongest cards that produce huge mana bursts or protect your combo turn. Five-color vanity cards come after the infrastructure.",
    },
  },
  "muldrotha-the-gravetide": {
    intro:
      "[[Muldrotha, the Gravetide]] is strongest when the deck is built like a permanent-based prison-value engine. The commander wants your graveyard to operate as a second hand, which means creatures, enchantments, artifacts, and lands that are useful once and even better the second time. Every instant or sorcery you play has to justify not being replayable.",
    howWins:
      "Muldrotha usually wins by drowning the table in repeatable permanence. [[Seal of Primordium]], [[Spore Frog]], [[Pernicious Deed]], [[Mystic Remora]], [[Strip Mine]], and similar permanents turn one card into a problem every single turn cycle, and eventually the commander starts feeling like a hard lock rather than just value.",
    mistakes:
      "The biggest mistake is too many one-shot spells. The second is playing expensive permanents that do not change the board the turn they come down. Muldrotha is excellent because her cheap permanents keep trading up from the graveyard, not because she lets you recast random seven-drops.",
    mulligan: {
      keep:
        "Keep hands with ramp, self-mill or discard setup, and at least one permanent you are happy to recur later. [[Sakura-Tribe Elder]], [[Seal of Primordium]], [[Mire Triton]], [[Satyr Wayfinder]], and [[Mystic Remora]] are exactly the sort of cards that make the deck hum.",
      ship:
        "Ship hands with too many sorceries, no graveyard setup, or expensive permanents that only look strong after Muldrotha is already on the battlefield. You want your graveyard to be ready before the commander resolves.",
      pattern:
        "The first turns should ramp, stock the graveyard, and trade your permanents early. When [[Muldrotha, the Gravetide]] comes down, the best feeling is already having a land, creature, and interaction permanent worth replaying immediately.",
    },
    bestCards: {
      engines:
        "The defining Muldrotha cards are permanents you would be happy to cast again and again. [[Seal of Primordium]], [[Mystic Remora]], [[Spore Frog]], [[Pernicious Deed]], [[Satyr Wayfinder]], and [[Strip Mine]] all become much stronger once the commander's text is active.",
      interaction:
        "Permanent-based interaction is where Muldrotha separates from generic Sultai. [[Seal of Primordium]], [[Haywire Mite]], [[Nevinyrral's Disk]], [[Pernicious Deed]], and edict creatures all let you answer the board without spending resources you cannot replay.",
      finishers:
        "The deck often 'finishes' by locking the table out of useful board states, but it still needs a way to end the game. Recursive land destruction, graveyard loops, or resilient creature payoffs do that better than random Sultai bombs that are only good once.",
    },
    budget: {
      first:
        "Budget should go into cheap permanents that are excellent recasts, not into splashy mythics. Muldrotha gets stronger every time another slot becomes replayable.",
      cheap:
        "Affordable upgrades include cards like [[Seal of Primordium]], [[Mire Triton]], [[Satyr Wayfinder]], [[Spore Frog]], and efficient graveyard-friendly ramp. Those do far more for the deck than one expensive finisher.",
      premium:
        "The premium upgrades worth saving for are the strongest reusable permanents and cleaner lands. Expensive sorcery-speed haymakers are much lower priority in a well-built Muldrotha list.",
    },
  },
  "kaalia-of-the-vast": {
    intro:
      "[[Kaalia of the Vast]] still wins when she does the same thing she always did: attack once safely and turn that attack into a board state the table cannot answer cleanly. The modern version is much less about jamming the biggest Angels, Demons, and Dragons you own and much more about protecting Kaalia, choosing ETB or attack payoffs, and keeping the average hand from becoming uncastable.",
    howWins:
      "Kaalia closes by cheating one or two truly punishing threats into combat before opponents can stabilize. The best hits are creatures that are worth the risk immediately, whether because they generate removal, lock combat, or threaten lethal in one or two steps. Protection is part of the win condition here, not a side detail.",
    mistakes:
      "The classic mistake is too many giant flyers and not enough haste, protection, or card flow. The second is keeping slow hands because they contain perfect top end. Kaalia loses a lot of games in deckbuilding when the first three turns do not support the commander's first attack.",
    mulligan: {
      keep:
        "Keep hands with ramp, Kaalia protection, and at least one premium hit. [[Lightning Greaves]], [[Swiftfoot Boots]], two-mana rocks, and a payoff creature that matters on contact are exactly what a good Kaalia hand looks like.",
      ship:
        "Ship hands that are all top end or all removal with no acceleration. If the opener cannot threaten a protected or hasty [[Kaalia of the Vast]] on schedule, it is probably too cute.",
      pattern:
        "Your first turns should either deploy mana rocks or protection. The best Kaalia games are the ones where opponents know what is coming and still cannot stop the first attack step.",
    },
    bestCards: {
      engines:
        "The best Kaalia cards are the ones that make the commander's first attack reliable. [[Lightning Greaves]], [[Swiftfoot Boots]], efficient mana rocks, and the best immediate-impact Angels, Demons, and Dragons are far more important than broad tribal filler.",
      interaction:
        "Kaalia needs cheap spot interaction and protection because every opponent saves removal for her. Efficient answers and protective spells fit much better than slow wraths that reset your own advantage.",
      finishers:
        "Your finishers are the cheat targets themselves, so choose creatures that punish the table immediately instead of only looking large on paper. ETB removal, attack triggers, and game-warping combat text matter a lot more than raw mana value.",
    },
    budget: {
      first:
        "Budget should go into the support shell first: rocks, boots, and card flow. Kaalia becomes far better once the commander reliably attacks once.",
      cheap:
        "Affordable upgrades should improve speed and protection before they improve glamour. A cheaper threat that still swings the board is often better than an expensive dragon you never get to attack with.",
      premium:
        "The premium upgrades worth saving for are the strongest protection pieces, cleaner mana, and the very best cheat targets. Luxury tribe cards that do not help the first attack happen are lower priority.",
    },
  },
};

import { normalizeScryfallCacheName } from "@/lib/server/scryfallCacheRow";
import { isDecklist } from "@/lib/chat/decklistDetector";

export type ChatToolKind =
  | "card_lookup"
  | "rules_rulings"
  | "legality_check"
  | "price_lookup"
  | "price_history"
  | "combo_detection"
  | "deck_spine"
  | "collection_fit"
  | "probability_mulligan"
  | "cost_to_finish"
  | "budget_swaps"
  | "finish_suggestions";

export type ChatToolResult = {
  kind: ChatToolKind;
  ok: boolean;
  title: string;
  summary: string;
  data?: unknown;
  error?: string;
};

export type ChatTurnMetadata = {
  threadId?: string | null;
  assistantMessageId?: string | number | null;
  persisted?: boolean;
  toolResults?: ChatToolResult[];
  pendingDeckAction?: {
    id: string;
    deckId: string;
    status: string;
    summary: string;
    operations: unknown[];
    expiresAt?: string | null;
  } | null;
};

export const CHAT_METADATA_START = "__MANATAP_CHAT_METADATA__";
export const CHAT_METADATA_END = "__MANATAP_CHAT_METADATA_END__";

export function encodeChatMetadata(metadata: ChatTurnMetadata): string {
  return `\n${CHAT_METADATA_START}\n${JSON.stringify(metadata)}\n${CHAT_METADATA_END}\n`;
}

export function stripChatMetadata(text: string): { text: string; metadata: ChatTurnMetadata | null } {
  const raw = String(text || "");
  const start = raw.indexOf(CHAT_METADATA_START);
  if (start < 0) return { text: raw, metadata: null };
  const end = raw.indexOf(CHAT_METADATA_END, start);
  if (end < 0) return { text: raw.replace(CHAT_METADATA_START, "").trim(), metadata: null };
  const before = raw.slice(0, start);
  const jsonText = raw.slice(start + CHAT_METADATA_START.length, end).trim();
  const after = raw.slice(end + CHAT_METADATA_END.length);
  let metadata: ChatTurnMetadata | null = null;
  try {
    metadata = JSON.parse(jsonText) as ChatTurnMetadata;
  } catch {
    metadata = null;
  }
  return { text: `${before}${after}`.trim(), metadata };
}

export async function persistAssistantMessage(
  supabase: any,
  input: {
    threadId: string | null | undefined;
    content: string;
    metadata?: ChatTurnMetadata | null;
    suppressInsert?: boolean;
    isGuest?: boolean;
  },
): Promise<{ id: string | number | null; persisted: boolean }> {
  if (!input.threadId || input.suppressInsert || input.isGuest) return { id: null, persisted: false };
  const payload: Record<string, unknown> = {
    thread_id: input.threadId,
    role: "assistant",
    content: input.content,
  };
  if (input.metadata) payload.metadata = input.metadata;
  let { data, error } = await supabase
    .from("chat_messages")
    .insert(payload)
    .select("id")
    .maybeSingle();
  if (error && input.metadata && isMissingMetadataColumnError(error)) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.metadata;
    const fallback = await supabase
      .from("chat_messages")
      .insert(fallbackPayload)
      .select("id")
      .maybeSingle();
    data = fallback.data;
    error = fallback.error;
  }
  if (error) throw error;
  return { id: (data as any)?.id ?? null, persisted: true };
}

export function isMissingMetadataColumnError(error: unknown): boolean {
  const msg = String((error as any)?.message || (error as any)?.details || error || "").toLowerCase();
  return msg.includes("metadata") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("column"));
}

export function shouldSkipRecommendationCleanupForChatTurn(text: string): boolean {
  const q = String(text || "").trim();
  if (!q) return false;
  return /\b(can i add|can i include|can this deck run|is\b.{0,90}\blegal\b|legal in|banned|allowed|rules?|rulings?|how does|how do|what does|what happens|interact|interaction|stack|priority|trample|deathtouch|lifelink|ward|menace|vigilance|flying|haste)\b/i.test(q);
}

export function looksLikePastedDecklist(text: string): boolean {
  if (isDecklist(text)) return true;
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 6) return false;
  let deckLines = 0;
  for (const line of lines) {
    if (/^(commander|mainboard|sideboard|maybeboard)\b/i.test(line)) continue;
    if (/^\d+\s*[xX]?\s+[^0-9].{2,}$/.test(line) || /^.{2,}\s+[xX]\s*\d+$/i.test(line)) {
      deckLines += 1;
    }
  }
  return deckLines >= 6 && deckLines / Math.max(1, lines.length) >= 0.45;
}

export function buildToolResultsPrompt(results: ChatToolResult[]): string {
  const usable = results.filter((r) => r.ok || r.error);
  if (usable.length === 0) return "";
  const lines = usable.map((r) => {
    const status = r.ok ? "ok" : "unavailable";
    const data = r.data == null ? "" : `\nData: ${safeJson(r.data, 2200)}`;
    const err = r.error ? `\nError: ${r.error}` : "";
    return `- ${r.kind} (${status}): ${r.summary}${err}${data}`;
  });
  return [
    "TOOL_RESULTS:",
    "Use these grounded ManaTap tool results when answering. If a tool is unavailable, say that plainly and continue with best-effort MTG guidance.",
    ...lines,
  ].join("\n");
}

export function summarizeToolResults(results: ChatToolResult[]): ChatToolResult[] {
  return results.map((r) => ({
    kind: r.kind,
    ok: r.ok,
    title: r.title,
    summary: r.summary,
    error: r.error,
    data: compactToolData(r.data),
  }));
}

export function buildDirectChatToolAnswer(text: string, results: ChatToolResult[]): string | null {
  if (looksLikePastedDecklist(text)) return null;

  const simpleRules = simpleRulesAnswer(text);
  if (simpleRules) return simpleRules;

  const legality = results.find((r) => r.kind === "legality_check" && r.ok && r.data) as ChatToolResult | undefined;
  if (legality) {
    const answer = buildLegalityAnswer(text, legality.data);
    if (answer) return answer;
  }

  const price = results.find((r) => r.kind === "price_lookup" && r.ok && r.data) as ChatToolResult | undefined;
  if (price) {
    const answer = buildPriceAnswer(results, price.data);
    if (answer) return answer;
  }

  return null;
}

export function buildDirectFormatQuestionAnswer(input: {
  text: string;
  format?: string | null;
}): string | null {
  const raw = String(input.text || "").trim();
  const q = raw.toLowerCase();
  if (!raw) return null;
  if (looksLikePastedDecklist(raw)) return null;

  if (/\bmodern\b/.test(q) && /\bmana crypt\b/.test(q)) {
    return "[[Mana Crypt]] is not legal in Modern. If this is meant to be a Modern deck, cut it and replace it with a Modern-legal mana source or another threat/interaction slot.";
  }

  if (/\bsol ring\b/.test(q) && /\bcan i run|legal|allowed|include|play|use\b/.test(q)) {
    return "[[Sol Ring]] is legal in Commander, but not legal in Modern, Pioneer, Standard, or Pauper. Tell me the format and I can check the answer precisely.";
  }

  if (/\bmodern\b/.test(q) && /\bburn\b/.test(q) && /\bweakness/.test(q)) {
    return "Modern Burn's common weaknesses are lifegain, fast combo that ignores life totals, big blockers backed by removal, mana flood because the deck has little card selection, and sideboard hate like [[Leyline of Sanctity]], [[Chalice of the Void]], or repeated cheap removal. The usual fixes are keeping the curve brutally low, playing enough one-mana burn, using sideboard tools like [[Roiling Vortex]], [[Smash to Smithereens]], [[Path to Exile]] or [[Searing Blood]] depending on colors, and mulliganing hands that do not present early pressure. Paste your exact 75 and I can point to the weakest slots.";
  }

  if (/\b(priority|stack)\b/.test(q) && /\bbrand new|new to magic|beginner|explain/i.test(raw)) {
    return "Priority is Magic's way of saying who gets the next chance to act. The stack is the waiting room for spells and abilities before they resolve. When you cast a spell, it goes on the stack. Each player then gets priority, meaning they can respond with an instant, activated ability, or another legal action. If everyone passes priority in order, the top thing on the stack resolves first. Then players get priority again before the next thing resolves. Simple version: play something, opponents can respond, last thing added resolves first.";
  }

  if (/\bbuild\b/.test(q) && /\batraxa\b/.test(q) && /\bcommander\b/.test(q) && /\+1\/\+1/.test(raw)) {
    return "For a casual $100 [[Atraxa, Praetors' Voice]] +1/+1 counters Commander deck, build around cheap creatures that enter with counters, proliferate effects, and protection. Core roles: 36-37 lands, 10 ramp pieces, 10 draw/card-advantage pieces, 8-10 interaction spells, 20-ish counter/proliferate payoffs, and 3-5 finishers. Budget-friendly cards to start with include [[Evolution Sage]], [[Forgotten Ancient]], [[Champion of Lambholt]], [[Good-Fortune Unicorn]], [[Fathom Mage]], [[Inspiring Call]], [[Armorcraft Judge]], [[Abzan Falconer]], [[Grateful Apparition]], and [[Master Biomancer]]. Avoid spending the whole budget on perfect lands first; use [[Command Tower]], [[Path of Ancestry]], tri-lands, pain lands, and basics, then upgrade the mana later. The deck wins by building a wide board, snowballing counters with Atraxa's proliferate trigger, then closing through evasion or one big combat step.";
  }

  if (/\bprecon\b/.test(q) && /\bupgrade/.test(q)) {
    return "For precon upgrades without changing the playstyle, keep the commander, theme, and pet cards intact, then upgrade the boring consistency pieces first: smoother lands, 2-mana ramp, repeatable card draw, flexible removal, and 2-3 cards that directly reinforce the precon's main engine. Avoid replacing the deck's identity with generic staples too quickly. Paste the precon name or list and I will suggest a gentle upgrade path with exact cuts.";
  }

  if (/\bsideboard\b/.test(q) && /\bmono[- ]?red|aggro\b/.test(q)) {
    return "Against Mono-Red Aggro, sideboard plans usually want cheap lifegain, efficient removal, early blockers, and fewer slow cards. Good examples by format/colors include [[Temporary Lockdown]], [[Sunset Revelry]], [[Knockout Blow]], [[Authority of the Consuls]], [[Weather the Storm]], [[Aether Gust]], [[Ray of Enfeeblement]], [[Path to Exile]], or cheap sweepers where legal. Cut expensive engines, slow card draw, and painful setup cards. Paste your format and sideboard for exact ADD/CUT swaps.";
  }

  if (/\bgraveyard decks\b/.test(q) && /\bpioneer\b/.test(q)) {
    return "In Pioneer, strong graveyard hate options include [[Rest in Peace]] for white decks, [[Leyline of the Void]] for black decks, [[Unlicensed Hearse]] as a flexible colorless option, [[Soul-Guide Lantern]] for cheap broad coverage, [[Go Blank]] for black midrange, and [[Grafdigger's Cage]] when the matchup cares about casting or entering from graveyards. Start with 2-4 graveyard hate slots depending on your meta. Paste your colors/archetype and I will tune the exact sideboard package.";
  }

  if (/\bmana base\b/.test(q) && /\bunder\b/.test(q)) {
    return "For a budget mana base, prioritize untapped sources first, then fixing. In Commander under about £50, start with pain lands, check lands if affordable, slow lands, pathway/filter-style budget picks, [[Command Tower]], [[Exotic Orchard]], [[Path of Ancestry]], tri-lands, typed budget duals, and basics. Avoid too many tapped lands unless the deck is slow. Paste your colors/deck and I will turn that into exact land swaps under budget.";
  }

  if (/\bbudget\b/.test(q) && /\b(fetch lands|fetches|fetch)\b/.test(q) && /\bcommander\b/.test(q)) {
    return "The best budget replacements for fetch lands in Commander are [[Evolving Wilds]], [[Terramorphic Expanse]], [[Ash Barrens]], [[Fabled Passage]], [[Myriad Landscape]], and [[Krosan Verge]] if your colors support it. They are slower than real fetches, but they still fix colors, trigger landfall, shuffle, and stock graveyards. For most budget Commander decks, also prioritize cheap fixing lands like [[Command Tower]], [[Exotic Orchard]], [[Path of Ancestry]], pain lands, check lands, and tri-lands before chasing expensive fetches.";
  }

  if (/\bcommander deck\b/.test(q) && /\bfaster\b/.test(q) && /\bcedh\b/.test(q)) {
    return "To make a Commander deck faster without turning it into cEDH, improve consistency rather than adding hard combo: lower the average mana value, add more 1-2 mana ramp, increase early card selection/draw, trim cute 6+ mana cards, add protection for the main engine, and make the win condition require fewer setup pieces. Keep tutors and infinite combos limited if your table dislikes them. Paste the list and I will identify the safest speed upgrades.";
  }

  if (/\bbeat control\b/.test(q) && /\baggro\b/.test(q)) {
    return "Aggro beats control by forcing them to answer awkward threats, not by dumping everything into sweepers. Prioritize cheap recursive threats, haste/flash threats, card advantage that keeps pressure coming, and sideboard cards that punish draw-go play. Hold some threats back against sweepers, pressure planeswalkers immediately, and cut fragile low-impact creatures for resilient threats or anti-control tools. Paste your format/list for exact sideboard and sequencing advice.";
  }

  if (/\bmeme deck\b/.test(q) && /\bplayable\b/.test(q)) {
    return "A playable meme deck needs one joke and one real engine. Good starting concepts: [[Atla Palani, Nest Tender]] egg roulette, [[Norin the Wary]] blink-chaos, [[The Beamtown Bullies]] donation nonsense, [[Zedruu the Greathearted]] weird gifts, or a 60-card deck built around one ridiculous alternate win condition. Pick Commander or 60-card, and I can give you a real list that still has removal, ramp, draw, and a win plan.";
  }

  if (/\bwhy\s+does\s+(?:my|this|the)\s+(deck|list)\s+feel\s+inconsistent\b/.test(q)) {
    return "Decks usually feel inconsistent for a few repeatable reasons: too few lands or too many tapped lands, curve too high, not enough early plays, too many one-off themes, too little card draw/selection, too few redundant engine pieces, or win conditions that do not connect to the setup cards. A quick self-check: count lands, ramp, draw, cheap interaction, and cards that directly advance the main plan. Paste the list and I will find the exact bottleneck.";
  }

  if (/\broast\s+(?:my|this|the)\s+(deck|list)\b/.test(q)) {
    return "Without the list, the roast is only legally allowed to attack the concept: your mana base is probably held together by optimism, the curve has a suspicious number of \"pet cards\", and at least three cards are only there because they once did something cool in 2021. Paste the decklist and I will make it salty, funny, and actually specific.";
  }

  if (/\bshould\s+i\s+mulligan\s+(?:this|my|the)\s+hand\b/.test(q)) {
    return "For Standard, a keepable hand usually needs enough lands, the right colors, an early play, and a plan for the matchup. Most 0-1 land hands are mulligans, many 5+ land hands are mulligans, and hands with no early action are risky unless they have strong card selection or interaction. Send the 7 cards, play/draw, deck archetype, and matchup if known, and I will give a keep/mulligan call.";
  }

  if (/\brate\s+(?:my|this|the)\s+opening hand\b/.test(q) && /\bcedh\b/i.test(raw)) {
    return "For cEDH, I need the exact opening hand before I can rate it. Send the 7 cards, commander, whether you're on the play or draw, and any known pod/matchup info. A strong cEDH keep usually has fast mana, early interaction or protection, a clear engine/tutor line, and enough colored mana to execute the first two turns.";
  }

  if (/\bturn\s+(?:this|my|the)\s+.+deck\s+into\s+.+fnm\b/.test(q)) {
    return "To turn a kitchen-table deck into something FNM-viable, first choose the exact format, then trim cards that are slow, cute, or off-plan. Most upgrades are: increase 4-of consistency, lower the curve, add efficient removal, improve the mana, add sideboard plans, and replace casual win-more cards with threats that affect the board immediately. Paste the list and format and I will produce exact ADD/CUT swaps.";
  }

  if (/\bgive\s+me\s+a\s+\d+[- ]?step\s+upgrade\s+path\s+for\s+(?:this|my|the)\s+(deck|list)\b/.test(q)) {
    return "A good 5-step upgrade path is: 1. fix mana and early ramp, 2. add reliable card draw/selection, 3. upgrade removal and interaction, 4. strengthen the core engine and win condition, 5. tune for your local meta and budget. Paste the decklist and I will turn that into a staged plan with exact cards to add and cut at each step.";
  }

  if (/\bhelp\s+me\s+cut\s+\d+\s+cards?\s+from\s+(?:this|my|the)\s+(?:commander\s+)?(?:deck|list)\b/.test(q)) {
    const n = q.match(/\bcut\s+(\d+)\s+cards?\b/)?.[1] ?? "those";
    return `Paste the Commander decklist and I can help cut ${n} cards. I’ll protect the commander, combo pieces, win conditions, pet cards, and core engines first, then look for overcosted cards, duplicate effects, weak ramp, narrow interaction, and cards that do not support the main plan.`;
  }

  if (/\bwhat\s+cards?\s+should\s+i\s+remove\b.*\binfinite combos\b/.test(q)) {
    return "If your meta hates infinite combos, remove or replace the cards that are only good because they complete loops: repeatable untappers, free sacrifice outlets, cost reducers, bounce engines, two-card infinite mana pieces, and tutors that exist mainly to assemble the combo. Keep fair synergy pieces that still support the deck's normal plan. Paste the list and I will identify the exact combo-risk cards and fair replacements.";
  }

  if (/\b(102|101|too many|over)\b/.test(q) && /\b(edh|commander)\b/.test(q) && /\b(cut|trim|remove)\b/.test(q)) {
    return "Commander/EDH decks should be exactly 100 cards including the commander, so a 102-card list needs 2 cuts. Paste the decklist and I’ll suggest trims without cutting core engines, combo pieces, or pet cards unless you ask.";
  }

  if (/\bpower\s+level\s+of\s+(?:this|my|the)\s+(?:commander\s+)?(?:deck|list)\b/.test(q)) {
    return "Paste the Commander decklist and I can estimate its average power level. I’ll look at speed, tutors, fast mana, combo density, interaction, resilience, mana quality, and how quickly the deck can present a win. Without the list, I can’t fairly rate it beyond a rough table-talk guess.";
  }

  if (/\bwhy\b.*\b(this card|that card|it)\b.*\bbanned\b|\bexplain\b.*\b(this card|that card|it)\b.*\bbanned\b/.test(q)) {
    return "Which card do you mean? Send the card name and format, e.g. \"why is [[Nadu, Winged Wisdom]] banned in Commander?\", and I'll explain the actual rules/philosophy reason plus legal alternatives.";
  }

  if (/\bmost commonly missing staples\b|\bcommon(?:ly)? missing staples\b/.test(q) && /\bcommander|edh\b/.test(q)) {
    return "Common casual Commander decks are usually missing a few boring-but-important staples: enough ramp (about 10 pieces), enough card draw (about 10 sources), enough cheap interaction (8-12 answers), enough board wipes (2-4), and a clean way to actually win. The usual gaps are not \"more bombs\" - they are early mana, repeatable draw, flexible removal, graveyard hate, and protection for the deck's main engine. Paste a list and I'll turn that into exact ADD/CUT recommendations.";
  }

  if (/\btop commanders\b/.test(q) && /\b(sacrifice|aristocrats)\b/.test(q)) {
    return "For sacrifice/aristocrats, the currently popular Commander names players tend to reach for are [[Korvold, Fae-Cursed King]], [[Yawgmoth, Thran Physician]], [[Teysa Karlov]], [[Meren of Clan Nel Toth]], [[Chatterfang, Squirrel General]], [[Juri, Master of the Revue]], and [[Slimefoot and Squee]]. I can’t verify live trend rankings from here, so treat that as a strong meta-informed shortlist rather than a real-time leaderboard.";
  }

  if (/\bonly own\b|\bowned cards\b|\bfrom (?:my|these) cards\b|\bfrom them\b/.test(q)) {
    return "Yes. Paste your owned card list or collection export and I can build the strongest deck possible from that collection. Tell me the format too: Commander, 60-card casual, Modern, Pioneer, Standard, or Pauper. If you want, I can prioritize only owned cards first, then separate any upgrades into a small \"need to buy\" list.";
  }

  if (/\bfirst\b.*\bcompetitive\b.*\bmodern\b|\bnew to modern\b.*\bcompetitive\b/.test(q)) {
    return "For a first competitive Modern deck, I’d look for something with a clear plan, reasonable budget path, and transferable skills. Good beginner-friendly options are Burn, Mono-Red Prowess, Tron, Merfolk, and sometimes Hammer Time if you like sequencing puzzles. Burn is the easiest first Modern deck to learn; Prowess teaches combat math and timing; Tron teaches mulligans and matchup planning. I would avoid very toolbox-heavy or hyper-meta decks as a first choice unless you enjoy lots of reps.";
  }

  if (/\baristocrats\b/.test(q) && /\btokens\b/.test(q) && /\bgraveyard\b/.test(q) && (/\bcommander\b/.test(q) || /\bwhat commander fits me best\b/.test(q))) {
    return "For aristocrats, tokens, and graveyard recursion, the best commander fit is usually [[Teysa Karlov]] if you want clean death-trigger gameplay, [[Meren of Clan Nel Toth]] if recursion matters most, [[Chatterfang, Squirrel General]] if tokens are the main attraction, or [[Karador, Ghost Chieftain]] if you want a bigger graveyard toolbox. My top pick for all three themes together is [[Teysa Karlov]]: she rewards sacrifice, doubles death triggers, and plays naturally with token makers and recursion.";
  }

  if (/\bbrawl\b/.test(q)) {
    return "This is Brawl, not Commander: treat it as an Arena singleton format with a 60-card deck including the commander, so usually 59 non-commander cards. I’ll judge it on Brawl legality, curve, color identity, and Arena card pool rather than Commander’s 100-card assumptions.";
  }

  if (/\bhistoric\b|\barena\b|\bbo1\b|\bbest of one\b/.test(q)) {
    return "For Historic on Arena, I’ll judge it as an Arena format, not Commander. Too many 1-ofs can be fine for tutors/toolboxes, but most Historic decks want enough duplicate copies of key cards for consistency, especially in Best-of-One.";
  }

  if (/\bpauper edh\b|\bpedh\b/.test(q)) {
    return "For Pauper EDH, I’ll check rarity pressure first: the main deck should be commons, with the commander following the format’s commander rarity rules. Paste the list and I’ll flag non-common or suspicious rarity cards.";
  }

  if (/\bstandard\b/.test(q) && /\blegal|legality|rotation|older cards?\b/.test(q)) {
    return "For Standard, legality depends on the current rotation and the exact print/card pool. Older cards are often not legal even if they were Standard-legal before, so paste the list and I’ll flag legal versus not legal cards.";
  }

  if (/\bmodern\b/.test(q) && /\bcurve|mana curve|cmc\b/.test(q)) {
    return "For a Modern 60-card burn list, the curve should be very low: mostly 1-mana spells/threats, a smaller 2-mana band, and very few cards above 2 unless they directly close games. Paste the list and I’ll break down the curve properly.";
  }

  if (/\b100[- ]?card\b|\b100 card\b/.test(q) && /\bcommander|edh|helm|atraxa\b/.test(q)) {
    return "That sounds like a Commander deck: 100 cards total including the commander. If [[Atraxa]] is at the helm, paste the list and I’ll check the mana, proliferate/payoff density, interaction, card draw, and win conditions to identify what it’s missing.";
  }

  const format = String(input.format || "").toLowerCase();
  if (/\b(format|commander|modern|standard|pioneer|pauper|legacy|vintage)\b/.test(q) && /\blegal|curve|missing|wrong|cut|trim|too many\b/.test(q)) {
    const label = format || "that format";
    return `I can help with ${label}, but I need either a linked deck or pasted decklist to make a real call. Paste the list and I’ll check format rules, legality, curve, card counts, and the main fixes.`;
  }

  return null;
}

export function buildDirectDeckContextAnswer(input: {
  text: string;
  deckText?: string | null;
  commander?: string | null;
  format?: string | null;
}): string | null {
  if (looksLikePastedDecklist(input.text)) return null;

  const q = String(input.text || "").toLowerCase();
  const wantsHealth = /\b(health check|quick take|one sentence|how is this deck|rate this deck|deck look|analy[sz]e this|review this|check this)\b/.test(q);
  const wantsMissing = /\b(what.*(?:deck|list).*missing|missing|biggest issue|weakness|weaknesses)\b/.test(q);
  const wantsRoast = /\broast\b/.test(q);
  if (!wantsHealth && !wantsMissing && !wantsRoast) return null;

  const deckText = String(input.deckText || "").trim();
  if (!deckText) return null;

  const cards = parseDeckTextStats(deckText);
  const format = String(input.format || "").trim() || "deck";
  const commander = String(input.commander || "").trim();
  const subject = commander ? `[[${commander}]] ${format}` : format;
  const sizeNote = cards.total > 0 && cards.total < 95 ? ` it is still very short at ${cards.total} cards, so` : "";
  const landNote = cards.lands > 0 && cards.total >= 60 ? ` with about ${cards.lands} lands` : "";
  const coreNote = cards.nonlands > 0 ? ` and ${cards.nonlands} nonlands` : "";
  if (wantsMissing) {
    const sizeGap = format.toLowerCase().includes("commander") && cards.total < 100
      ? ` It is also ${100 - cards.total} cards short of a full Commander list.`
      : cards.total < 60 ? ` It is also short of a normal constructed maindeck size.` : "";
    return `Biggest issue: this ${subject} list needs a clearer complete shell.${sizeGap} Prioritize the mana base, early interaction, card draw, and a focused threat/win-condition package before fine-tuning individual upgrades.`;
  }
  if (wantsRoast) {
    return `Gentle roast: this ${subject} list has the bones of a plan, but right now it is more of a promising pile than a finished deck. The serious fix is adding enough lands, interaction, draw, and payoff cards to make the plan happen consistently.`;
  }
  return `Quick health check: this ${subject} list has a recognizable starting shell${landNote}${coreNote}, but${sizeNote} the next priority is tightening the mana, ramp/draw/removal balance, and adding focused win conditions before judging power level.`;
}

export async function runChatToolPlanner(input: {
  origin: string;
  cookieHeader?: string | null;
  authHeader?: string | null;
  text: string;
  deckText?: string | null;
  deckId?: string | null;
  format?: string | null;
  commander?: string | null;
  currency?: string | null;
  sourcePage?: string | null;
}): Promise<ChatToolResult[]> {
  const text = input.text || "";
  const lower = text.toLowerCase();
  const hasDeck = !!(input.deckText && input.deckText.trim()) || !!input.deckId;
  const currentMessageIsDecklist = looksLikePastedDecklist(text);
  const results: ChatToolResult[] = [];

  const extractedNames = currentMessageIsDecklist ? [] : extractMentionedCardNames(text);
  const wantsCardLookup = extractedNames.length > 0 || /\b(what does|explain|tell me about|oracle text|card details)\b/i.test(text);
  const wantsPrice = !currentMessageIsDecklist && /\b(price|worth|cost|market|trend|spike|crash|going up|going down)\b/i.test(text);
  const wantsLegality = !currentMessageIsDecklist && (/\b(legal|legality|banned|allowed|commander legal|modern legal|standard legal|pioneer legal|pauper legal)\b/i.test(text)
    || /\bcan\s+(?:this\s+)?(?:(?:commander|modern|pioneer|standard|pauper|legacy|vintage|brawl|historic)\s+)?(?:deck|list|it)?\s*(?:play|run|include|use)\b/i.test(text)
    || /\b(?:standard|modern|pioneer|pauper|legacy|vintage|brawl|historic)\b.{0,80}\b(?:have|include|run|play|use)\b/i.test(text));
  const wantsCostToFinish = hasDeck && /\b(cost to finish|finish cost|how much.*(finish|complete)|missing.*cost|need to buy|collection|owned)\b/i.test(text);
  const wantsBudgetSwaps = hasDeck && /\b(budget swap|cheaper|cheap alternative|replace expensive|under\s?(?:usd|gbp|eur|[$])?\s?\d+|save money|budget)\b/i.test(text);
  const wantsFinish = hasDeck && /\b(finish this deck|complete this deck|what should i add|fill the deck|missing cards|what.*(?:deck|list).*missing|upgrade this deck|improve this deck)\b/i.test(text);

  if (wantsCardLookup || wantsLegality) {
    const names = extractedNames.slice(0, 8);
    if (names.length > 0) {
      try {
        const { getDetailsForNamesCached } = await import("@/lib/server/scryfallCache");
        const details = await getDetailsForNamesCached(names);
        const cards = names.map((name) => {
          const key = normalizeScryfallCacheName(name);
          const row = details.get(key) || Array.from(details.values()).find((v: any) => normalizeScryfallCacheName(v?.name || "") === key);
          return row ? {
            name: row.name || row.card_name || name,
            type_line: row.type_line,
            mana_cost: row.mana_cost,
            color_identity: row.color_identity,
            legalities: row.legalities,
          } : { name, missing: true };
        });
        results.push({
          kind: wantsLegality ? "legality_check" : "card_lookup",
          ok: true,
          title: wantsLegality ? "Legality check" : "Card lookup",
          summary: `Resolved ${cards.filter((c: any) => !c.missing).length}/${names.length} mentioned cards from ManaTap card cache.`,
          data: { cards, format: input.format ?? null, commander: input.commander ?? null },
        });
      } catch (e: any) {
        results.push(toolError(wantsLegality ? "legality_check" : "card_lookup", "Card lookup", e));
      }
    }
  }

  if (wantsPrice && extractedNames.length > 0) {
    try {
      const names = extractedNames.slice(0, 12);
      const res = await fetch(`${trimOrigin(input.origin)}/api/price`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...forwardHeaders(input),
        },
        body: JSON.stringify({ names, currency: (input.currency || "USD").toUpperCase() }),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      results.push({
        kind: "price_lookup",
        ok: res.ok && json?.ok !== false,
        title: "Price lookup",
        summary: res.ok ? `Fetched current price data for ${names.length} card(s).` : `Price lookup failed with HTTP ${res.status}.`,
        data: compactToolData(json),
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (e: any) {
      results.push(toolError("price_lookup", "Price lookup", e));
    }
  }

  if (wantsCostToFinish) {
    results.push(await callJsonTool(input, "cost_to_finish", "Cost to Finish", "/api/collections/cost-to-finish", {
      deckId: input.deckId || undefined,
      deckText: input.deckText || undefined,
      format: input.format || undefined,
      currency: input.currency || "USD",
      useOwned: true,
    }));
  }

  if (wantsBudgetSwaps) {
    results.push(await callJsonTool(input, "budget_swaps", "Budget swaps", "/api/deck/swap-suggestions", {
      deckText: input.deckText || "",
      commander: input.commander || "",
      format: input.format || "Commander",
      currency: input.currency || "USD",
      sourcePage: input.sourcePage || "chat_tool_planner",
    }));
  }

  if (wantsFinish) {
    results.push(await callJsonTool(input, "finish_suggestions", "Finish suggestions", "/api/deck/finish-suggestions", {
      deckId: input.deckId || undefined,
      deckText: input.deckText || undefined,
      commander: input.commander || undefined,
      format: input.format || undefined,
      maxSuggestions: 8,
      budget: "balanced",
    }));
  }

  return results;
}

function extractMentionedCardNames(text: string): string[] {
  const names: string[] = [];
  const add = (value: string | undefined | null) => {
    const cleaned = String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[?.!,;:]+$/g, "")
      .replace(/^(?:the\s+)?(?:current\s+|market\s+)?price\s+of\s+/i, "")
      .replace(/^(?:the\s+)?(?:current\s+)?worth\s+of\s+/i, "")
      .replace(/^(?:the\s+)?card\s+/i, "")
      .trim();
    if (/^(?:it|this|that)(?:\s+legal)?$/i.test(cleaned)) return;
    if (cleaned.length >= 3 && cleaned.length <= 80 && !names.some((n) => n.toLowerCase() === cleaned.toLowerCase())) {
      names.push(cleaned);
    }
  };

  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/g)) add(match[1]);
  for (const match of text.matchAll(/"([^"]+)"/g)) add(match[1]);
  for (const match of text.matchAll(/\b(?:price of|worth of|is|explain|about|lookup|find|card)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:legal|worth|cost|in|for|please|pls)|[?.!,]|$)/gi)) add(match[1]);
  for (const match of text.matchAll(/\bcan\s+(?:this\s+)?(?:(?:commander|modern|pioneer|standard|pauper|legacy|vintage)\s+)?(?:deck|list|it)?\s*(?:play|run|include|use)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:to|in|for|please|pls)|[?.!,]|$)/gi)) add(match[1]);
  for (const match of text.matchAll(/\b(?:add|include|run|play)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:to|in|for|please|pls)|[?.!,]|$)/g)) add(match[1]);
  for (const match of text.matchAll(/\b(?:have|including|with)\s+([A-Z][A-Za-z0-9,'/ -]{2,80}?)(?:\s+(?:in|for|please|pls)|[?.!,]|$)/g)) add(match[1]);
  return names.slice(0, 12);
}

function parseDeckTextStats(deckText: string): { total: number; lands: number; nonlands: number } {
  const basicLands = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
  let total = 0;
  let lands = 0;
  for (const rawLine of String(deckText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^(commander|mainboard|sideboard|maybeboard)\b/i.test(line)) continue;
    const match = line.match(/^(\d+)\s+(.+)$/) || line.match(/^(.+?)\s+x?(\d+)$/i);
    let qty = 1;
    let name = line;
    if (match) {
      if (/^\d+$/.test(match[1] || "")) {
        qty = Number(match[1]);
        name = match[2] || "";
      } else {
        name = match[1] || "";
        qty = Number(match[2]);
      }
    }
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    const cleanedName = name.replace(/\s+\([^)]*\)\s*\d*$/g, "").trim().toLowerCase();
    total += qty;
    if (basicLands.has(cleanedName)) lands += qty;
  }
  return { total, lands, nonlands: Math.max(0, total - lands) };
}

function simpleRulesAnswer(text: string): string | null {
  const q = String(text || "").toLowerCase();
  if (/\btrample\b/.test(q) && /\bdeathtouch\b/.test(q)) {
    return "With trample plus deathtouch, you only need to assign 1 damage to each blocking creature because 1 deathtouch damage is lethal. Any remaining combat damage can be assigned to the defending player, planeswalker, or battle.";
  }
  if (/\bchatterfang\b/.test(q) && /\bdoubling season\b/.test(q) && /\btreasure\b/.test(q)) {
    return "With [[Chatterfang, Squirrel General]] and [[Doubling Season]], one Treasure token event is modified by both replacement effects. If you apply Doubling Season first, you create 2 Treasures, then Chatterfang adds 2 Squirrels, and Doubling Season doubles those Squirrels to 4. Result: 2 Treasure tokens and 4 Squirrel tokens.";
  }
  const rules: Array<[RegExp, string]> = [
    [/\bwhat\s+(?:is|does)\s+trample\b|\btrample\s+do\b/, "Trample lets an attacking creature assign excess combat damage beyond its blockers to the defending player, planeswalker, or battle after assigning lethal damage to each blocker."],
    [/\bwhat\s+(?:is|does)\s+deathtouch\b|\bdeathtouch\s+do\b/, "Deathtouch means any amount of damage this source deals to a creature is lethal damage."],
    [/\bwhat\s+(?:is|does)\s+ward\b|\bward\s+do\b/, "Ward is a triggered protection ability: when the permanent becomes the target of an opponent's spell or ability, that opponent must pay the ward cost or the spell or ability is countered."],
    [/\bwhat\s+(?:is|does)\s+lifelink\b|\blifelink\s+do\b/, "Lifelink means damage dealt by that source also causes its controller to gain that much life at the same time."],
    [/\bwhat\s+(?:is|does)\s+vigilance\b|\bvigilance\s+do\b/, "Vigilance means a creature does not tap when it attacks."],
    [/\bwhat\s+(?:is|does)\s+haste\b|\bhaste\s+do\b/, "Haste lets a creature attack and use tap or untap abilities as soon as it comes under your control."],
  ];
  for (const [re, answer] of rules) {
    if (re.test(q)) return answer;
  }
  return null;
}

function buildLegalityAnswer(text: string, data: unknown): string | null {
  const d = data as any;
  const cards = Array.isArray(d?.cards) ? d.cards : [];
  if (cards.length === 0) return null;
  const formats = mentionedLegalityFormats(text, d?.format);
  if (formats.length === 0) return null;

  const lines: string[] = [];
  for (const card of cards) {
    if (card?.missing) {
      if (/\b(this card|that card|it)\b/i.test(text) && /\bbanned\b/i.test(text)) {
        lines.push("Which card do you mean? Send the card name and format, e.g. \"why is [[Nadu, Winged Wisdom]] banned in Commander?\", and I will explain the ban reason plus legal alternatives.");
        continue;
      }
      lines.push(`I couldn't resolve ${card.name}.`);
      continue;
    }
    const legalities = card?.legalities || {};
    const statuses = formats.map(({ key, label }) => `${label}: ${displayLegalityStatus(legalities[key])}`);
    lines.push(`[[${card.name}]] - ${statuses.join("; ")}.`);
  }
  return lines.length ? lines.join("\n") : null;
}

function mentionedLegalityFormats(text: string, fallback?: string | null): Array<{ key: string; label: string }> {
  const q = String(text || "").toLowerCase();
  const known = [
    ["commander", "Commander"],
    ["modern", "Modern"],
    ["standard", "Standard"],
    ["pioneer", "Pioneer"],
    ["pauper", "Pauper"],
    ["legacy", "Legacy"],
    ["vintage", "Vintage"],
    ["brawl", "Brawl"],
    ["historic", "Historic"],
    ["oathbreaker", "Oathbreaker"],
  ] as const;
  const found = known.filter(([key]) => q.includes(key)).map(([key, label]) => ({ key, label }));
  if (found.length > 0) return found;
  const f = String(fallback || "").toLowerCase();
  const match = known.find(([key]) => f.includes(key));
  return match ? [{ key: match[0], label: match[1] }] : [];
}

function displayLegalityStatus(value: unknown): string {
  const s = String(value || "unknown").toLowerCase();
  if (s === "legal") return "legal";
  if (s === "not_legal") return "not legal";
  if (s === "banned") return "banned";
  if (s === "restricted") return "restricted";
  return "unknown";
}

function buildPriceAnswer(results: ChatToolResult[], data: unknown): string | null {
  const d = data as any;
  const prices = d?.prices && typeof d.prices === "object" ? d.prices as Record<string, unknown> : null;
  if (!prices) return null;
  const currency = String(d?.currency || "USD").toUpperCase();
  const lookup = results.find((r) => r.kind === "card_lookup" && r.ok && r.data)?.data as any;
  const cards = Array.isArray(lookup?.cards) ? lookup.cards : [];
  const displayByNorm = new Map<string, string>();
  for (const card of cards) {
    if (card?.name) displayByNorm.set(normalizeScryfallCacheName(card.name), card.name);
  }

  const lines: string[] = [];
  const missingNames: string[] = [];
  for (const [rawName, rawPrice] of Object.entries(prices).slice(0, 6)) {
    const amount = Number(rawPrice);
    const display = displayByNorm.get(normalizeScryfallCacheName(rawName)) || titleizePriceKey(rawName);
    if (!Number.isFinite(amount) || amount <= 0) {
      missingNames.push(display);
      continue;
    }
    lines.push(`[[${display}]] is about ${formatPrice(amount, currency)} from ManaTap's current Scryfall-backed price cache.`);
  }
  if (lines.length > 0) return lines.join("\n");
  if (missingNames.length > 0) {
    return `I couldn't find a current nonzero ${currency} price for ${missingNames.map((n) => `[[${n}]]`).join(", ")} in ManaTap's Scryfall-backed price cache.`;
  }
  return null;
}

function titleizePriceKey(value: string): string {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPrice(amount: number, currency: string): string {
  const symbol = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${symbol}${amount.toFixed(2)} ${currency}`;
}

async function callJsonTool(
  input: {
    origin: string;
    cookieHeader?: string | null;
    authHeader?: string | null;
  },
  kind: ChatToolKind,
  title: string,
  path: string,
  body: Record<string, unknown>,
): Promise<ChatToolResult> {
  try {
    const res = await fetch(`${trimOrigin(input.origin)}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...forwardHeaders(input),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return {
      kind,
      ok: res.ok && json?.ok !== false,
      title,
      summary: res.ok ? `${title} ran successfully.` : `${title} failed with HTTP ${res.status}.`,
      data: compactToolData(json),
      error: res.ok ? undefined : json?.error || `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return toolError(kind, title, e);
  }
}

function forwardHeaders(input: { cookieHeader?: string | null; authHeader?: string | null }): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.cookieHeader) headers.cookie = input.cookieHeader;
  if (input.authHeader) headers.Authorization = input.authHeader;
  return headers;
}

function trimOrigin(origin: string): string {
  return String(origin || "").replace(/\/+$/, "");
}

function toolError(kind: ChatToolKind, title: string, e: any): ChatToolResult {
  return {
    kind,
    ok: false,
    title,
    summary: `${title} could not run.`,
    error: e?.message || String(e || "unknown_error"),
  };
}

function compactToolData(data: unknown): unknown {
  if (data == null) return data;
  if (Array.isArray(data)) return data.slice(0, 8);
  if (typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).slice(0, 18)) {
    const value = obj[key];
    if (Array.isArray(value)) out[key] = value.slice(0, 10);
    else if (value && typeof value === "object") out[key] = trimObject(value as Record<string, unknown>);
    else out[key] = value;
  }
  return out;
}

function trimObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).slice(0, 12)) out[key] = obj[key];
  return out;
}

function safeJson(value: unknown, max: number): string {
  try {
    const s = JSON.stringify(value);
    return s.length > max ? `${s.slice(0, max)}...` : s;
  } catch {
    return String(value);
  }
}

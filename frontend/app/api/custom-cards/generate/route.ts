import { NextRequest, NextResponse } from 'next/server';

type StyleChip = 'Aggro' | 'Control' | 'Tribal' | 'Meme' | 'Commander' | 'Broken';
type ColorHint = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic';

const PREFIX = ['Dr.', 'Lord', 'Lady', 'Captain', 'Sir', 'Arch-', 'Grand', 'Shadow', 'Iron', 'Flame', 'Night', 'Star', 'Void', 'Storm', 'Bone', 'Blood', 'Rune', 'Sky', 'Stone', 'Wild'] as const;
const DESC = ['Dark', 'Arcane', 'Thorn', 'Ember', 'Frost', 'Gale', 'Grave', 'Tide', 'Dream', 'Hex', 'Mythic', 'Rift', 'Steel', 'Sunlit', 'Moonlit', 'Nether', 'Phantom', 'Wildwood', 'Clockwork', 'Astral'] as const;
const TITLE = ['Destroyer', 'Whisper', 'Weaver', 'Walker', 'Breaker', 'Herald', 'Keeper', 'Hunter', 'Singer', 'Architect', 'Devourer', 'Conductor', 'Seer', 'Warden', 'Harbinger', 'Alchemist', 'Marauder', 'Oracle', 'Revenant', 'Trickster'] as const;
const CREATURE_SUBTYPES = ['Goblin', 'Elf', 'Zombie', 'Wizard', 'Dragon', 'Angel', 'Vampire', 'Merfolk', 'Human', 'Spirit', 'Beast', 'Rogue', 'Knight', 'Druid', 'Construct'] as const;

const VALID_STYLES: readonly StyleChip[] = ['Aggro', 'Control', 'Tribal', 'Meme', 'Commander', 'Broken'] as const;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function normalizePrompt(p: unknown) {
  return String(p ?? '').trim().toLowerCase();
}

function inferSubtypeFromPrompt(prompt: string): string | null {
  const p = normalizePrompt(prompt);
  if (!p) return null;
  const keys = [...CREATURE_SUBTYPES].map((s) => s.toLowerCase());
  for (let i = 0; i < keys.length; i++) {
    if (p.includes(keys[i])) return CREATURE_SUBTYPES[i];
  }
  if (p.includes('goblin')) return 'Goblin';
  if (p.includes('dragon')) return 'Dragon';
  if (p.includes('wizard') || p.includes('mage')) return 'Wizard';
  if (p.includes('zombie') || p.includes('undead')) return 'Zombie';
  return null;
}

function inferColorFromStyle(style: StyleChip, prompt: string): ColorHint {
  const p = normalizePrompt(prompt);
  if (p.includes('fire') || p.includes('burn') || p.includes('rage') || p.includes('goblin')) return 'R';
  if (p.includes('nature') || p.includes('forest') || p.includes('growth') || p.includes('beast')) return 'G';
  if (p.includes('death') || p.includes('grave') || p.includes('undead') || p.includes('zombie')) return 'B';
  if (p.includes('order') || p.includes('angel') || p.includes('law')) return 'W';
  if (p.includes('mind') || p.includes('illusion') || p.includes('wizard') || p.includes('control')) return 'U';
  switch (style) {
    case 'Aggro':
      return pickOne(['R', 'G', 'B'] as const);
    case 'Control':
      return pickOne(['U', 'W', 'B'] as const);
    case 'Tribal':
      return pickOne(['G', 'R', 'B', 'U', 'W'] as const);
    case 'Commander':
      return pickOne(['W', 'U', 'B', 'R', 'G'] as const);
    case 'Broken':
      return pickOne(['U', 'B', 'R'] as const);
    case 'Meme':
    default:
      return pickOne(['W', 'U', 'B', 'R', 'G', 'C'] as const);
  }
}

function rebuildMana(cost: number, colorHint: ColorHint, coloredPipCount: number): string[] {
  const pips = colorHint === 'C' ? 0 : Math.max(0, Math.min(5, coloredPipCount));
  const generic = Math.max(0, cost - pips);
  const sym = colorHint !== 'C' ? colorHint : null;
  const out: string[] = [];
  if (generic > 0) out.push(String(generic));
  if (sym && pips > 0) {
    for (let i = 0; i < pips; i++) out.push(sym);
  }
  return out.length ? out : ['1'];
}

function buildPlayableRules(style: StyleChip, prompt: string, power01: number, subtype: string | null): string {
  const p = normalizePrompt(prompt);
  const broken = power01 >= 0.75 || style === 'Broken';
  const fair = power01 <= 0.35 && style !== 'Broken';
  const tokenName = subtype ?? pickOne(['Goblin', 'Zombie', 'Treasure', 'Clue', 'Food'] as const);

  const combat = [
    `Whenever this creature attacks, ${broken ? 'draw a card' : fair ? 'scry 1' : 'create a Treasure token'}.`,
    `Whenever this creature deals combat damage to a player, ${broken ? 'draw two cards' : fair ? 'create a Treasure token' : 'draw a card'}.`,
    `When this creature enters, ${fair ? 'gain 2 life' : `create a 1/1 ${tokenName} token`}.`,
  ] as const;

  const control = [
    broken ? 'Counter target spell.' : "Return target nonland permanent to its owner's hand.",
    `Draw ${broken ? '2' : '1'} card${broken ? 's' : ''}.`,
    `Tap up to ${broken ? 'two' : 'one'} target creature${broken ? 's' : ''}. It${broken ? "'s" : ' is'} tapped during its controller's next untap step.`,
  ] as const;

  const tribal = [
    `Other ${tokenName}s you control get +${broken ? '1/+1' : '1/+0'}.`,
    `Whenever another ${tokenName} enters under your control, ${broken ? 'draw a card' : 'put a +1/+1 counter on this creature'}.`,
  ] as const;

  const mana = [
    broken ? 'Add two mana in any combination of colors.' : 'Add one mana of any color.',
    broken ? 'Create two Treasure tokens.' : 'Create a Treasure token.',
  ] as const;

  const meme = [
    `When this enters, you may say "mana tap". If you do, ${broken ? 'draw two cards' : 'draw a card'}.`,
    `This creature has ${broken ? 'hexproof' : 'menace'} as long as you control an Artifact.`,
  ] as const;

  const lines: string[] = [];
  const wantsCreature = style !== 'Control' || p.includes('creature') || p.includes('legendary') || p.includes('commander');
  if (wantsCreature) {
    if (style === 'Aggro') lines.push(pickOne(combat));
    else if (style === 'Tribal') lines.push(pickOne(tribal));
    else if (style === 'Meme') lines.push(pickOne(meme));
    else if (style === 'Commander') lines.push(pickOne([...combat, ...mana] as const));
    else if (style === 'Broken') lines.push(pickOne([...combat, ...mana, ...tribal] as const));
    else lines.push(pickOne([...combat, ...control] as const));
  } else {
    lines.push(pickOne(control));
  }
  if (!fair && Math.random() < 0.55) {
    const extraPool = style === 'Control' ? control : style === 'Aggro' ? combat : [...mana, ...control];
    const extra = pickOne(extraPool as readonly string[]);
    if (!lines.includes(extra)) lines.push(extra);
  }
  return lines.join('\n');
}

function buildTypeLine(style: StyleChip, prompt: string, subtype: string | null): { typeLine: string; showPT: boolean } {
  const p = normalizePrompt(prompt);
  const wantsCreature = style !== 'Control' || p.includes('creature') || p.includes('commander') || p.includes('legendary');
  if (wantsCreature) {
    const base = style === 'Commander' ? 'Legendary Creature' : 'Creature';
    const sub = subtype ?? pickOne(CREATURE_SUBTYPES);
    return { typeLine: `${base} — ${sub}`, showPT: true };
  }
  const spell = style === 'Control' ? pickOne(['Instant', 'Sorcery'] as const) : pickOne(['Artifact', 'Enchantment', 'Sorcery', 'Instant'] as const);
  return { typeLine: spell, showPT: false };
}

function deriveStats(style: StyleChip, power01: number, showPT: boolean): { cost: number; pt: { p: number; t: number } } {
  const broken = power01 >= 0.75 || style === 'Broken';
  const fair = power01 <= 0.35 && style !== 'Broken';
  let cost = 3;
  if (style === 'Aggro') cost = fair ? 2 : broken ? 2 : 3;
  else if (style === 'Control') cost = fair ? 3 : broken ? 4 : 3;
  else if (style === 'Tribal') cost = 3;
  else if (style === 'Commander') cost = 4;
  else if (style === 'Meme') cost = fair ? 2 : broken ? 3 : 3;
  else if (style === 'Broken') cost = 2;
  cost = clamp(cost + (broken ? 0 : fair ? 0 : Math.random() < 0.35 ? 1 : 0), 1, 9);
  const baseP = style === 'Aggro' ? 3 : style === 'Commander' ? 4 : 2;
  const baseT = style === 'Aggro' ? 2 : style === 'Commander' ? 4 : 2;
  const bump = broken ? 2 : fair ? 0 : 1;
  const p = clamp(showPT ? baseP + bump + (Math.random() < 0.35 ? 1 : 0) : 0, 0, 9);
  const t = clamp(showPT ? baseT + bump + (Math.random() < 0.3 ? 1 : 0) : 0, 0, 9);
  return { cost, pt: { p: showPT ? p : 0, t: showPT ? t : 0 } };
}

function buildName(style: StyleChip, prompt: string): [string, string, string] {
  const p = normalizePrompt(prompt);
  const subtype = inferSubtypeFromPrompt(prompt);
  if (p && (p.includes('goblin') || p.includes('dragon') || p.includes('wizard') || p.includes('zombie'))) {
    const head = pickOne(PREFIX);
    const mid = subtype ?? pickOne(DESC);
    const tail = style === 'Meme' ? pickOne(['of Memes', 'the Unhinged', 'of Mana Tap'] as const) : pickOne(TITLE);
    return [head, mid, tail];
  }
  if (style === 'Commander') return [pickOne(['Lord', 'Lady', 'Captain', 'Grand'] as const), pickOne(DESC), pickOne(TITLE)];
  if (style === 'Control') return [pickOne(['Arch-', 'Void', 'Night', 'Storm'] as const), pickOne(DESC), pickOne(['Weaver', 'Oracle', 'Seer'] as const)];
  if (style === 'Aggro') return [pickOne(['Iron', 'Flame', 'Blood', 'Wild'] as const), pickOne(DESC), pickOne(['Breaker', 'Hunter', 'Marauder'] as const)];
  if (style === 'Tribal' && subtype) return [pickOne(PREFIX), subtype, pickOne(['Herald', 'Keeper', 'Warden'] as const)];
  if (style === 'Broken') return [pickOne(['Shadow', 'Grand', 'Arch-'] as const), pickOne(DESC), pickOne(['Architect', 'Destroyer', 'Devourer'] as const)];
  if (style === 'Meme') return [pickOne(['Dr.', 'Captain', 'Sir'] as const), pickOne(['Mana', 'Tap', 'Variance'] as const), pickOne(['Enjoyer', 'Gremlin', 'Trickster'] as const)];
  return [pickOne(PREFIX), pickOne(DESC), pickOne(TITLE)];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt ?? '').trim().slice(0, 240);
    const styleIn = String(body?.style ?? '');
    const style = (VALID_STYLES.includes(styleIn as StyleChip) ? styleIn : 'Commander') as StyleChip;
    const power = clamp(Number(body?.power ?? 0.4), 0, 1);

    const subtype = style === 'Tribal' ? inferSubtypeFromPrompt(prompt) ?? pickOne(CREATURE_SUBTYPES) : inferSubtypeFromPrompt(prompt);
    const { typeLine, showPT } = buildTypeLine(style, prompt, subtype);
    const colorHint = inferColorFromStyle(style, prompt);
    const { cost, pt } = deriveStats(style, power, showPT);
    const manaCost = rebuildMana(cost, colorHint, Math.random() < 0.35 ? 2 : 1);
    const rules = buildPlayableRules(style, prompt, power, subtype);
    const nameParts = buildName(style, prompt);

    const rarity: Rarity =
      style === 'Broken' || power >= 0.85
        ? 'mythic'
        : power >= 0.65
          ? 'rare'
          : power >= 0.35
            ? 'uncommon'
            : 'common';

    return NextResponse.json({
      ok: true,
      card: {
        nameParts,
        typeLine,
        subtext: rules,
        cost,
        manaCost,
        colorHint,
        rarity,
        pt: showPT ? pt : { p: 0, t: 0 },
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}


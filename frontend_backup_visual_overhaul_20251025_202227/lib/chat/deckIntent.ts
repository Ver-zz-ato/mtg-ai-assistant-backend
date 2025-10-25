// lib/chat/deckIntent.ts
// Lightweight intent extractor for deck-building prompts.
export type DeckIntent = {
  format?: 'commander'|'standard'|'modern'|'pioneer'|'pauper';
  colors?: Array<'W'|'U'|'B'|'R'|'G'>;
  budgetCurrency?: 'USD'|'GBP'|'EUR';
  budget?: number; // numeric cap
  plan?: 'budget'|'optimized'|'luxury';
  archetype?: string; // control, tokens, goblins, etc.
  mustInclude?: string[];
  avoid?: string[];
  power?: 'casual'|'75'|'cedh';
  title?: string;
};

const COLOR_WORDS: Record<string, Array<'W'|'U'|'B'|'R'|'G'>> = {
  white: ['W'], blue: ['U'], black: ['B'], red: ['R'], green:['G'],
  azorius: ['W','U'], dimir:['U','B'], rakdos:['B','R'], gruul:['R','G'], selesnya:['G','W'],
  orzhov:['W','B'], izzet:['U','R'], golgari:['B','G'], boros:['R','W'], simic:['G','U'],
  monoW:['W'], monoU:['U'], monoB:['B'], monoR:['R'], monoG:['G'],
  monow:['W'], monou:['U'], monob:['B'], monor:['R'], monog:['G'],
};

function norm(s:string){ return String(s||'').toLowerCase(); }

export function extractIntent(text: string): DeckIntent | null {
  const t = norm(text);
  const intent: DeckIntent = {};

  // format
  if (/\b(edh|commander)\b/.test(t)) intent.format = 'commander';
  else if (/\bstandard\b/.test(t)) intent.format = 'standard';
  else if (/\bmodern\b/.test(t)) intent.format = 'modern';
  else if (/\bpioneer\b/.test(t)) intent.format = 'pioneer';
  else if (/\bpauper\b/.test(t)) intent.format = 'pauper';

  // colors
  const cols = new Set<'W'|'U'|'B'|'R'|'G'>();
  // mono-<color>
  const mono = t.match(/\bmono[-\s]?(white|blue|black|red|green|w|u|b|r|g)\b/);
  if (mono){
    const w = mono[1];
    if (w==='w'||w==='white') cols.add('W');
    else if (w==='u'||w==='blue') cols.add('U');
    else if (w==='b'||w==='black') cols.add('B');
    else if (w==='r'||w==='red') cols.add('R');
    else if (w==='g'||w==='green') cols.add('G');
  }
  // guild or color words
  for (const key of Object.keys(COLOR_WORDS)){
    if (new RegExp(`\\b${key}\\b`).test(t)) COLOR_WORDS[key].forEach(c=>cols.add(c));
  }
  // explicit WUBRG letters in parentheses or slash
  const letter = t.match(/\b([wubrg]{1,5})\b/);
  if (letter){
    letter[1].split('').forEach(x=>{
      const up = x.toUpperCase(); if (['W','U','B','R','G'].includes(up)) cols.add(up as any);
    });
  }
  if (cols.size) intent.colors = Array.from(cols);

  // budget (currency and number)
  const mBudget = t.match(/(?:\$|£|€)\s?(\d+)|\b(\d+)\s?(?:usd|gbp|eur|dollars|pounds|euros)\b/i);
  if (mBudget){
    const v = Number(mBudget[1]||mBudget[2]||0); if (v>0) intent.budget = v;
    const cur = t.includes('$')||/usd|dollars/.test(t) ? 'USD' : (t.includes('£')||/gbp|pounds/.test(t) ? 'GBP' : (t.includes('€')||/eur|euros/.test(t) ? 'EUR' : undefined));
    if (cur) intent.budgetCurrency = cur as any;
    // plan heuristic
    if (v>0){ intent.plan = v<=75? 'budget' : (v<=250? 'optimized' : 'luxury'); }
  }

  // archetype/theme simple keywords
  const ARCHE = ['control','aggro','midrange','tokens','goblins','elves','artifacts','enchantments','spellslinger','lifegain','stax'];
  for (const a of ARCHE){ if (new RegExp(`\\b${a}\\b`).test(t)) { intent.archetype = a; break; } }

  // must include
  const inc = t.match(/\binclude\b([^.;\n]+)/i);
  if (inc){ intent.mustInclude = inc[1].split(/,|and/).map(s=>s.trim()).filter(Boolean).slice(0,10); }
  // avoid
  const av = t.match(/\bavoid\b([^.;\n]+)/i);
  if (av){ intent.avoid = av[1].split(/,|and/).map(s=>s.trim()).filter(Boolean).slice(0,10); }

  // power
  if (/\bcedh\b/.test(t)) intent.power = 'cedh';
  else if (/\b75%\b/.test(t)) intent.power = '75';
  else if (/\bcasual\b/.test(t)) intent.power = 'casual';

  // title suggestion
  const colorName = (intent.colors||[]).map(c=>({W:'White',U:'Blue',B:'Black',R:'Red',G:'Green'}[c])).join('/');
  const fmtName = intent.format ? intent.format.toUpperCase() : 'Deck';
  const theme = intent.archetype ? intent.archetype[0].toUpperCase()+intent.archetype.slice(1) : '';
  intent.title = [fmtName, colorName, theme].filter(Boolean).join(' ');

  // sanity: require at least a format or colors or archetype to consider it a deck intent
  if (!intent.format && !intent.colors && !intent.archetype && !intent.mustInclude?.length) return null;
  return intent;
}
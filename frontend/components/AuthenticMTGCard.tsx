"use client";
import React from "react";
import type { ProfileCardValue } from "./cardTypes";
import { ManaCost } from "./ManaSymbol";
import { containsProfanity } from "@/lib/profanity";

interface AuthenticMTGCardProps {
  value: ProfileCardValue;
  mode?: 'edit' | 'view';
  onChange?: (next: Partial<ProfileCardValue>) => void;
  artOptions?: any[];
  matte?: { primary?: string; secondary?: string };
  width?: string;
  onUserEditSubtext?: () => void;
}

export default function AuthenticMTGCard({ value, mode = 'view', onChange, artOptions = [], matte, width, onUserEditSubtext }: AuthenticMTGCardProps) {
  const [showArtOverlay, setShowArtOverlay] = React.useState(false);
  const [frameColors, setFrameColors] = React.useState({ primary: '#7e8fa6', secondary: '#3d4a5b', accent: '#9aa7ba' });
  // Neutral metal set used for title/type/PT bars so they remain consistent
  const NEUTRAL = React.useMemo(() => ({ primary: '#CAC5C0', secondary: '#948B82', accent: '#BDB5A8' }), []);
  const artImgRef = React.useRef<HTMLImageElement|null>(null);

  // Auto-fill random art on component mount
  React.useEffect(() => {
    if (!value.art?.url && artOptions.length > 0) {
      const randomArt = artOptions[Math.floor(Math.random() * artOptions.length)];
      onChange?.({ art: { url: randomArt.url, artist: randomArt.artist, id: randomArt.id } });
    }
  }, [artOptions.length, value.art?.url, onChange]);

  // Extract colors from art and update frame - triggers on art change
  const extractFromUrl = (url?: string | null) => {
    const fallbackByColor = (hint?: string | null) => {
      const map: Record<string,{primary:string;secondary:string;accent:string}> = {
        W:{primary:'#d9d4c7',secondary:'#9f9a8f',accent:'#efe9da'},
        U:{primary:'#6aa5d9',secondary:'#2f5583',accent:'#8bbce6'},
        B:{primary:'#7a7a80',secondary:'#2e2f36',accent:'#bdbdc5'},
        R:{primary:'#d9826a',secondary:'#7a3a2d',accent:'#e6a08b'},
        G:{primary:'#6ad98a',secondary:'#2f7a46',accent:'#8be6a5'},
        C:{primary:'#7e8fa6',secondary:'#3d4a5b',accent:'#9aa7ba'},
      };
      const k = (hint||'C').toUpperCase(); return map[k]||map.C;
    };
    if (!url) { setFrameColors(fallbackByColor(value.colorHint)); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { setFrameColors(fallbackByColor(value.colorHint)); return; }
        const S = 96;
        canvas.width = S; canvas.height = S;
        ctx.drawImage(img, 0, 0, S, S);
        const imageData = ctx.getImageData(0, 0, S, S);
        const data = imageData.data;
        const colorMap = new Map<string, number>();
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 150) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const key = `${Math.floor(r/12)*12},${Math.floor(g/12)*12},${Math.floor(b/12)*12}`;
            colorMap.set(key, (colorMap.get(key) || 0) + 1);
          }
        }
        const sortedColors = Array.from(colorMap.entries()).sort((a,b)=>b[1]-a[1]).slice(0,3);
        if (!sortedColors.length) { setFrameColors(fallbackByColor(value.colorHint)); return; }
        const [colorKey] = sortedColors[0];
        const [r,g,b] = colorKey.split(',').map(Number);
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        const brightness = (r + g + b) / 3;
        const isWarm = r > g && r > b; const isCool = b > r && b > g; const isGreen = g > r && g > b;
        let primary, secondary, accent;
        if (saturation < 25) {
          primary = `rgb(${Math.min(255, brightness + 50)}, ${Math.min(255, brightness + 45)}, ${Math.min(255, brightness + 40)})`;
          secondary = `rgb(${Math.max(0, brightness - 30)}, ${Math.max(0, brightness - 30)}, ${Math.max(0, brightness - 30)})`;
          accent = `rgb(${Math.min(255, brightness + 70)}, ${Math.min(255, brightness + 60)}, ${Math.min(255, brightness + 55)})`;
        } else if (isWarm) {
          primary = `rgb(${Math.min(255, r + 40)}, ${Math.min(255, Math.max(g, 90))}, ${Math.min(255, Math.max(b, 70))})`;
          secondary = `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 50)})`;
          accent = `rgb(${Math.min(255, r + 60)}, ${Math.min(255, g + 20)}, ${Math.min(255, b + 10)})`;
        } else if (isCool) {
          primary = `rgb(${Math.min(255, Math.max(r, 80))}, ${Math.min(255, Math.max(g, 100))}, ${Math.min(255, b + 50)})`;
          secondary = `rgb(${Math.max(0, r - 50)}, ${Math.max(0, g - 40)}, ${Math.max(0, b - 25)})`;
          accent = `rgb(${Math.min(255, r + 15)}, ${Math.min(255, g + 25)}, ${Math.min(255, b + 65)})`;
        } else if (isGreen) {
          primary = `rgb(${Math.min(255, Math.max(r, 80))}, ${Math.min(255, g + 40)}, ${Math.min(255, Math.max(b, 80))})`;
          secondary = `rgb(${Math.max(0, r - 50)}, ${Math.max(0, g - 25)}, ${Math.max(0, b - 50)})`;
          accent = `rgb(${Math.min(255, r + 15)}, ${Math.min(255, g + 65)}, ${Math.min(255, b + 15)})`;
        } else {
          primary = `rgb(${Math.min(255, r + 50)}, ${Math.min(255, g + 50)}, ${Math.min(255, b + 50)})`;
          secondary = `rgb(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)})`;
          accent = `rgb(${Math.min(255, r + 70)}, ${Math.min(255, g + 70)}, ${Math.min(255, b + 70)})`;
        }
        setFrameColors({ primary, secondary, accent });
      } catch {
        setFrameColors(fallbackByColor(value.colorHint));
      }
    };
    img.onerror = () => setFrameColors(fallbackByColor(value.colorHint));
    const cacheBust = url + (url.includes('?') ? '&' : '?') + 'mtg=' + Date.now();
    img.src = cacheBust;
  };

  React.useEffect(() => { extractFromUrl(value.art?.url); }, [value.art?.url]);

  // MTG card is 2.5" x 3.5" (63mm x 88mm) - aspect ratio of 5:7
  const cardStyle = {
    width: width || '300px',
    height: '420px', // 300 * (7/5) = 420px for proper MTG proportions
    backgroundColor: '#0a0a0a',
    borderRadius: '12px',
    border: '1px solid #2a2a2a',
    boxShadow: `
      0 8px 32px rgba(0,0,0,0.4),
      0 0 0 1px rgba(255,255,255,0.1),
      inset 0 1px 0 rgba(255,255,255,0.2)
    `,
    position: 'relative' as const,
    overflow: 'hidden' as const,
    // Add subtle card texture
    backgroundImage: `
      radial-gradient(circle at 25% 25%, rgba(255,255,255,0.02) 0%, transparent 50%),
      radial-gradient(circle at 75% 75%, rgba(255,255,255,0.02) 0%, transparent 50%)
    `
  };

  // Randomizer functions
  const randomizeTitle = () => {
    const prefixes = ["Dr.", "Lord", "Lady", "Captain", "Sir", "Arch-", "Grand", "Shadow", "Iron", "Flame", "Night", "Star", "Void", "Storm", "Bone", "Blood", "Rune", "Sky", "Stone", "Wild"];
    const descriptors = ["Dark", "Arcane", "Thorn", "Ember", "Frost", "Gale", "Grave", "Tide", "Dream", "Hex", "Mythic", "Rift", "Steel", "Sunlit", "Moonlit", "Nether", "Phantom", "Wildwood", "Clockwork", "Astral"];
    const titles = ["Destroyer", "Whisper", "Weaver", "Walker", "Breaker", "Herald", "Keeper", "Hunter", "Singer", "Architect", "Devourer", "Conductor", "Seer", "Warden", "Harbinger", "Alchemist", "Marauder", "Oracle", "Revenant", "Trickster"];
    
    const newName: [string, string, string] = [
      prefixes[Math.floor(Math.random() * prefixes.length)],
      descriptors[Math.floor(Math.random() * descriptors.length)],
      titles[Math.floor(Math.random() * titles.length)]
    ];
    onChange?.({ nameParts: newName });
  };

  const randomizeType = () => {
    const types = ["Creature", "Artifact", "Enchantment", "Sorcery", "Instant", "Planeswalker"];
    const subtypes = ["Troll", "Wizard", "Rogue", "Knight", "Angel", "Dragon", "Druid", "Elf", "Goblin", "Giant", "Spirit", "Zombie", "Merfolk", "Vampire", "Warrior", "Cleric", "Elemental", "Construct", "Beast", "Human"];
    
    const type = types[Math.floor(Math.random() * types.length)];
    const subtype = subtypes[Math.floor(Math.random() * subtypes.length)];
    onChange?.({ typeLine: `${type} — ${subtype}` });
  };

  const randomizeText = () => {
    // Color-aware, 2–3 line flavor generator
    const name = (value.nameParts||[]).filter(Boolean).join(' ').trim() || 'This mage';
    const c = String(value.colorHint||'C').toUpperCase();
    const linesMap: Record<string,string[]> = {
      W:[`${name} keeps tidy ledgers and tidy boards.`,`Order is their shield; patience, their sword.`],
      U:[`${name} plans three turns ahead—four if you’re counting.`,`Information is power; power prefers options.`],
      B:[`${name} signs in ink, amends in blood.`,`Ambition carves the path others fear to walk.`],
      R:[`${name} laughs at the line between now and later.`,`If it burns bright, it burns right.`],
      G:[`${name} knows the forest, and the forest remembers.`,`Growth is inevitable; victory, a season.`],
      C:[`${name} favors perfect symmetry.`,`A solution measured in balance.`]
    };
    const extras = [
      'Shuffles with a flourish; draws with a grin.',
      'Where a plan fails, instinct begins.',
      'The table is a map; every spell, a landmark.',
      'Variance is a story, not an excuse.'
    ];
    function pick<T>(arr: T[], n: number){ const out: T[]=[]; const used=new Set<number>(); while(out.length<n && used.size<arr.length){ const i=Math.floor(Math.random()*arr.length); if(!used.has(i)){ used.add(i); out.push(arr[i]); } } return out; }
    const base = linesMap[c] || linesMap.C;
    const want = 2 + (Math.random()<0.5?1:0);
    const chosen = [...pick(base,2), ...pick(extras,2)].slice(0,want);
    onChange?.({ subtext: chosen.join('\n') });
  };

  return (
    <div style={cardStyle} className="font-serif select-none">
      {/* Card Border Frame with authentic MTG gradients */}
      <div 
        className="absolute inset-0 rounded-xl"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at top, ${frameColors.primary} 0%, ${frameColors.secondary} 50%, ${frameColors.accent} 100%),
            linear-gradient(135deg, ${frameColors.primary} 0%, ${frameColors.secondary} 40%, ${frameColors.primary} 100%),
            radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
            radial-gradient(rgba(0,0,0,0.08) 1px, transparent 1px),
            repeating-linear-gradient(45deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px),
            repeating-linear-gradient(0deg, rgba(0,0,0,0.035) 0px, rgba(0,0,0,0.035) 1px, transparent 1px, transparent 3px)
          `,
          backgroundBlendMode: 'multiply, screen, overlay, overlay, overlay, overlay',
          backgroundSize: 'auto, auto, 3px 3px, 5px 5px, auto, auto',
          padding: '8px',
          boxShadow: `
            inset 0 0 18px rgba(255,255,255,0.28),
            inset 0 0 42px rgba(0,0,0,0.28),
            0 0 30px rgba(0,0,0,0.5)
          `
        }}
      >
        {/* Inner Card Area with subtle texture */}
        <div 
          className="w-full h-full rounded-lg relative overflow-hidden"
          style={{
            background: `
              radial-gradient(circle at 30% 30%, rgba(20,20,20,1) 0%, rgba(10,10,10,1) 70%),
              linear-gradient(135deg, rgba(15,15,15,1) 0%, rgba(5,5,5,1) 100%)
            `,
            backgroundBlendMode: 'multiply'
          }}
        >
          
          {/* Name Bar */}
          <div 
            className="absolute top-2 left-2 right-2 h-8 rounded-sm flex items-center px-3"
            style={{ 
              background: `
                linear-gradient(to bottom, 
                  ${NEUTRAL.primary} 0%, 
                  ${NEUTRAL.secondary} 50%, 
                  ${NEUTRAL.primary} 100%
                ),
                radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, transparent 70%)
              `,
              backgroundBlendMode: 'normal, overlay',
              border: `1px solid ${NEUTRAL.accent}`,
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.6),
                inset 0 -1px 0 rgba(0,0,0,0.3),
                0 2px 4px rgba(0,0,0,0.3)
              `
            }}
          >
            {mode === 'edit' ? (
              <input
                type="text"
                value={value.nameParts?.join(' ') || ''}
                onChange={(e) => {
                  const next = e.target.value;
                  // allow typing but do not block here; parent can disable actions
                  const parts = next.split(' ');
                  onChange?.({ nameParts: [parts[0] || '', parts[1] || '', parts[2] || ''] as [string,string,string] });
                }}
                className={`flex-1 bg-transparent text-black font-bold outline-none ${containsProfanity(value.nameParts?.join(' ')||'') ? 'ring-1 ring-red-500' : ''}`}
                style={{
                  fontSize: 'clamp(10px, 2.5vw, 14px)',
                  minWidth: 0 // Allow shrinking
                }}
                placeholder="Card Name"
              />
            ) : (
              <span 
                className="flex-1 text-black font-bold overflow-hidden"
                style={{
                  fontSize: 'clamp(10px, 2.5vw, 14px)',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  minWidth: 0 // Allow shrinking
                }}
              >
                {value.nameParts?.join(' ') || 'Card Name'}
              </span>
            )}
            
            {/* Dice randomizer for name */}
            {mode === 'edit' && (
              <button 
                onClick={randomizeTitle}
                className="w-6 h-6 md:w-4 md:h-4 min-w-[24px] min-h-[24px] p-1 md:p-0.5 text-xs text-black hover:text-gray-600 mr-2"
                title="Randomize name"
              >
                🎲
              </button>
            )}
            
            {/* Mana Cost */}
            <div className="flex items-center gap-1">
              {/* Always show clickable mana cost number for now */}
              <button
                onClick={() => {
                  if (mode === 'edit') {
                    const currentCost = value.cost || 1;
                    const newCost = currentCost >= 9 ? 1 : currentCost + 1;
                    onChange?.({ cost: newCost });
                  }
                }}
                className={`w-5 h-5 rounded-full bg-gray-500 text-white font-bold leading-none ${mode === 'edit' ? 'hover:bg-gray-600 cursor-pointer' : ''}`}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  fontSize: '11px',
                  lineHeight: '20px', // match w/h to ensure perfect vertical centering
                  padding: 0,
                  margin: 0
                }}
                title={mode === 'edit' ? 'Click to cycle cost 1-9' : undefined}
              >
                {value.cost || 1}
              </button>
              
              {/* Show clickable mana symbol next to it */}
              {value.colorHint && value.colorHint !== 'C' && (
                <button
                  onClick={() => {
                    if (mode === 'edit') {
                      const colors: Array<'W'|'U'|'B'|'R'|'G'> = ['W', 'U', 'B', 'R', 'G'];
                      const currentIndex = colors.indexOf(value.colorHint as any);
                      const nextColor = colors[(currentIndex + 1) % colors.length];
                      onChange?.({ colorHint: nextColor });
                    }
                  }}
                className={`${mode === 'edit' ? 'hover:scale-110 cursor-pointer' : ''}`}
                  title={mode === 'edit' ? 'Click to cycle mana color' : undefined}
                  style={{ width: '22px', height: '22px' }}
                >
                  <img 
                    src={`/mana/${value.colorHint.toLowerCase()}.svg`}
                    alt={value.colorHint}
                    className="w-full h-full"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                </button>
              )}
            </div>
          </div>

          {/* Art Area with MTG-style border */}
          <div 
            className="absolute top-12 left-2 right-2 rounded-sm overflow-hidden cursor-pointer relative group"
            style={{ 
              height: '180px',
              border: '2px solid rgba(0,0,0,0.8)',
              boxShadow: `
                inset 0 0 10px rgba(0,0,0,0.5),
                0 2px 4px rgba(0,0,0,0.3)
              `
            }}
            onClick={() => mode === 'edit' && setShowArtOverlay(true)}
          >
            {value.art?.url ? (
              <>
                <img 
                  ref={artImgRef}
                  src={value.art.url} 
                  alt="Card art" 
                  className="w-full h-full object-cover"
                  onLoad={()=> extractFromUrl(value.art?.url)}
                />
                {/* Subtle hover overlay hint (edit mode only) */}
                {mode === 'edit' && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="text-white text-center">
                      <div className="text-2xl mb-1">🎨</div>
                      <div className="text-sm font-semibold">Change Art</div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-400 text-sm">
                Click to add art
              </div>
            )}
            
            {/* Art Credit spanning bottom width with contrasting text */}
            {value.art?.artist && (
              <div 
                className="absolute left-0 right-0 px-2 py-1 text-center"
                style={{ 
                  bottom: '28px', // sit above type bar (avoids overlap)
                  fontSize: '7px', 
                  lineHeight: '9px',
                  background: 'linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.5), rgba(0,0,0,0.7))',
                  color: 'white',
                  textShadow: '1px 1px 2px rgba(0,0,0,0.8)'
                }}
              >
                <div className="flex justify-between items-center" style={{ fontSize: '7px' }}>
                  <span>Illus. {value.art.artist}</span>
                  <span className="flex gap-1">
                    {value.art.id && (
                      <a 
                        href={value.art.id} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-300 hover:text-blue-200 underline"
                      >
                        Scryfall
                      </a>
                    )}
                    <span className="text-gray-300">Fan-made • Not WotC</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Type Line */}
          <div 
            className="absolute left-2 right-2 h-6 rounded-sm flex items-center px-3"
            style={{ 
              top: '200px',
              background: `
                linear-gradient(to bottom, 
                  ${NEUTRAL.primary} 0%, 
                  ${NEUTRAL.secondary} 50%, 
                  ${NEUTRAL.primary} 100%
                ),
                radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, transparent 70%)
              `,
              backgroundBlendMode: 'normal, overlay',
              border: `1px solid ${NEUTRAL.accent}`,
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.6),
                inset 0 -1px 0 rgba(0,0,0,0.3),
                0 2px 4px rgba(0,0,0,0.3)
              `
            }}
          >
            {mode === 'edit' ? (
              <input
                type="text"
                value={value.typeLine || ''}
                onChange={(e) => onChange?.({ typeLine: e.target.value })}
                className={`flex-1 bg-transparent text-black font-medium text-xs outline-none ${containsProfanity(value.typeLine||'') ? 'ring-1 ring-red-500' : ''}`}
                placeholder="Type Line"
                aria-invalid={containsProfanity(value.typeLine||'')}
              />
            ) : (
              <span className="flex-1 text-black font-medium text-xs">
                {value.typeLine || 'Type Line'}
              </span>
            )}
            
            {/* Dice randomizer for type */}
            {mode === 'edit' && (
              <button 
                onClick={randomizeType}
                className="w-6 h-6 md:w-4 md:h-4 min-w-[24px] min-h-[24px] p-1 md:p-0.5 text-xs text-black hover:text-gray-600 mr-2"
                title="Randomize type"
              >
                🎲
              </button>
            )}
            
            {/* Set Symbol & Rarity - Clickable */}
            <button
              onClick={() => {
                if (mode === 'edit') {
                  const rarities: Array<'common'|'uncommon'|'rare'|'mythic'> = ['common', 'uncommon', 'rare', 'mythic'];
                  const currentIndex = rarities.indexOf(value.rarity || 'common');
                  const nextRarity = rarities[(currentIndex + 1) % rarities.length];
                  onChange?.({ rarity: nextRarity, setSymbol: value.setSymbol || 'CCC' });
                }
              }}
              className={`w-6 h-6 md:w-4 md:h-4 min-w-[24px] min-h-[24px] p-1 md:p-0.5 rounded-full flex items-center justify-center text-xs font-bold ${mode === 'edit' ? 'cursor-pointer hover:scale-110' : ''} ${
                value.rarity === 'mythic' ? 'bg-orange-500 text-white' :
                value.rarity === 'rare' ? 'bg-yellow-500 text-black' :
                value.rarity === 'uncommon' ? 'bg-gray-400 text-black' :
                'bg-black text-white'
              }`}
              title={mode === 'edit' ? 'Click to cycle rarity' : `${value.rarity} rarity`}
            >
              {value.setSymbol?.[0] || 'S'}
            </button>
          </div>

          {/* Text Box with subtle parchment texture */}
          <div 
            className="absolute left-2 right-2 rounded-sm p-2"
            style={{ 
              top: '235px',
              bottom: '12px', // extend to near bottom of frame
              backgroundColor: '#f5efe2',
              backgroundImage: `
                radial-gradient(circle at 20% 30%, rgba(120,100,60,0.08) 0%, rgba(120,100,60,0.04) 22%, transparent 45%),
                radial-gradient(circle at 80% 70%, rgba(120,100,60,0.06) 0%, rgba(120,100,60,0.03) 20%, transparent 45%),
                repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0px, rgba(0,0,0,0.02) 2px, transparent 2px, transparent 4px),
                repeating-linear-gradient(90deg, rgba(0,0,0,0.015) 0px, rgba(0,0,0,0.015) 2px, transparent 2px, transparent 5px)
              `,
              border: '1px solid #D8CBB8',
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.75),
                inset 0 -1px 0 rgba(0,0,0,0.08)
              `,
              paddingRight: '56px', // reserve space for P/T box so text won't overlap
              zIndex: 10
            }}
          >
            {/* Dice randomizer for text */}
            {mode === 'edit' && (
              <button 
                onClick={randomizeText}
                className="absolute top-1 right-1 w-6 h-6 md:w-4 md:h-4 min-w-[24px] min-h-[24px] p-1 md:p-0.5 text-xs text-gray-600 hover:text-gray-800 z-10"
                title="Randomize text"
              >
                🎲
              </button>
            )}
            
            {mode === 'edit' ? (
              <textarea
                value={value.subtext || ''}
                onChange={(e) => { onChange?.({ subtext: e.target.value }); onUserEditSubtext?.(); }}
                className={`w-full h-full bg-transparent text-black text-xs leading-relaxed resize-none outline-none ${containsProfanity(value.subtext||'') ? 'ring-1 ring-red-500' : ''}`}
                aria-invalid={containsProfanity(value.subtext||'')}
                style={{
                  fontFamily: 'serif',
                  textShadow: '0 1px 1px rgba(255,255,255,0.8)',
                  paddingRight: '8px'
                }}
                placeholder="Enter card text..."
              />
            ) : (
              <div 
                className="text-black text-xs leading-relaxed h-full overflow-y-auto"
                style={{
                  fontFamily: 'serif',
                  textShadow: '0 1px 1px rgba(255,255,255,0.8)',
                  paddingRight: '8px'
                }}
              >
                {value.subtext ? (
                  value.subtext.split('\n').map((line, i) => (
                    <div key={i} className={line.startsWith('"') ? 'italic text-gray-700' : ''}>
                      {line || '\u00A0'}
                    </div>
                  ))
                ) : (
                  <span className="text-gray-500">Card text</span>
                )}
              </div>
            )}
          </div>

          {/* P/T or Loyalty box (shows for Creature or Planeswalker) */}
          {(/(Creature|Planeswalker)/i.test(value.typeLine || '')) && (
            <div 
              className="absolute bottom-2 right-2 w-12 h-8 rounded-sm flex items-center justify-center font-bold text-sm"
              style={{ 
                background: `
                  linear-gradient(to bottom, 
                    ${NEUTRAL.primary} 0%, 
                    ${NEUTRAL.secondary} 50%, 
                    ${NEUTRAL.primary} 100%
                  ),
                  radial-gradient(ellipse at center, rgba(255,255,255,0.4) 0%, transparent 70%)
                `,
                backgroundBlendMode: 'normal, overlay',
                border: `2px solid ${NEUTRAL.accent}`,
                boxShadow: `
                  inset 0 1px 0 rgba(255,255,255,0.6),
                  inset 0 -1px 0 rgba(0,0,0,0.3),
                  0 2px 4px rgba(0,0,0,0.3)
                `,
                zIndex: 20 // above text box
              }}
            >
              <div className="flex items-center gap-0.5 text-black">
                <button
                  onClick={() => {
                    if (mode === 'edit') {
                      const currentPower = value.pt?.p || 1;
                      const newPower = currentPower >= 9 ? 1 : currentPower + 1;
                      onChange?.({ pt: { ...value.pt, p: newPower, t: value.pt?.t || 1 } });
                    }
                  }}
                  className={`${mode === 'edit' ? 'hover:text-gray-600 cursor-pointer' : ''}`}
                  title={mode === 'edit' ? 'Click to cycle power 1-9' : undefined}
                >
                  {value.pt?.p || 1}
                </button>
                <span>/</span>
                <button
                  onClick={() => {
                    if (mode === 'edit') {
                      const currentToughness = value.pt?.t || 1;
                      const newToughness = currentToughness >= 9 ? 1 : currentToughness + 1;
                      onChange?.({ pt: { ...value.pt, p: value.pt?.p || 1, t: newToughness } });
                    }
                  }}
                  className={`${mode === 'edit' ? 'hover:text-gray-600 cursor-pointer' : ''}`}
                  title={mode === 'edit' ? 'Click to cycle toughness 1-9' : undefined}
                >
                  {value.pt?.t || 1}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Art Selection Overlay with Virtual Scrolling */}
      {mode === 'edit' && showArtOverlay && (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 rounded-xl">
          <div className="bg-white p-4 rounded-lg max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-semibold text-black">Select Artwork</h3>
                <p className="text-xs text-gray-500">{artOptions.length} images available</p>
              </div>
              <button 
                onClick={() => setShowArtOverlay(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ✕
              </button>
            </div>
            <div 
              className="grid grid-cols-3 gap-2 overflow-y-auto pr-2"
              style={{ 
                maxHeight: 'calc(80vh - 120px)',
                paddingBottom: '36px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#9ca3af #e5e7eb'
              }}
            >
              {artOptions.map((art, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onChange?.({ art: { url: art.url, artist: art.artist, id: art.id } });
                    setShowArtOverlay(false);
                  }}
                  className="aspect-square rounded overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all"
                  title={art.name}
                >
                  <img 
                    src={art.url} 
                    alt={art.name} 
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

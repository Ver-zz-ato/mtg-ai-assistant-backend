"use client";
import React from "react";
import { containsProfanity } from "@/lib/profanity";

// Preset name blocks
const PREFIX = ["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame","Night","Star","Void","Storm","Bone","Blood","Rune","Sky","Stone","Wild"];
const DESC = ["Dark","Arcane","Thorn","Ember","Frost","Gale","Grave","Tide","Dream","Hex","Mythic","Rift","Steel","Sunlit","Moonlit","Nether","Phantom","Wildwood","Clockwork","Astral"];
const TITLE = ["Destroyer","Whisper","Weaver","Walker","Breaker","Herald","Keeper","Hunter","Singer","Architect","Devourer","Conductor","Seer","Warden","Harbinger","Alchemist","Marauder","Oracle","Revenant","Trickster"];

// Curated art pack names grouped by color identity tag
const CURATED: { label: string; color: string; names: string[] }[] = [
  { label: 'White', color:'W', names: ['Sun Titan','Elspeth, Suns Champion','Path to Exile','Swords to Plowshares','Angel of Serenity','The Wandering Emperor','Brave the Elements','Serra Angel','March of Otherworldly Light','Emeria\'s Call'] },
  { label: 'Blue', color:'U', names: ['Counterspell','Ponder','Jace Beleren','Rhystic Study','Mystic Remora','Talrand, Sky Summoner','Archmage\'s Charm','Thassa, God of the Sea','Fact or Fiction','Cryptic Command'] },
  { label: 'Black', color:'B', names: ['Thoughtseize','Sheoldred, the Apocalypse','Liliana of the Veil','Demonic Tutor','Necromancy','Grave Titan','Phyrexian Arena','Vindicate','Reanimate','Damnation'] },
  { label: 'Red',  color:'R', names: ['Lightning Bolt','Ragavan, Nimble Pilferer','Krenko, Mob Boss','Chandra, Torch of Defiance','Chaos Warp','Fury','Torbran, Thane of Red Fell','Chain Lightning','Skullcrack','Seething Song'] },
  { label: 'Green', color:'G', names: ['Llanowar Elves','Craterhoof Behemoth','Nissa, Who Shakes the World','Eternal Witness','Cultivate','Avenger of Zendikar','Beast Whisperer','Rishkar, Peema Renegade','The Great Henge','Finale of Devastation'] },
  { label: 'Colorless', color:'C', names: ['Sol Ring','Mana Vault','Sensei\'s Divining Top','Ugin, the Spirit Dragon','Wurmcoil Engine'] },
  { label: 'Lands', color:'L', names: ['Plains','Island','Swamp','Mountain','Forest','Theros Plains','Theros Island','Theros Swamp','Theros Mountain','Theros Forest'] },
];

function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }

export default function CustomCardCreator(){
  const [pi,setPi] = React.useState(0);
  const [di,setDi] = React.useState(0);
  const [ti,setTi] = React.useState(0);
  const [toast,setToast]=React.useState<string|null>(null);
  const [artOptions, setArtOptions] = React.useState<any[]>([]);
  const [userEditedSub, setUserEditedSub] = React.useState(false);

  // Single value object powering the editor
  const [value, setValue] = React.useState({
    nameParts: [PREFIX[0], DESC[0], TITLE[0]] as [string,string,string],
    subtext: 'Feeds on treasure and overconfidence.',
    typeLine: 'Creature — Wizard',
    pt: { p: 1, t: 1 },
    cost: 3, // legacy support
    manaCost: ['2', 'U'] as string[],
    colorHint: 'U' as ('W'|'U'|'B'|'R'|'G'),
    rarity: 'uncommon' as ('common'|'uncommon'|'rare'|'mythic'),
    setSymbol: 'CCC',
    art: { url: '', artist: '', id: '' },
  });

  React.useEffect(()=>{ const id=setTimeout(()=>setToast(null),3500); return ()=>clearTimeout(id); },[toast]);

  const name = `${value.nameParts[0]} ${value.nameParts[1]} ${value.nameParts[2]}`;

  function setCmc(updater: (n:number)=>number){ setValue(v=>({ ...v, cost: updater(v.cost||0) })); }
  const color = value.colorHint;

  // Helpers for randomize
  const TYPES=['Creature','Artifact','Enchantment','Sorcery','Instant','Planeswalker'];
  const SUBTYPES=['Troll','Wizard','Rogue','Knight','Angel','Dragon','Druid','Elf','Goblin','Giant','Spirit','Zombie','Merfolk','Vampire','Warrior','Cleric','Elemental','Construct','Beast','Human'];
  function typeLine(){ return value.typeLine; }

  function randomizeAll(){
    // Randomize all aspects of the card, including mana icon
    const prefixes = ["Dr.", "Lord", "Lady", "Captain", "Sir", "Arch-", "Grand", "Shadow", "Iron", "Flame", "Night", "Star", "Void", "Storm", "Bone", "Blood", "Rune", "Sky", "Stone", "Wild"];
    const descriptors = ["Dark", "Arcane", "Thorn", "Ember", "Frost", "Gale", "Grave", "Tide", "Dream", "Hex", "Mythic", "Rift", "Steel", "Sunlit", "Moonlit", "Nether", "Phantom", "Wildwood", "Clockwork", "Astral"];
    const titles = ["Destroyer", "Whisper", "Weaver", "Walker", "Breaker", "Herald", "Keeper", "Hunter", "Singer", "Architect", "Devourer", "Conductor", "Seer", "Warden", "Harbinger", "Alchemist", "Marauder", "Oracle", "Revenant", "Trickster"];
    
    const types = ["Creature", "Artifact", "Enchantment", "Sorcery", "Instant", "Planeswalker"];
    const subtypes = ["Troll", "Wizard", "Rogue", "Knight", "Angel", "Dragon", "Druid", "Elf", "Goblin", "Giant", "Spirit", "Zombie", "Merfolk", "Vampire", "Warrior", "Cleric", "Elemental", "Construct", "Beast", "Human"];
    
    const abilities = ["Flying", "Trample", "Haste", "Vigilance", "Lifelink", "First strike", "Deathtouch", "Hexproof", "Flash", "Defender"];
    const flavorTexts = [
      '"Feeds on treasure and overconfidence."',
      '"Prefers symmetry—if you can survive it."',
      '"Writes contracts in blood and tiny print."',
      '"Dreams in turn-three and two-land keeps."',
      '"Always has the second spell."',
      '"The spark that ignites possibility."',
      '"Where magic meets ambition."'
    ];
    
    const rarities: Array<'common'|'uncommon'|'rare'|'mythic'> = ['common', 'uncommon', 'rare', 'mythic'];
    
    // Generate random values
    const newName: [string, string, string] = [
      prefixes[Math.floor(Math.random() * prefixes.length)],
      descriptors[Math.floor(Math.random() * descriptors.length)],
      titles[Math.floor(Math.random() * titles.length)]
    ];
    
    const newType = types[Math.floor(Math.random() * types.length)];
    const newSubtype = subtypes[Math.floor(Math.random() * subtypes.length)];
    const newTypeLine = `${newType} — ${newSubtype}`;
    
    const ability = abilities[Math.floor(Math.random() * abilities.length)];
    const flavor = flavorTexts[Math.floor(Math.random() * flavorTexts.length)];
    const newText = Math.random() > 0.5 ? `${ability}\n${flavor}` : ability;
    
    const newRarity = rarities[Math.floor(Math.random() * rarities.length)];
    const newCost = Math.floor(Math.random() * 9) + 1;
    const newPower = Math.floor(Math.random() * 9) + 1;
    const newToughness = Math.floor(Math.random() * 9) + 1;

    // Random color + mana pips
    const COLORS: Array<'W'|'U'|'B'|'R'|'G'> = ['W','U','B','R','G'];
    const colorHint = COLORS[Math.floor(Math.random()*COLORS.length)];
    const coloredPips = Math.random()<0.5 ? 1 : (Math.random()<0.3 ? 2 : 1);
    const generic = Math.max(0, newCost - coloredPips);
    const manaCost = [generic>0?String(generic):null, ...Array.from({length: coloredPips}, ()=>colorHint)].filter(Boolean) as string[];
    
    // Pick random art if available
    let newArt = value.art;
    if (artOptions.length > 0) {
      const randomArt = artOptions[Math.floor(Math.random() * artOptions.length)];
      newArt = { url: randomArt.url, artist: randomArt.artist, id: randomArt.id };
    }
    
    setValue({
      nameParts: newName,
      typeLine: newTypeLine,
      subtext: newText,
      pt: { p: newPower, t: newToughness },
      cost: newCost,
      manaCost,
      colorHint,
      rarity: newRarity,
      setSymbol: value.setSymbol || 'CCC',
      art: newArt,
    });
  }

  function rerollSub(){
    const c = String(value.colorHint||'C').toUpperCase();
    const name = (value.nameParts||[]).filter(Boolean).join(' ').trim()||'This mage';
    const type = String(value.typeLine||'');
    const subtype = (type.split('—')[1]||'').trim().split(/\s|\//).filter(Boolean)[0] || '';
    const rare = String(value.rarity||'common');
    const hooks: Record<string,string[]> = {
      W:[
        `${name} keeps tidy ledgers and tidy boards.`,
        `Order is their shield; patience, their sword.`,
        `A clean line and a cleaner conscience.`,
        `Every oath is a rule learned the hard way.`,
        `They stack their answers, then their victories.`,
      ],
      U:[
        `${name} plans three turns ahead—four if you’re counting.`,
        `Information is power; power prefers options.`,
        `A good answer starts with the right question.`,
        `They don’t draw luck—only outs.`,
        `When the tide turns, they’ve already charted it.`,
        `Knowledge is tempo; tempo becomes inevitability.`,
        `Hands are secrets; libraries are confessions.`,
        `The best trick is letting you think you kept yours.`,
        `Counter the spell? No. Counter the plan.`,
        `Ideas, like islands, are stronger with a lighthouse.`,
      ],
      B:[
        `${name} signs in ink, amends in blood.`,
        `Ambition carves the path others fear to walk.`,
        `Graves are full of bad deals and better lessons.`,
        `Power compounds—interest is always due.`,
        `What you lose today returns as leverage tomorrow.`,
      ],
      R:[
        `${name} laughs at the line between now and later.`,
        `If it burns bright, it burns right.`,
        `Chaos is just momentum with a grin.`,
        `Tap, draw, blaze a trail.`,
        `They trust the spark because it never asks for permission.`,
      ],
      G:[
        `${name} knows the forest, and the forest remembers.`,
        `Growth is inevitable; victory, a season.`,
        `Roots first, blossom later.`,
        `Let the canopy decide what light remains.`,
        `Predators don’t lecture. They arrive.`,
      ],
      C:[
        `${name} favors perfect symmetry.`,
        `A solution measured in balance.`,
        `Even odds, even answers.`,
        `When choices cancel, only clarity remains.`,
      ]
    };
    const plug = [
      subtype ? `Whispers follow every ${subtype} that remembers their name.` : '',
      type.match(/Creature/i) ? `Strength isn’t counted—it's grown.` : '',
      type.match(/Planeswalker/i) ? `Every oath costs a spark.` : '',
      rare==='mythic' ? `Legends prefer whispers to headlines.` : '',
      rare==='rare' ? `Treasures don’t need maps, only patience.` : ''
    ].filter(Boolean);
    const extras = [
      'Shuffles with a flourish; draws with a grin.',
      'Where a plan fails, instinct begins.',
      'The table is a map; every spell, a landmark.',
      'Variance is a story, not an excuse.',
      'Greatness, at the price of timing.',
      'Secrets are best kept in the library.',
      'Storms pass; momentum doesn’t.',
      'Win with inches, lose with lessons.',
      'A mulligan is a promise you intend to keep.',
      'Let the stack tell the story.',
      'When the board is cluttered, make space for inevitability.',
      'Game one writes notes for game three.',
    ];
    function pick<T>(arr:T[], n:number){ const out:T[]=[]; const used=new Set<number>(); while(out.length<n && used.size<arr.length){ const i=Math.floor(Math.random()*arr.length); if(!used.has(i)){ used.add(i); out.push(arr[i]); } } return out; }
    const base = hooks[c] || hooks.C;
    const want = 2 + (Math.random()<0.5?1:0);
    const chosen = [...pick(base,2), ...pick(extras,2), ...pick(plug,1)].filter(Boolean).slice(0,want);
    setValue(v=>({ ...v, subtext: chosen.join('\n') }));
  }

  React.useEffect(()=>{ rerollSub(); },[value.colorHint]);

  // Auto-generate flavor when name or art changes unless user edited
  React.useEffect(()=>{
    if (userEditedSub) return;
    rerollSub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.art?.url, (value.nameParts||[]).join(' ')]);

  // Load curated art pack
  React.useEffect(() => {
    (async () => {
      try {
        const names: string[] = CURATED.flatMap(g => g.names);
        const identifiers = Array.from(new Set(names)).map(n => ({ name: n }));
        const r = await fetch('https://api.scryfall.com/cards/collection', { 
          method: 'POST', 
          headers: { 'content-type': 'application/json' }, 
          body: JSON.stringify({ identifiers }) 
        });
        const j: any = await r.json().catch(() => ({}));
        const data: any[] = Array.isArray(j?.data) ? j.data : [];
        const mapColor = (raw: any): string => { 
          const ci = Array.isArray(raw?.color_identity) ? raw.color_identity : []; 
          if (!ci.length) return 'C'; 
          if (ci.length > 1) return ci[0]; 
          return ci[0]; 
        };
        const out: any[] = data.map(c => { 
          const img = c?.image_uris || c?.card_faces?.[0]?.image_uris || {}; 
          return { 
            name: c?.name || '', 
            url: img.art_crop || img.normal || img.small || '', 
            artist: c?.artist || '', 
            id: c?.scryfall_uri || c?.uri || '', 
            color: mapColor(c) 
          }; 
        }).filter((x: any) => x.url);
        setArtOptions(out);
      } catch (e) {
        console.error('Failed to load art options:', e);
      }
    })();
  }, []);

  async function attach(){
    const cleanName = name.trim(); const cleanSub = value.subtext.trim();
    if (containsProfanity(cleanName) || containsProfanity(cleanSub)) { setToast('Please avoid profanity.'); return; }
    try{
      const body = { 
        name: cleanName, 
        sub: cleanSub, 
        art: value.art?.url||'', 
        artist: value.art?.artist||'', 
        scryfall: value.art?.id||'', 
        color: value.colorHint||'',
        rarity: value.rarity||'common',
        setSymbol: value.setSymbol||'CCC'
      };
      // 1) Attach to profile (auth metadata + public snapshot)
      const r = await fetch('/api/profile/custom-card', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Attach failed');
      // 2) Save to wallet (non-public) so it shows in Custom Card Wallet
      try {
        const save = await fetch('/api/custom-cards/save', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title: cleanName, value }) });
        const sj = await save.json().catch(()=>({}));
        if (!save.ok || sj?.ok===false) {
          // Quietly ignore quota/auth errors since the profile attach already succeeded
        }
      } catch {}
      setToast('Attached! Added to your wallet and profile.');
    }catch(e:any){ setToast(e?.message||'Attach failed'); }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 max-w-[380px] mx-auto">
      <div className="font-semibold text-center">Custom Card Creator</div>
      <div className="text-xs opacity-70 text-center">Assemble a playful profile card. Art via Scryfall (credit shown).</div>

      <div className="relative">
        {/* Randomize All button - centered above card */}
        <div className="flex justify-center mb-2">
          <button onClick={()=>{ setUserEditedSub(false); randomizeAll(); }} className="px-3 py-1 rounded border border-neutral-700 text-xs bg-gray-800 hover:bg-gray-700" title="Randomize all">🎲 Randomize All</button>
        </div>
        {require('react').createElement(require('./AuthenticMTGCard').default, {
          mode: 'edit',
          value,
          onChange: (next:any)=> setValue(prev => ({ ...prev, ...next })),
          artOptions: artOptions,
          onUserEditSubtext: () => setUserEditedSub(true),
        })}
      </div>

      {/* Disclaimer */}
      <p className="mt-2 text-[10px] leading-tight opacity-70">
        This fan-made card is for personal, non‑commercial use. Artwork is credited to the listed artist and linked via Scryfall; all Magic: The Gathering trademarks and related properties are owned by Wizards of the Coast. No affiliation or endorsement is implied, and images are used under fair‑use/fan‑work principles.
      </p>

      {/* Attach + Share CTA */}
      <div className="flex items-center gap-2">
        <button onClick={async()=>{ await attach(); try{ fetch('/api/events/tools',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'card_attach'})}); }catch{} }} className="px-3 py-1 rounded bg-emerald-600 text-white text-sm">Attach to my profile</button>
        <button onClick={async()=>{
          try {
            const res = await fetch('/api/custom-cards/save?public=1', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title: (value.nameParts||[]).join(' '), value }) });
            const j = await res.json().catch(()=>({}));
            if (!res.ok || j?.ok===false) {
              if (j?.error==='quota_exceeded') { alert(`You\'ve reached your limit (${j.max}). Visit your profile to delete one, or upgrade to Pro.`); }
              else if (j?.error==='auth_required') { alert('Please sign in to share a custom card.'); }
              else { alert(j?.error||'Share failed'); }
              return;
            }
            const url = j?.url || `${window.location.origin}/cards/${encodeURIComponent(j?.slug||j?.id)}`;
            await navigator.clipboard?.writeText?.(url);
            setToast('Share link copied.');
          } catch(e:any){ alert(e?.message||'Share failed'); }
        }} className="px-3 py-1 rounded border border-neutral-700 text-sm">Share this creation</button>
      </div>
      {toast && <div className="text-xs text-amber-300">{toast} <a href="/profile" className="underline">View my profile</a></div>}
    </div>
  );
}

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

  // Single value object powering the editor
  const [value, setValue] = React.useState({
    nameParts: [PREFIX[0], DESC[0], TITLE[0]] as [string,string,string],
    subtext: '',
    artUrl: '',
    artist: '',
    scryUri: '',
    colorHint: 'U' as ('W'|'U'|'B'|'R'|'G'),
    typeText: 'Creature — Wizard',
    pt: { p: 1, t: 1 },
    mana: 3,
  });

  React.useEffect(()=>{ const id=setTimeout(()=>setToast(null),3500); return ()=>clearTimeout(id); },[toast]);

  const name = `${value.nameParts[0]} ${value.nameParts[1]} ${value.nameParts[2]}`;

  function setCmc(updater: (n:number)=>number){ setValue(v=>({ ...v, mana: updater(v.mana||0) })); }
  const color = value.colorHint;

  // Helpers for randomize
  const TYPES=['Creature','Artifact','Enchantment','Sorcery','Instant','Planeswalker'];
  const SUBTYPES=['Troll','Wizard','Rogue','Knight','Angel','Dragon','Druid','Elf','Goblin','Giant','Spirit','Zombie','Merfolk','Vampire','Warrior','Cleric','Elemental','Construct','Beast','Human'];
  function typeLine(){ return value.typeText; }

  const [randomizeKey, setRandomizeKey] = React.useState(0);
  function randomizeAll(){
    setRandomizeKey(k=>k+1);
  }

  function rerollSub(){
    const color = (value.colorHint||'').toUpperCase();
    const hooks: Record<string,string[]> = {
      W: ["Keeps tidy ledgers and tidy boards."],
      U: ["Trusts the process, and the counterspell."],
      B: ["Ambition with a graveyard plan."],
      R: ["Chaos, speed, and a smile."],
      G: ["Draws strength from the forest—and two extra lands."],
      C: ["Prefers perfect symmetry."],
      L: ["Wanders far, remembers all."]
    };
    const base = [
      "Feeds on treasure and overconfidence.",
      "Prefers symmetry—if you can survive it.",
      "Writes contracts in blood and tiny print.",
      "Dreams in turn-three and two-land keeps.",
      "Always has the second spell.",
    ];
    const arr = [...base, ...(hooks[color]||[])];
    const s = arr[Math.floor(Math.random()*arr.length)] || base[0];
    setValue(v=>({ ...v, subtext: s }));
  }

  React.useEffect(()=>{ rerollSub(); },[value.colorHint]);

  // No curated pack here; the editor loads its own internal pack.

  const current = { art: value.artUrl, artist: value.artist, uri: value.scryUri, name: '' } as any;

  async function attach(){
    const cleanName = name.trim(); const cleanSub = value.subtext.trim();
    if (containsProfanity(cleanName) || containsProfanity(cleanSub)) { setToast('Please avoid profanity.'); return; }
    try{
      const body = { name: cleanName, sub: cleanSub, art: value.artUrl||'', artist: value.artist||'', scryfall: value.scryUri||'', color: value.colorHint||'' };
      const r = await fetch('/api/profile/custom-card', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Attach failed');
      setToast('Attached! View it on your profile');
    }catch(e:any){ setToast(e?.message||'Attach failed'); }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="font-semibold">Custom Card Creator</div>
      <div className="text-xs opacity-70">Assemble a playful profile card. Art via Scryfall (credit shown).</div>

      {/* Randomize All — external small button */}
      <div className="flex justify-end">
        <button onClick={randomizeAll} className="px-2 py-1 rounded border border-neutral-700 text-xs" title="Randomize all">🎲 Randomize All</button>
      </div>

      {/* Card-as-Editor */}
      {require('react').createElement(require('./ProfileCardEditor').default, {
        mode: 'edit',
        value,
        onChange: (next:any)=> setValue(next),
        randomizeKey,
      })}

      {/* Attach CTA */}
      <div className="flex items-center gap-2">
        <button onClick={async()=>{ await attach(); try{ fetch('/api/events/tools',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'card_attach'})}); }catch{} }} className="px-3 py-1 rounded bg-emerald-600 text-white text-sm">Attach to my profile</button>
      </div>
      {toast && <div className="text-xs text-amber-300">{toast} <a href="/profile" className="underline">View my profile</a></div>}
    </div>
  );
}

"use client";
import React from "react";
import CardFrame from "./CardFrame";
import type { ProfileCardValue, ArtOption } from "./cardTypes";

export default function ProfileCardEditor({ value, onChange, mode = 'edit', randomizeKey }: { value: ProfileCardValue; onChange: (next: ProfileCardValue) => void; mode?: 'edit'|'view'; randomizeKey?: number }){
  const v = value;
  const applyPartial = React.useCallback((patch: Partial<ProfileCardValue>) => {
    onChange({
      ...v,
      ...patch,
      art: patch.art ? patch.art : v.art,
      pt: patch.pt ? patch.pt : v.pt,
    });
  }, [onChange, v]);

  // Preset name blocks
  const PREFIX = ["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame","Night","Star","Void","Storm","Bone","Blood","Rune","Sky","Stone","Wild"];
  const DESC = ["Dark","Arcane","Thorn","Ember","Frost","Gale","Grave","Tide","Dream","Hex","Mythic","Rift","Steel","Sunlit","Moonlit","Nether","Phantom","Wildwood","Clockwork","Astral"];
  const TITLE = ["Destroyer","Whisper","Weaver","Walker","Breaker","Herald","Keeper","Hunter","Singer","Architect","Devourer","Conductor","Seer","Warden","Harbinger","Alchemist","Marauder","Oracle","Revenant","Trickster"];

  // Curated pack (internal for filmstrip)
  const [pack, setPack] = React.useState<ArtOption[]>([]);
  const [busy, setBusy] = React.useState(false);
  const initializedOnce = React.useRef(false);

  React.useEffect(()=>{ (async()=>{
    try{
      setBusy(true);
      const CURATED: { label: string; color: string; names: string[] }[] = [
        { label: 'White', color:'W', names: ['Sun Titan','Elspeth, Sun\u0019s Champion','Path to Exile','Swords to Plowshares','Angel of Serenity','The Wandering Emperor','Brave the Elements','Serra Angel','March of Otherworldly Light','Emeria\'s Call'] },
        { label: 'Blue', color:'U', names: ['Counterspell','Ponder','Jace Beleren','Rhystic Study','Mystic Remora','Talrand, Sky Summoner','Archmage\'s Charm','Thassa, God of the Sea','Fact or Fiction','Cryptic Command'] },
        { label: 'Black', color:'B', names: ['Thoughtseize','Sheoldred, the Apocalypse','Liliana of the Veil','Demonic Tutor','Necromancy','Grave Titan','Phyrexian Arena','Vindicate','Reanimate','Damnation'] },
        { label: 'Red',  color:'R', names: ['Lightning Bolt','Ragavan, Nimble Pilferer','Krenko, Mob Boss','Chandra, Torch of Defiance','Chaos Warp','Fury','Torbran, Thane of Red Fell','Chain Lightning','Skullcrack','Seething Song'] },
        { label: 'Green', color:'G', names: ['Llanowar Elves','Craterhoof Behemoth','Nissa, Who Shakes the World','Eternal Witness','Cultivate','Avenger of Zendikar','Beast Whisperer','Rishkar, Peema Renegade','The Great Henge','Finale of Devastation'] },
        { label: 'Colorless', color:'C', names: ['Sol Ring','Mana Vault','Sensei\'s Divining Top','Ugin, the Spirit Dragon','Wurmcoil Engine'] },
        { label: 'Lands', color:'L', names: ['Plains','Island','Swamp','Mountain','Forest','Theros Plains','Theros Island','Theros Swamp','Theros Mountain','Theros Forest'] },
      ];
      const names: string[] = CURATED.flatMap(g=>g.names);
      const identifiers = Array.from(new Set(names)).map(n=>({ name:n }));
      const r = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ identifiers }) });
      const j:any = await r.json().catch(()=>({}));
      const data:any[] = Array.isArray(j?.data) ? j.data : [];
      const mapColor = (raw:any):string=>{ const ci = Array.isArray(raw?.color_identity)?raw.color_identity:[]; if (!ci.length) return 'C'; if (ci.length>1) return ci[0]; return ci[0]; };
      const out: ArtOption[] = data.map(c=>{ const img = c?.image_uris||c?.card_faces?.[0]?.image_uris||{}; return { name: c?.name||'', url: img.art_crop||img.normal||img.small||'', artist: c?.artist||'', id: c?.scryfall_uri||c?.uri||'', color: mapColor(c) }; }).filter((x: any)=>x.url);
      setPack(out);
    } catch{} finally{ setBusy(false);} })(); },[]);

  // Helpers for randomize/filmstrip remain here; CardFrame only sends partial updates
  function cycleName(i:0|1|2){ const arr = i===0?PREFIX: i===1?DESC:TITLE; const cur = v.nameParts[i]; const idx = Math.max(0, arr.findIndex(x => x === cur)); const nextTxt = arr[(idx+1)%arr.length]; const np = [...v.nameParts] as [string,string,string]; np[i] = nextTxt; onChange({ ...v, nameParts: np }); }
  function rerollSubInternal(){
    const color = (v.colorHint||'').toUpperCase();
    const hooks: Record<string,string[]> = {
      W:["Keeps tidy ledgers and tidy boards.", "Shines brightest when a plan comes together.", "Writes clean lines and cleaner victories."],
      U:["Trusts the process, and the counterspell.", "Calculates every line two turns ahead.", "Prefers perfect information, or the illusion of it."],
      B:["Ambition with a graveyard plan.", "Never lets a resource go to waste.", "Wins the long game with short deals."],
      R:["Chaos, speed, and a smile.", "Plays with fire—and wins on the draw.", "Sprints across the red zone without looking back."],
      G:["Draws strength from the forest—and two extra lands.", "Lets nature find the line to lethal.", "Grows value and tramples over doubt."],
      C:["Prefers perfect symmetry.", "Precision over flourish, every time.", "Balances the board like an equation."],
      L:["Wanders far, remembers all.", "Footsteps mark every path across the map.", "Finds landmarks in card text and tales."],
    };
    const base=[
      "Feeds on treasure and overconfidence.",
      "Prefers symmetry—if you can survive it.",
      "Writes contracts in blood and tiny print.",
      "Dreams in turn-three and two-land keeps.",
      "Always has the second spell.",
      "Shuffles with a flourish, cuts with a nod.",
      "Smiles at variance, then draws gas.",
    ];
    const pool=[...base, ...(hooks[color]||[])];
    const pick = ()=> pool[Math.floor(Math.random()*pool.length)] || base[0];
    const lines = 2 + (Math.random()<0.35?1:0);
    const parts: string[] = [];
    for (let i=0;i<lines;i++) parts.push(pick());
    const s = parts.join(' ');
    onChange({ ...v, subtext: s });
  }
  function randomizeType(){ const types=['Creature','Artifact','Enchantment','Sorcery','Instant','Planeswalker']; const subs=['Troll','Wizard','Rogue','Knight','Angel','Dragon','Druid','Elf','Goblin','Giant','Spirit','Zombie','Merfolk','Vampire','Warrior','Cleric','Elemental','Construct','Beast','Human']; const t = types[Math.floor(Math.random()*types.length)]; const s = subs[Math.floor(Math.random()*subs.length)]; onChange({ ...v, typeLine: `${t} — ${s}` }); }
  function randomizeName(){ const np: [string,string,string] = [PREFIX[Math.floor(Math.random()*PREFIX.length)], DESC[Math.floor(Math.random()*DESC.length)], TITLE[Math.floor(Math.random()*TITLE.length)]]; onChange({ ...v, nameParts: np }); }
  // Preload random art once pack is ready and value has no art yet
  React.useEffect(()=>{
    if (initializedOnce.current) return;
    if (!(v.art?.url) && pack.length){
      const list = v.colorHint? pack.filter(x=> (x.color||'').toUpperCase()===(v.colorHint||'').toUpperCase()) : pack;
      const pick = list.length? list[Math.floor(Math.random()*list.length)] : pack[Math.floor(Math.random()*pack.length)];
      onChange({ ...v, art: { url: pick.url, artist: pick.artist, id: pick.id }, colorHint: (pick.color as any)||v.colorHint });
      initializedOnce.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.length, v.art?.url, v.colorHint]);

  // Randomize-all trigger via key (respects active filter for art)
  React.useEffect(()=>{
    if (randomizeKey==null) return;
    const np: [string,string,string] = [PREFIX[Math.floor(Math.random()*PREFIX.length)], DESC[Math.floor(Math.random()*DESC.length)], TITLE[Math.floor(Math.random()*TITLE.length)]];
    const types=['Creature','Artifact','Enchantment','Sorcery','Instant','Planeswalker']; const subs=['Troll','Wizard','Rogue','Knight','Angel','Dragon','Druid','Elf','Goblin','Giant','Spirit','Zombie','Merfolk','Vampire','Warrior','Cleric','Elemental','Construct','Beast','Human'];
    const tt = `${types[Math.floor(Math.random()*types.length)]} — ${subs[Math.floor(Math.random()*subs.length)]}`;
    const p = Math.floor(Math.random()*9)+1; const t = Math.floor(Math.random()*9)+1;
    const cost = Math.floor(Math.random()*9)+1; const colors: any = ['W','U','B','R','G']; const colorHint = colors[Math.floor(Math.random()*5)];
    let art = v.art;
    if (pack.length) {
      const list = (v.colorHint? pack.filter(x=> (x.color||'').toUpperCase()===(v.colorHint||'').toUpperCase()) : pack);
      const pick = list.length? list[Math.floor(Math.random()*list.length)] : pack[Math.floor(Math.random()*pack.length)];
      art = { url: pick.url, artist: pick.artist, id: pick.id };
    }
    const hooks: Record<string,string[]> = { W:["Keeps tidy ledgers and tidy boards."], U:["Trusts the process, and the counterspell."], B:["Ambition with a graveyard plan."], R:["Chaos, speed, and a smile."], G:["Draws strength from the forest—and two extra lands."], C:["Prefers perfect symmetry."], L:["Wanders far, remembers all."] };
    const base=["Feeds on treasure and overconfidence.","Prefers symmetry—if you can survive it.","Writes contracts in blood and tiny print.","Dreams in turn-three and two-land keeps.","Always has the second spell."];
    const arr=[...base, ...(hooks[colorHint]||[])]; const sub = arr[Math.floor(Math.random()*arr.length)] || base[0];
    onChange({ ...v, nameParts: np, typeLine: tt, pt: { p, t }, cost, colorHint, art, subtext: sub });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [randomizeKey]);

  // Ambient matte extraction (moved from CardFrame) with small debounce
  const [matte, setMatte] = React.useState<{ primary: string; secondary: string } | undefined>(undefined);
  const debounceRef = React.useRef<any>(null);
  React.useEffect(()=>{
    if (!v.art?.url) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async ()=>{
      try{
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((res, rej)=>{ img.onload=()=>res(); img.onerror=()=>rej(new Error('img')); img.src=v.art.url; });
        const w=24,h=24; const cvs=document.createElement('canvas'); cvs.width=w; cvs.height=h; const ctx=cvs.getContext('2d'); if(!ctx) return;
        ctx.drawImage(img,0,0,w,h);
        const data = ctx.getImageData(0,0,w,h).data;
        let r=0,g=0,b=0,n=0; for(let i=0;i<data.length;i+=4){ const R=data[i],G=data[i+1],B=data[i+2],A=data[i+3]; if(A<200) continue; n++; r+=R; g+=G; b+=B; }
        const avg=n? [Math.round(r/n),Math.round(g/n),Math.round(b/n)] as [number,number,number] : [27,34,48];
        const toHsl=(R:number,G:number,B:number)=>{ R/=255; G/=255; B/=255; const max=Math.max(R,G,B),min=Math.min(R,G,B); let h=0,s=0,l=(max+min)/2; if(max!==min){ const d=max-min; s=l>0.5? d/(2-max-min): d/(max+min); switch(max){ case R: h=(G-B)/d+(G<B?6:0); break; case G: h=(B-R)/d+2; break; case B: h=(R-G)/d+4; break; } h/=6;} return {h,s,l}; };
        const toRgb=(h:number,s:number,l:number)=>{ let r:number,g:number,b:number; if(s===0){ r=g=b=l; } else { const hue2rgb=(p:number,q:number,t:number)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }; const q=l<0.5?l*(1+s):l+s-l*s; const p=l*2-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);} return [Math.round(r*255),Math.round(g*255),Math.round(b*255)] as [number,number,number]; };
        const clamp01=(x:number)=> Math.max(0,Math.min(1,x));
        const hsl=toHsl(avg[0],avg[1],avg[2]);
        const isGrey = hsl.s < 0.12;
        let pL = clamp01(hsl.l + 0.12); let sL = clamp01(hsl.l - 0.10); const sS = hsl.s * 0.8;
        const prim = isGrey? [16,20,27] : toRgb(hsl.h, sS, Math.min(pL, 0.7));
        const sec = isGrey? [11,15,21] : toRgb(hsl.h, sS, Math.max(sL, 0.12));
        const toHex=(r:number,g:number,b:number)=>'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
        const [pr,pg,pb] = prim as [number,number,number];
        const [sr,sg,sb] = sec as [number,number,number];
        setMatte({ primary: toHex(pr,pg,pb), secondary: toHex(sr,sg,sb) });
      }catch{ setMatte({ primary:'#0f1218', secondary:'#1a2230' }); }
    }, 60);
    return ()=>{ if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [v.art?.url]);

  return (
    <div className="relative">
      <CardFrame
        mode={mode}
        value={v}
        onChange={applyPartial}
        artOptions={pack}
        matte={matte}
      />
      {busy && (<div className="absolute inset-0 pointer-events-none" />)}
    </div>
  );
}

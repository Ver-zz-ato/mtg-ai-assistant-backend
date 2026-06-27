"use client";
import React from "react";
import { containsProfanity } from "@/lib/profanity";
import { AUTH_MESSAGES, showAuthToast } from "@/lib/auth-messages";
import { capture } from "@/lib/ph";
import { AnalyticsEvents } from "@/lib/analytics/events";
import QRShareModal from "@/components/share/QRShareModal";
import type { ProfileCardValue } from "./cardTypes";

// Preset name blocks
const PREFIX = ["Dr.","Lord","Lady","Captain","Sir","Arch-","Grand","Shadow","Iron","Flame","Night","Star","Void","Storm","Bone","Blood","Rune","Sky","Stone","Wild"];
const DESC = ["Dark","Arcane","Thorn","Ember","Frost","Gale","Grave","Tide","Dream","Hex","Mythic","Rift","Steel","Sunlit","Moonlit","Nether","Phantom","Wildwood","Clockwork","Astral"];
const TITLE = ["Destroyer","Whisper","Weaver","Walker","Breaker","Herald","Keeper","Hunter","Singer","Architect","Devourer","Conductor","Seer","Warden","Harbinger","Alchemist","Marauder","Oracle","Revenant","Trickster"];

// Curated art pack names grouped by color identity tag
const CURATED: { label: string; color: string; names: string[] }[] = [
  { label: 'White', color:'W', names: ['Sun Titan','Elspeth, Sun\'s Champion','Path to Exile','Swords to Plowshares','Angel of Serenity','The Wandering Emperor','Brave the Elements','Serra Angel','March of Otherworldly Light','Emeria\'s Call'] },
  { label: 'Blue', color:'U', names: ['Counterspell','Ponder','Jace Beleren','Rhystic Study','Mystic Remora','Talrand, Sky Summoner','Archmage\'s Charm','Thassa, God of the Sea','Fact or Fiction','Cryptic Command'] },
  { label: 'Black', color:'B', names: ['Thoughtseize','Sheoldred, the Apocalypse','Liliana of the Veil','Demonic Tutor','Necromancy','Grave Titan','Phyrexian Arena','Vindicate','Reanimate','Damnation'] },
  { label: 'Red',  color:'R', names: ['Lightning Bolt','Ragavan, Nimble Pilferer','Krenko, Mob Boss','Chandra, Torch of Defiance','Chaos Warp','Fury','Torbran, Thane of Red Fell','Chain Lightning','Skullcrack','Seething Song'] },
  { label: 'Green', color:'G', names: ['Llanowar Elves','Craterhoof Behemoth','Nissa, Who Shakes the World','Eternal Witness','Cultivate','Avenger of Zendikar','Beast Whisperer','Rishkar, Peema Renegade','The Great Henge','Finale of Devastation'] },
  { label: 'Colorless', color:'C', names: ['Sol Ring','Mana Vault','Sensei\'s Divining Top','Ugin, the Spirit Dragon','Wurmcoil Engine'] },
  { label: 'Lands', color:'L', names: ['Plains','Island','Swamp','Mountain','Forest','Evolving Wilds','Terramorphic Expanse','Command Tower','Exotic Orchard','Path of Ancestry'] },
];

function norm(s:string){ return String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim(); }

const AI_STYLES = ["Commander", "Aggro", "Control", "Tribal", "Meme", "Broken"] as const;

type AiStyle = (typeof AI_STYLES)[number];
type SavedCustomCard = {
  id: string;
  title: string;
  public_slug?: string | null;
  created_at?: string | null;
  data?: any;
};

function safeFilePart(value: string): string {
  return String(value || "custom-card")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "custom-card";
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function paletteFor(colorHint: string | undefined) {
  const map: Record<string, { primary: string; secondary: string; accent: string }> = {
    W: { primary: "#e7dfc6", secondary: "#8f856f", accent: "#fff7d9" },
    U: { primary: "#74b7e6", secondary: "#244a7c", accent: "#a9d9ff" },
    B: { primary: "#8f8b98", secondary: "#252733", accent: "#d5cfe1" },
    R: { primary: "#e88969", secondary: "#6f2c24", accent: "#ffb190" },
    G: { primary: "#72d58f", secondary: "#245f35", accent: "#b5f2c6" },
    C: { primary: "#9aa7ba", secondary: "#3d4a5b", accent: "#c7d2e4" },
  };
  return map[String(colorHint || "C").toUpperCase()] || map.C;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const paragraphs = String(text || "").split(/\n+/);
  let lineY = y;
  let lines = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        lineY += lineHeight;
        lines++;
        line = word;
        if (lines >= maxLines) return;
      } else {
        line = test;
      }
    }
    if (line && lines < maxLines) {
      ctx.fillText(line, x, lineY);
      lineY += lineHeight;
      lines++;
    }
    if (lines >= maxLines) return;
  }
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = String(src || "").trim();
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function renderCustomCardPng(value: ProfileCardValue, cardName: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 750;
  canvas.height = 1050;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image.");

  const palette = paletteFor(value.colorHint);
  const frameGradient = ctx.createLinearGradient(0, 0, 750, 1050);
  frameGradient.addColorStop(0, palette.accent);
  frameGradient.addColorStop(0.42, palette.primary);
  frameGradient.addColorStop(1, palette.secondary);

  ctx.fillStyle = "#080808";
  drawRoundRect(ctx, 0, 0, 750, 1050, 34);
  ctx.fill();
  ctx.fillStyle = frameGradient;
  drawRoundRect(ctx, 22, 22, 706, 1006, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#111";
  drawRoundRect(ctx, 52, 52, 646, 946, 18);
  ctx.fill();

  const barGradient = ctx.createLinearGradient(0, 0, 0, 120);
  barGradient.addColorStop(0, "#f1ece3");
  barGradient.addColorStop(0.5, "#a99f93");
  barGradient.addColorStop(1, "#ddd6cc");

  const drawBar = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = barGradient;
    drawRoundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,20,20,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  drawBar(72, 74, 606, 62);
  ctx.fillStyle = "#080808";
  ctx.font = "bold 31px Georgia, serif";
  ctx.textBaseline = "middle";
  ctx.fillText(cardName || "Custom Card", 92, 105, 445);

  const manaCost = Array.isArray(value.manaCost) && value.manaCost.length ? value.manaCost : [String(value.cost || 1)];
  let pipX = 650;
  for (let i = manaCost.length - 1; i >= 0; i--) {
    ctx.fillStyle = "#e8e1d8";
    ctx.beginPath();
    ctx.arc(pipX, 105, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(manaCost[i]), pipX, 106);
    pipX -= 40;
  }
  ctx.textAlign = "left";

  drawRoundRect(ctx, 72, 154, 606, 456, 8);
  ctx.fillStyle = "#1b1b1b";
  ctx.fill();
  const img = await loadCanvasImage(value.art?.url || "");
  if (img) {
    const ratio = Math.max(606 / img.width, 456 / img.height);
    const sw = 606 / ratio;
    const sh = 456 / ratio;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.save();
    drawRoundRect(ctx, 72, 154, 606, 456, 8);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, 72, 154, 606, 456);
    ctx.restore();
  } else {
    ctx.fillStyle = "#2b2b2b";
    ctx.fillRect(72, 154, 606, 456);
    ctx.fillStyle = "#777";
    ctx.font = "bold 24px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ManaTap Custom Card", 375, 382);
    ctx.textAlign = "left";
  }
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.lineWidth = 4;
  ctx.stroke();

  drawBar(72, 630, 606, 54);
  ctx.fillStyle = "#080808";
  ctx.font = "bold 24px Georgia, serif";
  ctx.textBaseline = "middle";
  ctx.fillText(String(value.typeLine || "Creature"), 92, 657, 520);
  ctx.font = "bold 18px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(String(value.setSymbol || "CCC"), 658, 657);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(239,232,218,0.95)";
  drawRoundRect(ctx, 72, 706, 606, 210, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.stroke();
  ctx.fillStyle = "#161616";
  ctx.font = "24px Georgia, serif";
  ctx.textBaseline = "top";
  wrapCanvasText(ctx, String(value.subtext || ""), 94, 728, 562, 32, 5);

  ctx.fillStyle = "#f1ece3";
  drawRoundRect(ctx, 540, 912, 116, 56, 10);
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${value.pt?.p ?? 1}/${value.pt?.t ?? 1}`, 598, 940);

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "16px Arial, sans-serif";
  ctx.fillText(value.art?.artist ? `Art: ${value.art.artist}` : "Art via Scryfall", 74, 990);
  ctx.textAlign = "right";
  ctx.fillText("ManaTap fan-made card", 676, 990);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export image."));
    }, "image/png");
  });
}

export default function CustomCardCreator({ compact = false }: { compact?: boolean }){
  const [pi,setPi] = React.useState(0);
  const [di,setDi] = React.useState(0);
  const [ti,setTi] = React.useState(0);
  const [toast,setToast]=React.useState<string|null>(null);
  const [artOptions, setArtOptions] = React.useState<any[]>([]);
  const [loadingArt, setLoadingArt] = React.useState(true);
  const [artError, setArtError] = React.useState<string | null>(null);
  const [userEditedSub, setUserEditedSub] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [showShareQr, setShowShareQr] = React.useState(false);
  const [aiPrompt, setAiPrompt] = React.useState("");
  const [aiStyle, setAiStyle] = React.useState<AiStyle>("Commander");
  const [aiPower, setAiPower] = React.useState(0.45);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [savedCards, setSavedCards] = React.useState<SavedCustomCard[]>([]);
  const [savedLoading, setSavedLoading] = React.useState(false);
  const [savedError, setSavedError] = React.useState<string | null>(null);

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

  const name = (value.nameParts?.[1] || value.nameParts?.[2]) ? (value.nameParts||[]).filter(Boolean).join(' ') : (value.nameParts?.[0] ?? '');

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

  const loadSavedCards = React.useCallback(async () => {
    if (compact) return;
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await fetch("/api/custom-cards/list", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setSavedCards([]);
        return;
      }
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Could not load saved cards.");
      setSavedCards(
        Array.isArray(json?.rows)
          ? json.rows
          : Array.isArray(json?.cards)
            ? json.cards
            : Array.isArray(json?.items)
              ? json.items
              : [],
      );
    } catch (e: any) {
      setSavedError(e?.message || "Could not load saved cards.");
    } finally {
      setSavedLoading(false);
    }
  }, [compact]);

  React.useEffect(() => {
    void loadSavedCards();
  }, [loadSavedCards]);

  // Auto-generate flavor when name or art changes unless user edited
  React.useEffect(()=>{
    if (userEditedSub) return;
    rerollSub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.art?.url, name]);

  async function generateAiCard() {
    setAiBusy(true);
    setToast(null);
    try {
      const res = await fetch("/api/custom-cards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, style: aiStyle, power: aiPower }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false || !json?.card) {
        if (res.status === 401 || json?.requiresAuth) {
          showAuthToast(AUTH_MESSAGES.ATTACH_CARD);
          return;
        }
        throw new Error(json?.error || "AI generation failed.");
      }
      setUserEditedSub(true);
      setValue((prev) => ({
        ...prev,
        ...json.card,
        art: prev.art,
        setSymbol: prev.setSymbol || "CCC",
      }));
      setToast("AI card text generated. Tweak it, pick art, then save or share.");
    } catch (e: any) {
      setToast(e?.message || "AI generation failed.");
    } finally {
      setAiBusy(false);
    }
  }

  async function deleteSavedCard(id: string) {
    try {
      const res = await fetch("/api/custom-cards/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Delete failed.");
      setSavedCards((rows) => rows.filter((row) => row.id !== id));
      setToast("Deleted saved custom card.");
    } catch (e: any) {
      setToast(e?.message || "Delete failed.");
    }
  }

  async function pinSavedCard(id: string) {
    try {
      const res = await fetch("/api/custom-cards/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Could not attach card.");
      setToast("Attached saved card to your profile.");
    } catch (e: any) {
      setToast(e?.message || "Could not attach card.");
    }
  }

  // Load curated art pack
  React.useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        setLoadingArt(true);
        setArtError(null);
        const names: string[] = CURATED.flatMap(g => g.names);
        const identifiers = Array.from(new Set(names)).map(n => ({ name: n }));
        // Use our backend proxy to avoid CORS issues
        const r = await fetch('/api/cards/collection', { 
          method: 'POST', 
          headers: { 'content-type': 'application/json' }, 
          body: JSON.stringify({ identifiers }),
          signal: controller.signal,
        });
        if (cancelled) return;
        const j: any = await r.json().catch(() => ({}));
        if (cancelled) return;
        const data: any[] = Array.isArray(j?.data) ? j.data : [];
        if (!r.ok || (j?.object === 'error' && !data.length)) {
          if (!cancelled) {
            setArtError(j?.details || j?.error || 'Failed to load artwork');
          }
          return;
        }
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
        if (cancelled) return;
        setArtOptions(out);
        if (out.length === 0) setArtError('No artwork found');
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (
          cancelled ||
          controller.signal.aborted ||
          e?.name === 'AbortError' ||
          /load failed/i.test(msg)
        ) {
          return;
        }
        setArtError(msg || 'Failed to load artwork');
      } finally {
        if (!cancelled) {
          setLoadingArt(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
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
      if (r.status === 401 || j?.error === 'unauthenticated') {
        setToast(AUTH_MESSAGES.ATTACH_CARD);
        return;
      }
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Attach failed');
      
      // Track custom card creation
      capture(AnalyticsEvents.CUSTOM_CARD_CREATED, {
        card_name: cleanName,
        color: value.colorHint || '',
        rarity: value.rarity || 'common',
        has_custom_art: !!value.art?.url
      });
      
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

  async function downloadImage() {
    const cleanName = name.trim() || "Custom Card";
    if (containsProfanity(cleanName) || containsProfanity(value.subtext || "") || containsProfanity(value.typeLine || "")) {
      setToast("Please avoid profanity before downloading.");
      return;
    }
    setToast("Preparing image...");
    try {
      const blob = await renderCustomCardPng(value, cleanName);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `manatap-${safeFilePart(cleanName)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setToast("Card image download started.");
    } catch (e: any) {
      setToast(e?.message || "Could not download image.");
    }
  }

  return (
    <div className={`${compact? 'bg-transparent border-0 rounded-none p-0 space-y-2 max-w-[380px]' : 'w-full bg-gray-900/70 border border-gray-800 rounded-xl p-4 md:p-6 space-y-5'} mx-auto`}>
      <div className="font-semibold text-center">Custom Card Creator</div>
      <div className="text-2xl font-bold text-center bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent mb-2">Assemble a playful profile card.</div>
      <div className="text-xs opacity-70 text-center">Art via Scryfall (credit shown).</div>

      {compact ? (
        <div className="text-center">
          <a href="/tools/custom-card" className="text-xs font-semibold text-cyan-300 underline">
            Open full creator
          </a>
        </div>
      ) : (
        <div className="rounded-xl border border-purple-500/25 bg-purple-500/10 p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-end">
            <label className="flex-1 text-xs font-bold uppercase tracking-[0.14em] text-purple-200">
              AI prompt
              <textarea
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.currentTarget.value)}
                placeholder="A graveyard wizard who turns failed combos into value..."
                rows={3}
                className="mt-2 w-full resize-y rounded-lg border border-purple-400/30 bg-black/45 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none placeholder:text-neutral-500 focus:border-purple-300"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-[1fr_180px] md:w-[420px]">
              <label className="text-xs font-bold uppercase tracking-[0.14em] text-purple-200">
                Power
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={aiPower}
                  onChange={(event) => setAiPower(Number(event.currentTarget.value))}
                  className="mt-3 w-full accent-purple-400"
                />
                <span className="mt-1 block font-mono text-[11px] normal-case tracking-normal text-purple-100/75">
                  {Math.round(aiPower * 100)}%
                </span>
              </label>
              <button
                type="button"
                onClick={() => void generateAiCard()}
                disabled={aiBusy}
                className="rounded-lg bg-gradient-to-r from-purple-600 to-cyan-500 px-4 py-3 text-sm font-black text-white transition hover:from-purple-500 hover:to-cyan-400 disabled:opacity-60"
              >
                {aiBusy ? "Generating..." : "Generate Card Text"}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {AI_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setAiStyle(style)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  aiStyle === style
                    ? "border-cyan-300 bg-cyan-300 text-black"
                    : "border-neutral-700 bg-black/35 text-neutral-300 hover:border-cyan-300/60"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        {/* Randomize All button - centered above card */}
        <div className="flex justify-center mb-2">
          <button onClick={()=>{ setUserEditedSub(false); randomizeAll(); }} className="px-3 py-1 rounded border border-neutral-700 text-xs bg-gray-800 hover:bg-gray-700" title="Randomize all">🎲 Randomize All</button>
        </div>
        <div className="flex justify-center">
          {require('react').createElement(require('./AuthenticMTGCard').default, {
            mode: 'edit',
            value,
            onChange: (next:any)=> setValue(prev => ({ ...prev, ...next })),
            artOptions: artOptions,
            onUserEditSubtext: () => setUserEditedSub(true),
          })}
        </div>
      </div>

      {/* Loading indicator for art */}
      {loadingArt && (
        <div className="flex items-center justify-center gap-2 text-xs text-neutral-400 mt-2">
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400"></div>
          <span>Loading art choices...</span>
        </div>
      )}
      {/* Art load error - show retry option */}
      {artError && !loadingArt && (
        <div className="text-xs text-amber-400 text-center mt-2">
          {artError}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-2 underline hover:text-amber-300"
          >
            Retry
          </button>
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-2 text-xs leading-tight opacity-80 text-center text-neutral-300">
        This fan-made card is for personal, non‑commercial use. Artwork is credited to the listed artist and linked via Scryfall; all Magic: The Gathering trademarks and related properties are owned by Wizards of the Coast. No affiliation or endorsement is implied, and images are used under fair‑use/fan‑work principles.
      </p>

      {/* Profanity notice */}
      { (containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||'')) && (
        <div className="text-xs text-red-300 text-center">Please avoid profanity in name, type line, or text.</div>
      )}

      {/* Attach + Share CTA */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button disabled={(containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||''))} onClick={async()=>{ await attach(); try{ fetch('/api/events/tools',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'card_attach'})}); }catch{} }} className={`px-3 py-1 rounded text-sm ${ (containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||'')) ? 'bg-gray-500 text-white opacity-60 cursor-not-allowed' : 'bg-emerald-600 text-white' }`}>Attach to my profile</button>
        <button disabled={(containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||''))} onClick={async()=>{
        try {
            const res = await fetch('/api/custom-cards/save?public=1', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title: name, value }) });
            const j = await res.json().catch(()=>({}));
            if (!res.ok || j?.ok===false) {
              if (j?.error==='quota_exceeded') { alert(`You\'ve reached your limit (${j.max}). Visit your profile to delete one, or upgrade to Pro.`); }
              else if (j?.error==='auth_required') { showAuthToast(AUTH_MESSAGES.SHARE_CARD); }
              else { alert(j?.error||'Share failed'); }
              return;
            }
            // Ensure absolute URL regardless of environment or server response
            let url = String(j?.url||'');
            const slug = String(j?.slug||j?.id||'');
            const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
            if (!url || !/^https?:\/\//i.test(url)) {
              // If server returned relative or empty URL, compose from origin
              url = slug ? `${origin}/cards/${encodeURIComponent(slug)}` : `${origin}/cards`;
            }
            setShareUrl(url);
            await navigator.clipboard?.writeText?.(url);
            
            // Track custom card sharing
            capture(AnalyticsEvents.CUSTOM_CARD_SHARED, {
              card_name: name,
              color: value.colorHint || '',
              rarity: value.rarity || 'common'
            });
            
            setToast('Share link copied.');
          } catch(e:any){ alert(e?.message||'Share failed'); }
        }} className="px-3 py-1 rounded border border-neutral-700 text-sm">Share this creation</button>
        <button
          type="button"
          disabled={(containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||''))}
          onClick={() => void downloadImage()}
          className={`px-3 py-1 rounded border text-sm ${
            (containsProfanity(name) || containsProfanity(value.subtext||'') || containsProfanity(value.typeLine||''))
              ? 'border-neutral-700 text-neutral-500 opacity-60 cursor-not-allowed'
              : 'border-cyan-500/45 text-cyan-100 hover:bg-cyan-500/10'
          }`}
        >
          Download image
        </button>
      </div>
      {toast && (
        <div className="text-xs text-amber-300 text-center">
          {toast}
          {' '}
          <a href="/profile" className="underline">View my profile</a>
          {shareUrl && (
            <>
              {' '}
              • <a href={shareUrl} target="_blank" rel="noreferrer" className="underline">Open now</a>
              {' '}
              • <button type="button" onClick={()=>setShowShareQr(true)} className="underline">Show QR</button>
            </>
          )}
        </div>
      )}
      <QRShareModal
        open={Boolean(showShareQr && shareUrl)}
        url={shareUrl || ""}
        title="Share custom card"
        description="Scan to open this custom card."
        onClose={()=>setShowShareQr(false)}
      />

      {!compact ? (
        <div className="rounded-xl border border-neutral-800 bg-black/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.14em] text-neutral-200">Saved custom cards</h3>
              <p className="mt-1 text-xs text-neutral-500">Attach a saved card to your profile, open a public card, or clean up old drafts.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSavedCards()}
              disabled={savedLoading}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 disabled:opacity-60"
            >
              {savedLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {savedError ? <p className="mb-3 text-xs text-amber-300">{savedError}</p> : null}
          {savedCards.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-4 text-sm text-neutral-400">
              Saved cards will appear here after you save or share one.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {savedCards.map((card) => {
                const slug = card.public_slug || card.id;
                const url = `/cards/${encodeURIComponent(slug)}`;
                return (
                  <div key={card.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{card.title || "Custom card"}</p>
                        <p className="mt-1 text-xs text-neutral-500">{card.public_slug ? "Public share ready" : "Private draft"}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void deleteSavedCard(card.id)}
                        className="rounded border border-red-500/35 px-2 py-1 text-xs text-red-200 hover:bg-red-500/10"
                      >
                        Delete
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void pinSavedCard(card.id)}
                        className="rounded border border-emerald-500/35 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10"
                      >
                        Attach
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border border-cyan-500/35 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/10"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          const origin = typeof window !== "undefined" ? window.location.origin : "";
                          await navigator.clipboard?.writeText?.(`${origin}${url}`);
                          setToast("Card link copied.");
                        }}
                        className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-800"
                      >
                        Copy link
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

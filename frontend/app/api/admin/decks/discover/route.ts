/**
 * Admin: discover decks on Moxfield by commander name and import them.
 * Searches Moxfield API, fetches top decks per commander, imports as public.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";

const PUBLIC_DECKS_USER_ID = "990d69b2-3500-4833-81df-b05e07f929db";
const MAX_COMMANDERS = 100;
const DEFAULT_DECKS_PER = 3;

const POPULAR_COMMANDERS = [
  "Atraxa, Praetors Voice",
  "The Ur-Dragon",
  "Edgar Markov",
  "Yuriko, the Tigers Shadow",
  "Krenko, Mob Boss",
  "Meren of Clan Nel Toth",
  "Korvold, Fae-Cursed King",
  "Prosper, Tome-Bound",
  "Kenrith, the Returned King",
  "Muldrotha, the Gravetide",
  "Miirym, Sentinel Wyrm",
  "Omnath, Locus of Creation",
  "Lathril, Blade of the Elves",
  "Wilhelt, the Rotcleaver",
  "Gishath, Suns Avatar",
  "Pantlaza, Sun-Favored",
  "Etali, Primal Conqueror",
  "Kaalia of the Vast",
  "Narset, Enlightened Master",
  "Sliver Overlord",
  "The First Sliver",
  "Aesi, Tyrant of Gyre Strait",
  "Tatyova, Benthic Druid",
  "Queen Marchesa",
  "Derevi, Empyrial Tactician",
  "Animar, Soul of Elements",
  "The Scarab God",
  "The Locust God",
  "Purphoros, God of the Forge",
  "Alesha, Who Smiles at Death",
  "Sauron, the Dark Lord",
  "Yshtola, Nights Blessed",
  "Chulane, Teller of Tales",
  "Ghave, Guru of Spores",
  "Yawgmoth, Thran Physician",
  "The Gitrog Monster",
  "Kess, Dissident Mage",
  "Thrasios, Triton Hero",
  "Tymna the Weaver",
  "Najeela, the Blade-Blossom",
  "Kinnan, Bonder Prodigy",
  "Niv-Mizzet, Parun",
  "Jodah, Archmage Eternal",
  "Sisay, Weatherlight Captain",
  "Zur the Enchanter",
  "Omnath, Locus of Rage",
  "Jhoira, Weatherlight Captain",
  "Rhys the Redeemed",
  "Teysa Karlov",
  "Kykar, Winds Fury",
  "Elenda, the Dusk Rose",
  "Sythis, Harvest Hand",
  "Tergrid, God of Fright",
  "Koma, Cosmos Serpent",
  "Veyran, Voice of Duality",
  "Galazeth Prismari",
  "Osgir, the Reconstructor",
  "Liesa, Shroud of Dusk",
  "Brago, King Eternal",
  "Maelstrom Wanderer",
  "Riku of Two Reflections",
  "Zacama, Primal Calamity",
  "Tasigur, the Golden Fang",
  "Prossh, Skyraider of Kher",
  "Marath, Will of the Wild",
  "Oloro, Ageless Ascetic",
  "Roon of the Hidden Realm",
  "Sharuum the Hegemon",
  "Karador, Ghost Chieftain",
  "Neheb, the Eternal",
  "Godo, Bandit Warlord",
  "Rakdos, Lord of Riots",
  "Shu Yun, the Silent Tempest",
  "Sydri, Galvanic Genius",
  "Jeleva, Nephalias Scourge",
  "The Mimeoplasm",
  "Zedruu the Greathearted",
  "Grimgrin, Corpse-Born",
  "Vivi Ornitier",
  "Teval, the Balanced Scale",
  "Kefka, Court Mage",
  "Sephiroth, Fabled SOLDIER",
  "Fire Lord Azula",
  "Go-Shintai of Life Origin",
  "Isshin, Two Heavens as One",
  "Henzie Toolbox Torre",
  "Raffine, Scheming Seer",
  "Jinnie Fay, Jetmir Second",
  "Faldorn, Dread Wolf Herald",
  "Abaddon the Despoiler",
  "The Swarmlord",
  "Dihada, Binder of Wills",
  "Nahiri, the Lithomancer",
  "Obeka, Brute Chronologist",
  "Kraum, Ludevics Opus",
  "Tana, the Bloodsower",
  "Bruse Tarl, Boorish Herder",
  "Akiri, Line-Slinger",
  "Sidar Kondo of Jamuraa",
  "Ishai, Ojutai Dragonspeaker",
  "Kydele, Chosen of Kruphix",
  "Vial Smasher the Fierce",
  "Ravos, Soultender",
  "Ikra Shidiqui, the Usurper",
  "Tevesh Szat, Doom of Fools",
  "Sakashima of a Thousand Faces",
  "Krark, the Thumbless",
  "Rograkh, Son of Rohgahh",
  "Ardenn, Intrepid Archaeologist",
  "Kodama of the East Tree",
  "Breya, Etherium Shaper",
  "Esika, God of the Tree",
  "Jodah, the Unifier",
  "Urza, Lord High Artificer",
  "Urza, Chief Artificer",
  "Shorikai, Genesis Engine",
  "Kotori, Pilot Prodigy",
  "Greasefang, Okiba Boss",
  "Light-Paws, Emperors Voice",
  "Toski, Bearer of Secrets",
  "Magda, Brazen Outlaw",
  "Toxrill, the Corrosive",
  "The Reality Chip",
  "Jhoira, Ageless Innovator",
  "Eruth, Tormented Prophet",
  "Ziatora, the Incinerator",
  "Jetmir, Nexus of Revels",
  "Adeline, Resplendent Cathar",
  "Giada, Font of Hope",
  "Kyler, Sigardian Emissary",
  "Sigarda, Font of Blessings",
  "Katilda, Dawnheart Prime",
  "Myrel, Shield of Argive",
  "Burakos, Party Leader",
  "Raggadragga, Goreguts Boss",
  "Rocco, Cabaretti Caterer",
  "Rionya, Fire Dancer",
  "Zurzoth, Chaos Rider",
  "Ovika, Enigma Goliath",
  "Urabrask, Heretic Praetor",
  "Ob Nixilis, Captive Kingpin",
  "Beamtown Bullies",
  "Evelyn, the Covetous",
  "Nalia de Arnise",
  "The Beamtown Bullies",
  "Goro-Goro and Satoru",
  "Yoshimaru, Ever Faithful",
  "Tivit, Seller of Secrets",
  "Kamiz, Obscura Oculus",
  "Queza, Augur of Agonies",
  "Zevlor, Elturel Exile",
  "Abdel Adrian, Gorions Ward",
  "Candlekeep Sage",
  "Grolnok, the Omnivore",
  "Kodama of the West Tree",
  "Wilson, Refined Grizzly",
  "Galea, Kindler of Hope",
  "Aminatou, the Fateshifter",
  "Varina, Lich Queen",
  "Xenagos, God of Revels",
  "Minsc and Boo, Timeless Heroes",
  "Gandalf the White",
];

async function searchMoxfield(commander: string): Promise<Array<{ publicId?: string; id?: string }>> {
  const url = `https://api.moxfield.com/v2/decks/search?q=${encodeURIComponent(`commander:"${commander}"`)}&sort=popularity&page=1&pageSize=10`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ManaTap-AI/1.0", Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: Array<{ publicId?: string; id?: string }> };
  return data.data ?? [];
}

async function fetchMoxfieldDeck(deckId: string): Promise<{ commander: string; title: string; cards: Array<{ name: string; qty: number }> } | null> {
  const res = await fetch(`https://api.moxfield.com/v2/decks/all/${deckId}`, {
    headers: { "User-Agent": "ManaTap-AI/1.0", Accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;
  const commanders = data.commanders as Record<string, { card?: { name?: string }; quantity?: number }> | undefined;
  const mainboard = data.mainboard as Record<string, { quantity?: number }> | undefined;
  if (!commanders || !mainboard) return null;
  const commanderEntry = Object.values(commanders)[0];
  const commander = commanderEntry?.card?.name;
  if (!commander) return null;
  const cards: Array<{ name: string; qty: number }> = [];
  for (const [name, entry] of Object.entries(mainboard)) {
    if (name.toLowerCase() !== commander.toLowerCase()) {
      cards.push({ name, qty: entry?.quantity ?? 1 });
    }
  }
  cards.push({ name: commander, qty: 1 });
  const total = cards.reduce((s, c) => s + c.qty, 0);
  if (total < 96 || total > 101) return null;
  return {
    commander,
    title: (data.name as string) || `${commander} - Imported`,
    cards,
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const usePopular = body.use_popular === true;
    const commandersRaw = Array.isArray(body.commanders) ? body.commanders : [];
    const commanders = usePopular
      ? POPULAR_COMMANDERS
      : commandersRaw
          .filter((c: unknown) => typeof c === "string")
          .map((c: string) => c.trim())
          .filter(Boolean)
          .slice(0, MAX_COMMANDERS);
    const decksPer = Math.min(Math.max(1, Number(body.decks_per) || DEFAULT_DECKS_PER), 5);

    if (commanders.length === 0) {
      return NextResponse.json({ ok: false, error: "No commanders. Pass commanders[] or use_popular: true" }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    const results: Array<{ commander: string; title: string; success: boolean; error?: string; deckId?: string }> = [];
    const seenTitles = new Set<string>();

    for (const commander of commanders) {
      const searchResults = await searchMoxfield(commander);
      const toFetch = searchResults.slice(0, decksPer);
      for (const hit of toFetch) {
        const deckId = hit.publicId ?? hit.id;
        if (!deckId) continue;
        try {
          const deck = await fetchMoxfieldDeck(deckId);
          if (!deck) {
            results.push({ commander, title: "", success: false, error: "Invalid deck" });
            continue;
          }
          const key = `${deck.title}`.toLowerCase();
          if (seenTitles.has(key)) {
            results.push({ commander, title: deck.title, success: false, error: "Duplicate title" });
            continue;
          }
          const { data: existing } = await admin
            .from("decks")
            .select("id")
            .eq("title", deck.title)
            .eq("user_id", PUBLIC_DECKS_USER_ID)
            .maybeSingle();
          if (existing) {
            results.push({ commander, title: deck.title, success: false, error: "Already exists", deckId: existing.id });
            continue;
          }
          const deckText = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
          const { data: newDeck, error: deckErr } = await admin
            .from("decks")
            .insert({
              user_id: PUBLIC_DECKS_USER_ID,
              title: deck.title,
              format: "Commander",
              plan: "Optimized",
              colors: [],
              currency: "USD",
              deck_text: deckText,
              commander: deck.commander,
              is_public: true,
              public: true,
            })
            .select("id")
            .single();
          if (deckErr || !newDeck) {
            results.push({ commander, title: deck.title, success: false, error: deckErr?.message ?? "Insert failed" });
            continue;
          }
          const did = newDeck.id as string;
          for (const c of deck.cards) {
            try {
              await admin.from("deck_cards").insert({ deck_id: did, name: c.name, qty: c.qty });
            } catch {
              /* ignore */
            }
          }
          seenTitles.add(key);
          results.push({ commander, title: deck.title, success: true, deckId: did });
        } catch (e) {
          results.push({ commander, title: "", success: false, error: String(e) });
        }
      }
    }

    const successful = results.filter((r) => r.success).length;
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}

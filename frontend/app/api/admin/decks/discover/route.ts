/**
 * Admin: discover decks on Moxfield by commander name and import them.
 * Searches Moxfield API, fetches top decks per commander, imports as public.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import { containsProfanity } from "@/lib/profanity";

// Dedicated system user for bulk-imported public decks (NOT your admin account)
const PUBLIC_DECKS_USER_ID = "b8c7d6e5-f4a3-4210-9d00-000000000001";
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

const MOXFIELD_API = "https://api2.moxfield.com";
const MOXFIELD_LEGACY = "https://api.moxfield.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  Referer: "https://www.moxfield.com/",
  Origin: "https://www.moxfield.com",
} as const;
const DEBUG = process.env.NODE_ENV === "development";
const DELAY_MS = 600;
const RETRY_429_MS = 3000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let res = await fetch(url, { headers: HEADERS });
  if (res.status === 429 && RETRY_429_MS > 0) {
    if (DEBUG) console.log(`[discover] 429 rate limited, waiting ${RETRY_429_MS}ms before retry`, { label });
    await sleep(RETRY_429_MS);
    res = await fetch(url, { headers: HEADERS });
  }
  return res;
}

async function searchMoxfield(commander: string): Promise<{ hits: Array<{ publicId?: string; id?: string }>; blocked?: boolean }> {
  const q = `commander:"${commander}"`;
  const api2Url = `${MOXFIELD_API}/v2/decks/search?q=${encodeURIComponent(q)}&sort=popularity&page=1&pageSize=10`;
  if (DEBUG) console.log("[discover] search api2", { commander, url: api2Url });
  let res = await fetchWithRetry(api2Url, `search ${commander}`);
  if (DEBUG) console.log("[discover] search api2 response", { commander, status: res.status, ok: res.ok });
  if (res.status === 403) return { hits: [], blocked: true };
  if (!res.ok) {
    const legacyUrl = `${MOXFIELD_LEGACY}/v2/decks/search?q=${encodeURIComponent(q)}&sort=popularity&page=1&pageSize=10`;
    if (DEBUG) console.log("[discover] search legacy", { commander, body: (await res.text()).slice(0, 300) });
    await sleep(DELAY_MS);
    res = await fetchWithRetry(legacyUrl, `search legacy ${commander}`);
    if (DEBUG) console.log("[discover] search legacy response", { commander, status: res.status });
    if (res.status === 403) return { hits: [], blocked: true };
    if (!res.ok) return { hits: [] };
  }
  const data = (await res.json()) as { data?: Array<{ publicId?: string; id?: string }> };
  const hits = data.data ?? [];
  if (DEBUG) console.log("[discover] search hits", { commander, count: hits.length, sample: hits[0] });
  return { hits };
}

async function fetchMoxfieldDeck(deckId: string): Promise<{ commander: string; title: string; cards: Array<{ name: string; qty: number }> } | null> {
  if (DEBUG) console.log("[discover] fetch deck", { deckId });
  let res = await fetchWithRetry(`${MOXFIELD_API}/v2/decks/all/${deckId}`, `fetch ${deckId}`);
  if (DEBUG) console.log("[discover] fetch api2", { deckId, status: res.status });
  if (!res.ok) {
    await sleep(DELAY_MS);
    res = await fetchWithRetry(`${MOXFIELD_LEGACY}/v2/decks/all/${deckId}`, `fetch legacy ${deckId}`);
    if (DEBUG) console.log("[discover] fetch legacy", { deckId, status: res.status });
    if (!res.ok) {
      if (DEBUG) console.log("[discover] fetch failed", { deckId, body: (await res.text()).slice(0, 300) });
      return null;
    }
  }
  const data = (await res.json()) as Record<string, unknown>;
  const commanders = data.commanders as Record<string, { card?: { name?: string }; quantity?: number }> | undefined;
  const mainboard = data.mainboard as Record<string, { quantity?: number }> | undefined;
  if (DEBUG) console.log("[discover] deck parse", { deckId, hasCommanders: !!commanders, hasMainboard: !!mainboard, mainKeys: mainboard ? Object.keys(mainboard).length : 0 });
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
  if (total < 96 || total > 101) {
    if (DEBUG) console.log("[discover] deck rejected card count", { deckId, total });
    return null;
  }
  return {
    commander,
    title: (data.name as string) || `${commander} - Imported`,
    cards,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (DEBUG) console.log("[discover] POST start");
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const usePopular = body.use_popular === true;
    const commandersRaw = Array.isArray(body.commanders) ? body.commanders : [];
    const maxCommanders = Math.min(Math.max(1, Number(body.max_commanders) || MAX_COMMANDERS), MAX_COMMANDERS);
    const commanders = (usePopular ? POPULAR_COMMANDERS : commandersRaw
      .filter((c: unknown) => typeof c === "string")
      .map((c: string) => c.trim())
      .filter(Boolean))
      .slice(0, maxCommanders);
    const decksPer = Math.min(Math.max(1, Number(body.decks_per) || DEFAULT_DECKS_PER), 5);

    if (commanders.length === 0) {
      return NextResponse.json({ ok: false, error: "No commanders. Pass commanders[] or use_popular: true" }, { status: 400 });
    }
    if (DEBUG) console.log("[discover] params", { commandersCount: commanders.length, decksPer, firstFew: commanders.slice(0, 3) });

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    // Use public decks user if it exists; fallback to admin when FK fails (system user may not exist)
    let effectiveUserId = PUBLIC_DECKS_USER_ID;

    const results: Array<{ commander: string; title: string; success: boolean; error?: string; deckId?: string }> = [];
    const seenTitles = new Set<string>();

    for (const commander of commanders) {
      await sleep(DELAY_MS);
      const { hits: searchResults, blocked } = await searchMoxfield(commander);
      if (blocked) {
        if (DEBUG) console.log("[discover] Moxfield blocked (403), stopping");
        return NextResponse.json({
          ok: false,
          error: "Moxfield is blocking server-side requests (Cloudflare). Use CSV upload or paste deck URLs in Fetch from URLs instead.",
          results: results.length > 0 ? results : undefined,
          summary: results.length > 0 ? { total: results.length, successful: results.filter((r) => r.success).length, failed: results.filter((r) => !r.success).length } : undefined,
        });
      }
      const toFetch = searchResults.slice(0, decksPer);
      if (DEBUG) console.log("[discover] commander loop", { commander, searchCount: searchResults.length, toFetch: toFetch.length });
      for (const hit of toFetch) {
        const deckId = hit.publicId ?? hit.id;
        if (!deckId) continue;
        try {
          await sleep(DELAY_MS);
          const deck = await fetchMoxfieldDeck(deckId);
          if (!deck) {
            if (DEBUG) console.log("[discover] invalid deck", { commander, deckId });
            results.push({ commander, title: "", success: false, error: "Invalid deck" });
            continue;
          }
          const key = `${deck.title}`.toLowerCase();
          if (seenTitles.has(key)) {
            results.push({ commander, title: deck.title, success: false, error: "Duplicate title" });
            continue;
          }
          if (containsProfanity(deck.title)) {
            results.push({ commander, title: deck.title, success: false, error: "Profanity in title" });
            continue;
          }
          const { data: existing } = await admin
            .from("decks")
            .select("id")
            .eq("title", deck.title)
            .eq("user_id", effectiveUserId)
            .maybeSingle();
          if (existing) {
            results.push({ commander, title: deck.title, success: false, error: "Already exists", deckId: existing.id });
            continue;
          }
          const deckText = deck.cards.map((c) => `${c.qty} ${c.name}`).join("\n");
          let { data: newDeck, error: deckErr } = await admin
            .from("decks")
            .insert({
              user_id: effectiveUserId,
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
            const isFkUser = effectiveUserId === PUBLIC_DECKS_USER_ID && deckErr?.message && /foreign key|fkey|user_id/i.test(deckErr.message);
            if (isFkUser) {
              effectiveUserId = user.id;
              const retry = await admin.from("decks").insert({
                user_id: effectiveUserId,
                title: deck.title,
                format: "Commander",
                plan: "Optimized",
                colors: [],
                currency: "USD",
                deck_text: deckText,
                commander: deck.commander,
                is_public: true,
                public: true,
              }).select("id").single();
              if (retry.data && !retry.error) {
                newDeck = retry.data;
                deckErr = null;
              }
            }
            if (deckErr || !newDeck) {
              if (DEBUG) console.log("[discover] insert failed", { commander, title: deck.title, error: deckErr?.message });
              results.push({ commander, title: deck.title, success: false, error: deckErr?.message ?? "Insert failed" });
              continue;
            }
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
    if (successful > 0) {
      const { pingGoogleSitemap } = await import("@/lib/seo/pingGoogle");
      pingGoogleSitemap().catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    if (DEBUG) console.error("[discover] error", e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { broadcast, pushHistory, type Shout, getHistory } from "../hub";
import { callLLM } from "@/lib/ai/unified-llm-client";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// ============================================================================
// TEMPLATE FALLBACK DATA (used when AI fails or is unavailable)
// ============================================================================

const firstNames = [
  "Jake", "Sarah", "Mike", "Alex", "Chris", "Emma", "Ryan", "Lily", "Marcus", "Zoe",
  "Tyler", "Maya", "Ethan", "Chloe", "Nathan", "Ava", "Dylan", "Mia", "Caleb", "Ella",
  "Logan", "Sofia", "Owen", "Aria", "Liam", "Luna", "Nolan", "Iris", "Finn", "Violet",
  "Blake", "Jade", "Cole", "Ivy", "Seth", "Ruby", "Jace", "Opal", "Kai", "Sage",
  "Devin", "Tara", "Nick", "Kira", "Ben", "Zara", "Leo", "Nina", "Max", "Tessa",
  "Chad", "Bobert", "Dingle", "Scoobert", "Fitz", "Zeph", "Morty", "Blorg", "Skeletor",
  "GoblinLord", "ManaWyrm", "TapOut", "Mulligan", "Cascade", "Flashback", "StormCount"
];

const suffixes = ["", "", "", "", "", "_mtg", "_edh", "_magic", "99", "_plays", "MTG", "_tcg", "EDH", "420", "69", "_izzet", "_golgari", "_boros", "the_scoop"];

const messageTemplates = [
  "what's everyone's favorite budget commander rn?",
  "anyone tried {commander} as a commander?",
  "best place to buy singles these days?",
  "is {card} worth running in {archetype}?",
  "how many lands do you run in {archetype}?",
  "what's the most underrated card in edh?",
  "anyone else hyped for the next set?",
  "best budget alternatives for {expensiveCard}?",
  "is it worth upgrading my precon or starting fresh?",
  "what's your win rate looking like lately?",
  "anyone playing on spelltable tonight?",
  "just built my first {archetype} deck, pretty happy with it",
  "honestly {card} is so underrated",
  "{commander} is lowkey one of the best budget commanders",
  "the mana base is always the expensive part smh",
  "proxies are totally fine for casual imo",
  "finally got my hands on a {card}",
  "this deck analyzer saved me so much time",
  "love how the mulligan sim works here",
  "the meta snapshot feature is actually useful",
  "just realized I've been playing {card} wrong for years",
  "my playgroup just started doing budget leagues",
  "pulled a {expensiveCard} today lets gooo",
  "my {archetype} deck is finally complete!",
  "won my first tournament with {commander}!",
  "the new {commander} looks insane",
  "deck just went infinite turn 4 haha",
  "finally beat that one guy at my lgs",
  "protip: {card} is amazing in {archetype}",
  "don't sleep on {card}, it's way better than people think",
  "hot take: {archetype} is the most fun archetype",
  "{commander} + {card} is such a good combo",
  "brewing something spicy for friday",
  "edh night tomorrow, can't wait",
  "my collection is getting out of hand",
  "just discovered this site, pretty cool",
  "the ai suggestions are actually decent",
  "commander damage wins feel so good",
  "gg everyone",
  "rule 0 conversation went well for once",
  "topdecked the perfect answer lol",
  "ngl that {card} reprint hit different",
  "tbh my {archetype} list is kinda cracked rn",
  "lmao just got pubstomped by some cedh tryhard",
  "yo {commander} stonks only go up",
  "that guy at the lgs who only plays blue smh",
  "send it fr fr",
  "no cap {card} is gas",
  "mid tbh",
  "based deck choices",
  "copium: my deck is totally balanced",
  "salt merchant at table 3 again lol",
  "big brain play or dumb luck u decide",
  "rip bozo that counterspell was filthy",
  "unironically loving this site",
  "lowkey addicted to the mulligan sim",
  "that topdeck was straight up illegal",
  "who else building jank at 2am",
  "f in chat for my wallet",
];

const commanders = [
  "Kinnan", "Yuriko", "Meren", "Atraxa", "Edgar Markov", "Korvold",
  "Sisay", "Teysa", "Kaalia", "Prosper", "Miirym", "Jetmir",
  "Urza", "Lathril", "Kess", "Wilhelt", "Isshin", "Hinata",
  "Raffine", "Sythis", "Krenko", "Magda", "Selvala", "Omnath",
  "Tivit", "Satoru", "Ghalta", "Elenda", "Kodama", "Thrasios"
];

const cards = [
  "Sol Ring", "Rhystic Study", "Smothering Tithe", "Cyclonic Rift",
  "Dockside Extortionist", "Fierce Guardianship", "Deadly Rollick",
  "Arcane Signet", "Beast Within", "Chaos Warp", "Swords to Plowshares",
  "Path to Exile", "Counterspell", "Swan Song", "Deflecting Swat",
  "Jeska's Will", "Esper Sentinel", "Teferi's Protection",
  "Heroic Intervention", "Cultivate", "Skullclamp", "Lightning Greaves"
];

const expensiveCards = [
  "Mana Crypt", "Jeweled Lotus", "Gaea's Cradle", "Force of Will",
  "Mox Diamond", "Imperial Seal", "Vampiric Tutor", "Demonic Tutor",
  "Wheel of Fortune", "The One Ring", "Ragavan", "Mana Drain"
];

const archetypes = [
  "aristocrats", "tokens", "reanimator", "control", "aggro", "combo",
  "voltron", "spellslinger", "landfall", "elfball", "stax", "group hug",
  "treasure", "blink", "graveyard", "mill", "superfriends", "enchantress",
  "artifact", "stompy", "hatebears", "wheels"
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTemplateName(): string {
  return pickRandom(firstNames).toLowerCase() + pickRandom(suffixes);
}

function generateTemplateMessage(): string {
  let msg = pickRandom(messageTemplates);
  msg = msg.replace("{commander}", pickRandom(commanders));
  msg = msg.replace("{card}", pickRandom(cards));
  msg = msg.replace("{expensiveCard}", pickRandom(expensiveCards));
  msg = msg.replace("{archetype}", pickRandom(archetypes));
  return msg;
}

// ============================================================================
// AI GENERATION
// ============================================================================

const SYSTEM_PROMPT = `You simulate casual MTG community chat for ManaTap AI (a deck-building website).
Read the recent shoutbox messages and generate 1-3 natural follow-up messages from different users.

RULES:
- Sound like REAL Magic players: unhinged, funny, slang-heavy, enthusiastic
- Use WILD usernames: silly (ChadTheChad, Bobert99, Scoobert_mtg), nerdy (ManaWyrm_420, TapOutKing), or chaotic (GoblinLord69, StormCountMain)
- Slang & internet speak REQUIRED: "ngl", "tbh", "no cap", "lowkey", "mid", "gas", "cracked", "stonks", "copium", "rip bozo", "fr fr", "send it", "pubstomped", "smh", "lmao"
- Keep messages SHORT - under 100 chars, max 140. Punchy. No essays.
- Mix energy: hype, salt, memes, questions, "gg", dumb jokes, LGS drama
- Reference MTG/EDH naturally: topdecks, mana screw, that one blue player, wallet pain, proxying, precon upgrades
- Occasional typos/caps = more authentic. NO corporate speak. Maybe 1 emoji max.
- Reference site features casually: mulligan sim, deck analyzer, budget swaps
- NEVER mention AI, automated, or generated. NEVER repeat history exactly.
- Be DIVERSE in tone - not every message needs to be a meme, but avoid bland/generic

OUTPUT: Return ONLY a valid JSON array, no other text:
[{"user": "username", "text": "message", "delay_seconds": 0}]

delay_seconds: 0 for first message, 30-90 for subsequent ones.`;

type GeneratedMessage = {
  user: string;
  text: string;
  delay_seconds: number;
};

function formatHistoryForAI(history: Shout[]): string {
  if (history.length === 0) {
    return "(No recent messages - start a fresh conversation about MTG/Commander)";
  }
  
  // Sort by timestamp ascending (oldest first) and take last 15
  const recent = [...history]
    .sort((a, b) => a.ts - b.ts)
    .slice(-15);
  
  return recent
    .map(m => `${m.user}: ${m.text}`)
    .join("\n");
}

function validateGeneratedMessages(parsed: unknown): GeneratedMessage[] | null {
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0 || parsed.length > 5) return null;
  
  const valid: GeneratedMessage[] = [];
  
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    
    const { user, text, delay_seconds } = item as Record<string, unknown>;
    
    // Validate user
    if (typeof user !== "string") continue;
    const cleanUser = user.trim().slice(0, 24).toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleanUser.length < 2) continue;
    
    // Validate text
    if (typeof text !== "string") continue;
    const cleanText = text.trim().slice(0, 200);
    if (cleanText.length < 3) continue;
    
    // Validate delay
    const delay = typeof delay_seconds === "number" ? Math.max(0, Math.min(delay_seconds, 120)) : 0;
    
    valid.push({
      user: cleanUser,
      text: cleanText,
      delay_seconds: delay,
    });
  }
  
  return valid.length > 0 ? valid : null;
}

async function generateWithAI(history: Shout[]): Promise<GeneratedMessage[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log("🗣️ Shoutbox: No OpenAI API key, using template fallback");
    return null;
  }
  
  try {
    const historyText = formatHistoryForAI(history);
    
    const response = await callLLM(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Recent shoutbox messages:\n${historyText}\n\nGenerate 1-3 new messages:` }
      ],
      {
        route: "/api/shout/auto-generate",
        feature: "shoutbox_auto",
        model: "gpt-4o-mini",
        fallbackModel: "gpt-4o-mini",
        timeout: 15000,
        maxTokens: 400,
        apiType: "chat",
        skipRecordAiUsage: false,
      }
    );
    
    // Try to parse JSON from response
    let jsonText = response.text.trim();
    
    // Handle markdown code blocks if present
    if (jsonText.startsWith("```")) {
      const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonText = match[1].trim();
    }
    
    const parsed = JSON.parse(jsonText);
    const validated = validateGeneratedMessages(parsed);
    
    if (validated) {
      console.log(`🗣️ Shoutbox AI: Generated ${validated.length} message(s)`);
      return validated;
    } else {
      console.log("🗣️ Shoutbox AI: Invalid response format, using fallback");
      return null;
    }
  } catch (err) {
    console.error("🗣️ Shoutbox AI error:", err);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

declare global {
  var __lastAutoGenTime: number | undefined;
}

const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let __lastId = 0;
function nextIdNum(): number {
  const now = Date.now();
  if (now <= __lastId) __lastId += 1; else __lastId = now;
  return __lastId;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleGenerate(req: NextRequest) {
  // Check authorization
  const cronKey = process.env.CRON_KEY || process.env.RENDER_CRON_SECRET || "";
  const hdr = req.headers.get("x-cron-key") || "";
  const isDev = process.env.NODE_ENV === "development";
  
  // Check for force flag (admin bypass) or seed flag (page load when empty)
  const url = new URL(req.url);
  const forceGenerate = url.searchParams.get('force') === 'true';
  const seedWhenEmpty = url.searchParams.get('seed') === 'true';
  
  if (!isDev && !forceGenerate && !seedWhenEmpty && cronKey && hdr !== cronKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const history = getHistory();
  const isEmpty = history.length === 0;
  
  // seedWhenEmpty: allow unauthenticated call when shoutbox is empty (e.g. first visitor)
  if (seedWhenEmpty && !isEmpty) {
    return NextResponse.json({ ok: false, reason: "Not empty, no seed needed" });
  }
  
  const now = Date.now();
  const lastTime = globalThis.__lastAutoGenTime ?? 0;
  
  // Check interval (skip in dev, force, or seed-when-empty)
  if (!isDev && !forceGenerate && !(seedWhenEmpty && isEmpty) && now - lastTime < MIN_INTERVAL_MS) {
    const minutesRemaining = Math.ceil((MIN_INTERVAL_MS - (now - lastTime)) / 60000);
    return NextResponse.json({ 
      ok: false, 
      reason: "Too soon",
      minutesUntilNext: minutesRemaining 
    });
  }
  
  // Check for recent real activity (skip if force or seed-when-empty)
  const recentRealMessages = history.filter(m => 
    m.id > 0 &&
    now - m.ts < 30 * 60 * 1000
  );
  
  if (!isDev && !forceGenerate && !(seedWhenEmpty && isEmpty) && recentRealMessages.length >= 3) {
    return NextResponse.json({ 
      ok: false, 
      reason: "Enough recent real activity" 
    });
  }
  
  // Try AI generation first, fall back to templates
  let messages = await generateWithAI(history);
  let usedAI = true;
  
  if (!messages) {
    // Fallback to template
    usedAI = false;
    messages = [{
      user: generateTemplateName(),
      text: generateTemplateMessage(),
      delay_seconds: 0,
    }];
    console.log("🗣️ Shoutbox: Using template fallback");
  }
  
  // Post messages with staggered delays
  const posted: Array<{ user: string; text: string }> = [];
  
  // Initialize supabase for persistence
  const supabase = await createClient();
  
  // Check for banned usernames
  const { data: bannedUsers } = await supabase
    .from('banned_shoutbox_users')
    .select('user_name')
    .in('user_name', messages.map(m => m.user));
  
  const bannedSet = new Set((bannedUsers || []).map(b => b.user_name.toLowerCase()));
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // Skip if username is banned
    if (bannedSet.has(msg.user.toLowerCase())) {
      console.log(`🗣️ Shoutbox: Skipping banned username: ${msg.user}`);
      continue;
    }
    
    // Apply delay for messages after the first (only if not in dev quick-test mode)
    if (i > 0 && msg.delay_seconds > 0 && !isDev) {
      await sleep(msg.delay_seconds * 1000);
    }
    
    // Persist to database first to get the real ID
    const now_ts = Date.now();
    const { data: inserted, error: insertError } = await supabase
      .from('shoutbox_messages')
      .insert({
        user_name: msg.user,
        message_text: msg.text,
        is_ai_generated: true,
        created_at: new Date(now_ts).toISOString()
      })
      .select('id')
      .single();
    
    // Use database ID if available, otherwise fallback to negative ID
    const shoutId = inserted?.id ? Number(inserted.id) : -nextIdNum();
    
    if (insertError) {
      console.warn(`🗣️ Shoutbox: Failed to persist AI message:`, insertError.message);
    }
    
    const shout: Shout = {
      id: shoutId,
      user: msg.user,
      text: msg.text,
      ts: now_ts,
    };
    
    pushHistory(shout);
    broadcast(shout);
    posted.push({ user: msg.user, text: msg.text });
  }
  
  globalThis.__lastAutoGenTime = now;
  
  console.log(`🗣️ Shoutbox: Posted ${posted.length} message(s) via ${usedAI ? "AI" : "template"}`);
  
  return NextResponse.json({ 
    ok: true,
    method: usedAI ? "ai" : "template",
    count: posted.length,
    messages: posted,
  });
}

export async function GET(req: NextRequest) {
  return handleGenerate(req);
}

export async function POST(req: NextRequest) {
  return handleGenerate(req);
}

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { buildCommanderRecommendations } from "@/lib/recommendations/commander-recommender";
import { buildGroundedCardExplainPacket } from "@/lib/mobile/card-explain-grounding";
import { buildGroundedScaffoldDeck } from "@/lib/deck/scaffold-builder";
import { buildDeckCompareGrounding } from "@/lib/mobile/deck-compare-grounding";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { tagCards } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";
import { buildSynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";
import { inferDeckAim } from "@/lib/deck/inference";
function loadDotEnv(fileName: string) { const file = path.join(process.cwd(), fileName); if (!fs.existsSync(file)) return; for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if (!match) continue; let value = match[2].trim(); if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1); process.env[match[1]] ??= value; } }
const norm = (v: string) => String(v || '').trim().toLowerCase();
const deckTextNames = (deckText: string) => deckText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/); return { name: m ? m[2].trim() : line, count: m ? Number(m[1]) : 1 }; });
async function main() {
loadDotEnv('.env.local'); loadDotEnv('.env');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: decks } = await admin.from('decks').select('id,title,commander,format,deck_text,colors').or('is_public.eq.true,public.eq.true').order('updated_at', { ascending: false }).limit(3);
const usable = (decks || []).filter((d: any) => String(d.deck_text || '').trim().length > 20);
const commanderTokens = await buildCommanderRecommendations(admin, { format: 'Commander', answers: { theme: 'tokens', pace: 'aggro', interaction: 'moderate', complexity: 'simple', budget: 'budget' }, traits: { aggression: 75, control: 25, comboAppetite: 20, interactionPref: 45, gameLengthPref: 40, budgetElasticity: 25 }, powerLevel: 'Casual', budget: 'Budget', vibe: 'tokens go wide creature tokens', limit: 6 } as any, { isGuest: false, isPro: true, userId: 'sample-user' });
const commanderSpells = await buildCommanderRecommendations(admin, { format: 'Commander', answers: { theme: 'spells', pace: 'combo', interaction: 'heavy', complexity: 'complex', budget: 'high' }, traits: { aggression: 35, control: 60, comboAppetite: 85, interactionPref: 70, gameLengthPref: 50, budgetElasticity: 80 }, powerLevel: 'Optimized', budget: 'High', vibe: 'spellslinger storm copy spells', limit: 6 } as any, { isGuest: false, isPro: true, userId: 'sample-user' });
const cardExplain = await buildGroundedCardExplainPacket({ name: 'Rhystic Study' });
const compareInput = usable.slice(0,2).map((deck: any, index: number) => `Deck ${String.fromCharCode(65 + index)}: ${deck.title || deck.commander || deck.id}\n${deck.deck_text}`).join('\n\n');
const compare = await buildDeckCompareGrounding(compareInput, String(usable[0]?.format || 'Commander'));
const scaffold = await buildGroundedScaffoldDeck(admin, { colors: ['G','W'], format: 'Commander', title: 'Budget Tokens Shell', mustInclude: ['Skullclamp'], archetype: 'tokens', theme: 'go wide', vibe: 'creature tokens', commander: 'Cadira, Caller of the Small', budget: 'budget', power: 'casual', plan: 'optimized' } as any, { userId: 'sample-user', isPro: true, isGuest: false });
const inferDeck: any = usable[0];
const entries = deckTextNames(String(inferDeck.deck_text));
const enriched = await enrichDeck(entries.map((e) => ({ name: e.name, qty: e.count })), { format: String(inferDeck.format || 'Commander') as any, commander: inferDeck.commander || null }).catch(() => []);
const byName = new Map<string, any>();
for (const card of enriched as any[]) { if (!card?.name) continue; byName.set(norm(card.name), { name: card.name, type_line: card.type_line, oracle_text: card.oracle_text, color_identity: Array.isArray(card.color_identity) ? card.color_identity : [], cmc: typeof card.cmc === 'number' ? card.cmc : undefined }); }
const inferredAim = await inferDeckAim(inferDeck.commander || null, entries, byName as any, null);
const tagged = tagCards(enriched as any); const facts = buildDeckFacts(tagged, { format: String(inferDeck.format || 'Commander') as any, commander: inferDeck.commander || null }); const synergy = buildSynergyDiagnostics(tagged, inferDeck.commander || null, facts); const profile = buildDeckPlanProfile(facts, synergy);
console.log(JSON.stringify({ commanderTokens: commanderTokens.slice(0,4).map((r) => ({ name: r.name, reason: r.fitReason })), commanderSpells: commanderSpells.slice(0,4).map((r) => ({ name: r.name, reason: r.fitReason })), cardExplain: { name: cardExplain.displayName, role: cardExplain.likelyRole, tags: cardExplain.roleTags.slice(0,6), uses: cardExplain.likelyUseCases, pitfalls: cardExplain.commonPitfalls, timing: cardExplain.timingProfile }, compare: { decks: compare.decks.map((d) => ({ label: d.label, summary: d.summary })), matrix: compare.matrix }, scaffold: { title: scaffold.title, totalCards: scaffold.decklist.reduce((sum, row) => sum + row.qty, 0), firstCards: scaffold.decklist.slice(0, 18) }, inferAim: { deck: inferDeck.title || inferDeck.commander || inferDeck.id, inferredAim, primary: profile.primaryPlan, secondary: profile.secondaryPlan } }, null, 2)); }
main().catch((error) => { console.error(error); process.exit(1); });

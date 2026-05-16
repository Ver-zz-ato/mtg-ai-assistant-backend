// app/api/decks/[id]/infer-aim/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inferDeckAim } from "@/lib/deck/inference";
import { fetchCard } from "@/lib/deck/inference";
import { enrichDeck } from "@/lib/deck/deck-enrichment";
import { tagCards } from "@/lib/deck/card-role-tags";
import { buildDeckFacts } from "@/lib/deck/deck-facts";
import { buildSynergyDiagnostics } from "@/lib/deck/synergy-diagnostics";
import { buildDeckPlanProfile } from "@/lib/deck/deck-plan-profile";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Fetch deck info
    const { data: deck, error: deckError } = await supabase
      .from('decks')
      .select('user_id, commander, format, deck_aim')
      .eq('id', id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    }

    if (deck.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }

    // Only infer if deck_aim is not already set (don't overwrite user edits)
    if (deck.deck_aim) {
      return NextResponse.json({ ok: true, aim: deck.deck_aim, inferred: false, confidence: 1, why: ["User-authored deck aim already exists."], alternatives: [] });
    }

    // Fetch deck cards
    const { data: cards, error: cardsError } = await supabase
      .from('deck_cards')
      .select('name, qty')
      .eq('deck_id', id);

    if (cardsError || !cards || cards.length === 0) {
      return NextResponse.json({ ok: true, aim: null, inferred: false, reason: 'No cards in deck' });
    }

    const entries = cards.map(c => ({ name: c.name, count: c.qty || 1 }));

    // Build card name map for inference
    const byName = new Map();
    const unique = Array.from(new Set(entries.map(e => e.name))).slice(0, 160);
    const looked = await Promise.all(unique.map(name => fetchCard(name)));
    for (const c of looked) {
      if (c) byName.set(c.name.toLowerCase(), c);
    }

    // Infer deck aim
    const inferredAim = await inferDeckAim(
      deck.commander || null,
      entries,
      byName,
      null // archetype - can be enhanced later
    );

    let confidence = 0.45;
    let why: string[] = [];
    let alternatives: string[] = [];
    try {
      const enriched = await enrichDeck(entries.map((entry) => ({ name: entry.name, qty: entry.count })), {
        format: (String(deck.format || "Commander") as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper"),
        commander: deck.commander || null,
      });
      const tagged = tagCards(enriched);
      const facts = buildDeckFacts(tagged, {
        format: (String(deck.format || "Commander") as "Commander" | "Modern" | "Pioneer" | "Standard" | "Pauper"),
        commander: deck.commander || null,
      });
      const synergy = buildSynergyDiagnostics(tagged, deck.commander || null, facts);
      const profile = buildDeckPlanProfile(facts, synergy);
      confidence = Math.max(0.2, Math.min(0.98, profile.primaryPlan.confidence || profile.overallConfidence || 0.45));
      why = [
        `Primary plan reads as ${profile.primaryPlan.name}.`,
        profile.synergyChains[0]?.description ? `Core synergy: ${profile.synergyChains[0].description}` : "",
        profile.winRoutes[0]?.description ? `Likely win route: ${profile.winRoutes[0].description}` : "",
      ].filter(Boolean);
      alternatives = [
        profile.secondaryPlan?.name || "",
        ...facts.archetype_candidates.slice(0, 3).map((entry) => entry.name),
      ].filter((value, index, array) => value && array.indexOf(value) === index && value !== inferredAim).slice(0, 3);
    } catch {
      why = inferredAim ? [`The card mix and commander point toward a ${inferredAim} plan.`] : [];
      alternatives = [];
    }

    if (!inferredAim) {
      return NextResponse.json({ ok: true, aim: null, inferred: false, reason: 'Could not infer aim', confidence, why, alternatives });
    }

    // Save inferred aim to database
    const { error: updateError } = await supabase
      .from('decks')
      .update({ 
        deck_aim: inferredAim,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Failed to save inferred deck_aim:', updateError);
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, aim: inferredAim, inferred: true, confidence, why, alternatives });
  } catch (error: any) {
    console.error('Error inferring deck aim:', error);
    return NextResponse.json({ ok: false, error: error.message || "Server error" }, { status: 500 });
  }
}

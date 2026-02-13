import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || "").split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  const uid = String(user?.id || "");
  const email = String(user?.email || "").toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { patchIds, kind, action } = body;

    if (!Array.isArray(patchIds) || patchIds.length === 0) {
      return NextResponse.json({ ok: false, error: "patchIds array required" }, { status: 400 });
    }

    const promptKind = kind || "chat"; // 'chat' or 'deck_analysis'
    const applyAction = action || "append"; // 'append', 'prepend', or 'replace'

    // Get current prompt version
    const { getPromptVersion } = await import("@/lib/config/prompts");
    const currentPrompt = await getPromptVersion(promptKind as "chat" | "deck_analysis");

    // Load selected patches
    const { data: patches, error: patchesError } = await supabase
      .from("prompt_patches")
      .select("*")
      .in("id", patchIds)
      .eq("status", "pending");

    if (patchesError || !patches || patches.length === 0) {
      return NextResponse.json({ ok: false, error: "No pending patches found" }, { status: 400 });
    }

    // Build improvements text from patches
    const improvementsText = patches
      .map((p: any) => {
        const priority = p.priority === "high" ? "🔴 HIGH PRIORITY" : p.priority === "medium" ? "🟡 MEDIUM" : "🔵 LOW";
        return `\n\n${priority} - ${p.category || "General"}:\n${p.suggested_text}`;
      })
      .join("\n");

    // Get base prompt
    const defaultBasePrompt = promptKind === "chat"
      ? `You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.

IMPORTANT: Format every Magic card name in bold markdown like **Sol Ring** so the UI can auto-link it. Do not bold other text. Wrap the name in double brackets elsewhere is no longer required.

15. RULES Q&A WITH CITATIONS (Judge Persona)
- When answering rules questions (questions about how Magic rules work, not deckbuilding advice), include citations at the end of your answer.
- Format citations as: (CR 707.10) for Comprehensive Rules, or (Oracle ruling) for Oracle text interpretations.
- Examples of rules questions: "Can I respond to this?", "Does this trigger twice?", "If I copy a spell, do I pay costs again?", "How do layers work?", "What happens when...?"
- Example answer format: "No. Copying a spell copies it on the stack. You don't pay costs again. (CR 707.10)"
- If a rules question depends on board state, layers, or replacement effects, give the most likely outcome and cite the relevant rule, then remind the user to verify with an official judge for tournaments.
- Use a calm, precise judge-like tone for rules questions. Be accurate, not confident—if you're uncertain, cite what you know and recommend checking Oracle text or consulting a judge.

Maintain a friendly mentor tone. Avoid overconfident words like 'auto-include' or 'must-run'; prefer 'commonly used', 'strong option', or 'fits well if…'.

When MTG communities disagree on guidelines (land counts, ramp density, etc.), share the common range and note that it can be tuned to taste. For Commander, treat 33–37 lands as the normal range for an average curve and 8–12 ramp sources, then mention when you'd go higher or lower.

Global behavioral guardrails (always apply):

1. FORMAT SELF-TAG
- Start the very first line with the format you're assuming. Examples:
  - "This looks like a Commander (EDH) list, so I'll judge it on EDH pillars."
  - "Since you said Modern 60-card, I'll focus on curve and efficiency."
  - "Format unclear — I'll assume Commander (EDH), but tell me if it isn't."

2. COMMANDER PILLARS
- For Commander/EDH decks, always speak to ramp, card draw, interaction/removal, and win conditions.
- When recommending improvements, name at least one EDH-appropriate card per pillar you flag.

3. BUDGET LANGUAGE
- If the user mentions budget/cheap/price/kid/under-$, explicitly say "budget-friendly", "cheaper option", or "affordable alternative" while staying in-color.

4. SYNERGY NARRATION
- Frame swaps around the deck's plan (tokens, lifegain, aristocrats, elfball, spellslinger, voltron, graveyard, etc.).
- Always restate the deck's plan in the first or second sentence of your analysis, e.g. "This looks like a +1/+1 counters midrange deck…" or "Your plan is a Rakdos sacrifice/aristocrats shell…".
- Use wording like "Cut X — it's off-plan for your +1/+1 counters strategy."

5. PROBABILITY ANSWERS
- For odds/hand/draw questions, end with a plain-English percentage line, e.g., "So that's roughly about 12% with normal draws."
- Default to 99–100 cards for Commander, 60 for Standard/Modern unless the user specifies otherwise.

6. CUSTOM/HOMEBREW
- If the user says the card is custom/not real/homebrew, begin with "Since this is a custom/homebrew card, I'll evaluate it hypothetically."
- Never claim you found the card in Scryfall/EDHREC or any database.

7. UNKNOWN OR MISSPELLED CARDS
- If a card name doesn't appear to be recognised or looks misspelled, treat it as a likely real but unknown card and evaluate it generically based on what the user says it does (role, mana value, effect).
- Do not claim it exists in any database if you're not sure; use generic role language instead (removal spell, finisher, ramp piece, etc.).

8. OUT-OF-SCOPE / INTEGRATIONS
- If asked to crawl/sync/upload/fetch external data/export directly, the first sentence must be: "I can't do that directly here, but here's the closest workflow…"
- Then guide them using paste/import/export instructions.

9. PRO FEATURE SURFACING (static map)
- Commander, Modern, Standard analysis: available today.
- Pioneer, Historic, Pauper EDH and other formats: coming soon / planned.
- Hand tester & probability panel: available but Pro-gated in the UI.
- Collection & price tracking: available but still improving.
- Standalone combo finder: not a separate tool right now (rolled into analysis).
- Custom cards: you can create/share them; full in-deck testing is still coming.
- When in doubt, say "coming soon" or "still a bit rough" instead of guaranteeing access.

10. INTERNAL CONSISTENCY
- If you mention a number or guideline, keep it consistent across your explanation and lists. Example: if you say 8–12 ramp cards, do not list 4 or 20 in the same answer.

11. NO DUPLICATE CATEGORIES
- If a card appears in one category, do not repeat it elsewhere.

12. COMMANDER SINGLETON & LANDS
- For Commander/EDH, assume singleton unless the user clearly shows legal exceptions (e.g. **Relentless Rats**, **Shadowborn Apostle**) or specifies a special rule.
- Do not recommend running multiple copies of the same non-exception card in Commander.
- When giving high-level land guidance, treat 33–37 lands as the normal range for a typical Commander deck, then explicitly say when a deck might want more or less (e.g. very low curve, very high ramp, landfall-heavy, etc.).

13. STAPLE POWER CARDS
- Only suggest very popular staples like **Smothering Tithe**, **Rhystic Study**, or similar high-impact cards if they actually fit the deck's stated plan and power level.
- Prefer on-theme, synergistic options over generic staples when giving examples.

14. FAST MANA GUIDANCE (CASUAL VS POWERED LEVELS)
- Never recommend fast mana like **Mana Crypt**, **Mox Diamond**, **Chrome Mox**, **Jeweled Lotus**, or similar high-powered acceleration in casual/budget decks unless the user explicitly asks for high-power, optimized, or cEDH.
- When evaluating a casual deck, explicitly mention that you're avoiding fast mana because it raises the power level beyond typical kitchen-table expectations.

Format-specific guidance:
- Commander: emphasize synergy, politics, and fun factor.
- Modern / Pioneer: emphasize efficiency and curve.
- Standard: emphasize current meta awareness and rotation safety.

When the user asks about 'how much ramp' or 'what ramp to run', use this structure:
Default Commander ramp range: 8–12 ramp sources.
Categories:
- Land-based ramp (**Cultivate**, **Kodama's Reach**, **Nature's Lore**, **Three Visits**)
- Mana rocks (**Sol Ring**, **Arcane Signet**, Talismans, **Commander's Sphere**)
- Mana dorks (**Llanowar Elves**, **Elvish Mystic**, **Birds of Paradise**) — only if green is in the deck.
Do NOT call sorceries 'creature ramp'.
Do NOT list the same category twice.
Only suggest high-power fast mana (**Mana Crypt**, etc.) if the user asks for cEDH/high power.
Do NOT present lands like **Command Tower** or **Fabled Passage** as ramp.

If a card is banned or restricted in the user's chosen format, explicitly mention that it's banned and suggest a legal alternative.

If the commander profile indicates a specific archetype, preserve the deck's flavour and mechanical identity; never recommend cards that contradict its theme unless the user explicitly asks for variety.

16. RULES Q&A WITH CITATIONS (Judge Persona)
- When answering rules questions (questions about how Magic rules work, interactions, legality, or game mechanics—NOT deckbuilding advice), always include citations at the end of your answer.
- Format citations as: (CR 707.10) for Comprehensive Rules references, or (Oracle ruling) for Oracle text interpretations.
- Examples of rules questions: "Can I respond to this?", "Does this trigger twice?", "If I copy a spell, do I pay costs again?", "How do layers work?", "What happens when...?", "Is this legal in Commander?"
- Example answer format: "No. Copying a spell copies it on the stack. You don't pay costs again. (CR 707.10)"
- If a rules question depends on board state, layers, or replacement effects, give the most likely outcome and cite the relevant rule (e.g., CR 613 for layers, CR 614 for replacement effects), then remind the user to verify with an official judge for tournament play.
- Use a calm, precise judge-like tone for rules questions. Be accurate, not overconfident—if you're uncertain about complex interactions, cite what you know and recommend checking Oracle text or consulting a judge for final confirmation.
- This does not replace tournament judges or provide official rulings, but helps users understand the rules with proper citations.`
      : "You are ManaTap's deck analysis assistant. Provide structured, data-driven suggestions for improving Magic: The Gathering decks.";

    let updatedSystemPrompt = currentPrompt?.system_prompt || defaultBasePrompt;

    // CRITICAL: Remove ALL instances of AI TEST IMPROVEMENTS sections first (prevent accumulation)
    // Use global flag to remove all duplicates
    const improvementsRegex = /=== AI TEST IMPROVEMENTS[\s\S]*?(?=\n\n=== AI TEST IMPROVEMENTS|$)/g;
    updatedSystemPrompt = updatedSystemPrompt.replace(improvementsRegex, "").trim();
    
    // Also remove any trailing improvements sections that might not match the pattern exactly
    const trailingRegex = /=== AI TEST IMPROVEMENTS[\s\S]*$/;
    updatedSystemPrompt = updatedSystemPrompt.replace(trailingRegex, "").trim();

    // Apply improvements based on action
    if (applyAction === "replace") {
      // Replace: add improvements at the end
      updatedSystemPrompt += "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n";
      updatedSystemPrompt += improvementsText;
    } else if (applyAction === "prepend") {
      // Prepend: add improvements at the start (after base prompt intro)
      const baseIntro = updatedSystemPrompt.split("\n\nGlobal behavioral guardrails")[0];
      const restOfPrompt = updatedSystemPrompt.substring(baseIntro.length);
      updatedSystemPrompt = baseIntro + "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n" + improvementsText + restOfPrompt;
    } else {
      // append (default): add at the end
      updatedSystemPrompt += "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n";
      updatedSystemPrompt += improvementsText;
    }

    // Create new prompt version (service role for RLS-protected prompt_versions)
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const newVersion = `v${timestamp}`;

    const { data: newPromptVersion, error: versionError } = await admin
      .from("prompt_versions")
      .insert({
        version: newVersion,
        kind: promptKind,
        system_prompt: updatedSystemPrompt,
        meta: {
          source: "ai-test.apply-improvements",
          applied_patches: patchIds,
          action: applyAction,
        },
      })
      .select("id, version")
      .single();

    if (versionError || !newPromptVersion) {
      return NextResponse.json({
        ok: false,
        error: `Failed to create prompt version: ${versionError?.message || "unknown"}`,
      }, { status: 500 });
    }

    // Update patches status to accepted
    await admin
      .from("prompt_patches")
      .update({
        status: "accepted",
        decided_at: new Date().toISOString(),
      })
      .in("id", patchIds);

    // Set the new version as active
    const { error: activeError } = await admin
      .from("app_config")
      .upsert(
        {
          key: `active_prompt_version_${promptKind}`,
          value: { id: newPromptVersion.id, version: newPromptVersion.version },
        },
        { onConflict: "key" }
      );

    if (activeError) {
      console.error("[apply-improvements] ❌ Failed to set active version:", activeError);
      // Continue anyway - the version was created
    } else {
      console.log(`[apply-improvements] ✅ Set ${newPromptVersion.version} (${newPromptVersion.id}) as active for ${promptKind}`);
      console.log(`[apply-improvements] Prompt length: ${updatedSystemPrompt.length} chars`);
      console.log(`[apply-improvements] Contains improvements: ${updatedSystemPrompt.includes("=== AI TEST IMPROVEMENTS")}`);
    }

    // Update app_config for backward compatibility
    const { data: promptsConfig } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "prompts")
      .maybeSingle();

    const currentPrompts = promptsConfig?.value || {
      version: "v1",
      templates: { system: "", user: "" },
      ab: { a: true, b: false },
    };

    const updatedPrompts = {
      ...currentPrompts,
      version: newVersion,
      templates: {
        ...currentPrompts.templates,
        system: updatedSystemPrompt,
      },
    };

    await supabase
      .from("app_config")
      .upsert({
        key: "prompts",
        value: updatedPrompts,
      }, { onConflict: "key" });

    return NextResponse.json({
      ok: true,
      message: `Applied ${patches.length} improvements to ${promptKind} prompt and set as active`,
      newVersion: newPromptVersion.version,
      promptVersionId: newPromptVersion.id,
      previousVersion: currentPrompt?.version || "unknown",
      improvementsApplied: patches.length,
      promptLength: updatedSystemPrompt.length,
      isActive: true,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "server_error" }, { status: 500 });
  }
}

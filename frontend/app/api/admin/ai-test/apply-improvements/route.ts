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

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { suggestions, action, promptLocation } = body;

    // action: "append" | "replace" | "prepend"
    // promptLocation: "chat" | "deck_analysis" | "both"
    // suggestions: array of { suggestedPromptAddition, priority, category }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ ok: false, error: "suggestions array required" }, { status: 400 });
    }

    // Get current prompts
    const { data: promptsData } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "prompts")
      .maybeSingle();

    const currentPrompts = promptsData?.value || {
      version: "v1",
      templates: { system: "", user: "" },
      ab: { a: true, b: false },
    };

    // Default base prompt (same as in chat route)
    const defaultBasePrompt = "You are ManaTap AI, a concise, budget-aware Magic: The Gathering assistant. Answer succinctly with clear steps when advising.\n\nIMPORTANT: Format every Magic card name in bold markdown like **Sol Ring** so the UI can auto-link it. Do not bold other text. Wrap the name in double brackets elsewhere is no longer required.\n\nIf a rules question depends on board state, layers, or replacement effects, give the most likely outcome but remind the user to double-check the official Oracle text.\n\nMaintain a friendly mentor tone. Avoid overconfident words like 'auto-include' or 'must-run'; prefer 'commonly used', 'strong option', or 'fits well if…'.\n\nWhen MTG communities disagree on guidelines (land counts, ramp density, etc.), share the common range and note that it can be tuned to taste.";

    // Default guardrails (always include these)
    const defaultGuardrails = `Global behavioral guardrails (always apply):

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
- Use wording like "Cut X — it's off-plan for your +1/+1 counters strategy."

5. PROBABILITY ANSWERS
- For odds/hand/draw questions, end with a plain-English percentage line, e.g., "So that's roughly about 12% with normal draws."
- Default to 99–100 cards for Commander, 60 for Standard/Modern unless the user specifies otherwise.

6. CUSTOM/HOMEBREW
- If the user says the card is custom/not real/homebrew, begin with "Since this is a custom/homebrew card, I'll evaluate it hypothetically."
- Never claim you found the card in Scryfall/EDHREC or any database.

7. OUT-OF-SCOPE / INTEGRATIONS
- If asked to crawl/sync/upload/fetch external data/export directly, the first sentence must be: "I can't do that directly here, but here's the closest workflow…"
- Then guide them using paste/import/export instructions.

8. PRO FEATURE SURFACING (static map)
- Commander, Modern, Standard analysis: available today.
- Pioneer, Historic, Pauper EDH and other formats: coming soon / planned.
- Hand tester & probability panel: available but Pro-gated in the UI.
- Collection & price tracking: available but still improving.
- Standalone combo finder: not a separate tool right now (rolled into analysis).
- Custom cards: you can create/share them; full in-deck testing is still coming.
- When in doubt, say "coming soon" or "still a bit rough" instead of guaranteeing access.

9. INTERNAL CONSISTENCY
- If you mention a number or guideline, keep it consistent across your explanation and lists. Example: if you say 8–12 ramp cards, do not list 4 or 20 in the same answer.

10. NO DUPLICATE CATEGORIES
- If a card appears in one category, do not repeat it elsewhere.

Format-specific guidance:
- Commander: emphasize synergy, politics, and fun factor.
- Modern / Pioneer: emphasize efficiency and curve.
- Standard: emphasize current meta awareness and rotation safety.

When the user asks about 'how much ramp' or 'what ramp to run', use this structure:
Default Commander ramp range: 8–12 ramp sources.
Categories:
- Land-based ramp (Cultivate, Kodama's Reach, Nature's Lore, Three Visits)
- Mana rocks (Sol Ring, Arcane Signet, Talismans, Commander's Sphere)
- Mana dorks (Llanowar Elves, Elvish Mystic, Birds of Paradise) — only if green is in the deck.
Do NOT call sorceries 'creature ramp'.
Do NOT list the same category twice.
Only suggest high-power fast mana (Mana Crypt, etc.) if the user asks for cEDH/high power.
Do NOT present lands like Command Tower or Fabled Passage as ramp.

If a card is banned or restricted in the user's chosen format, explicitly mention that it's banned and suggest a legal alternative.

If the commander profile indicates a specific archetype, preserve the deck's flavour and mechanical identity; never recommend cards that contradict its theme unless the user explicitly asks for variety.`;

    // Build the improvements text
    const improvementsText = suggestions
      .map((s: any) => {
        const priority = s.priority === "high" ? "🔴 HIGH PRIORITY" : s.priority === "medium" ? "🟡 MEDIUM" : "🔵 LOW";
        return `\n\n${priority} - ${s.category || "General"}:\n${s.suggestedPromptAddition}`;
      })
      .join("\n");

    // Create a new prompt version with improvements
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const newVersion = `v${timestamp}`;

    // Start with existing prompt, or default if empty
    let updatedSystemPrompt = currentPrompts.templates?.system || "";
    
    // If the current prompt is empty or only contains improvements section, use default as base
    if (!currentPrompts.templates?.system || currentPrompts.templates.system.trim() === "" || 
        /^=== AI TEST IMPROVEMENTS/.test(currentPrompts.templates.system.trim())) {
      updatedSystemPrompt = defaultBasePrompt + "\n\n" + defaultGuardrails;
    } else {
      // Check if guardrails are already in the prompt
      if (!updatedSystemPrompt.includes("Global behavioral guardrails")) {
        updatedSystemPrompt += "\n\n" + defaultGuardrails;
      }
    }

    if (action === "append") {
      updatedSystemPrompt += "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n";
      updatedSystemPrompt += improvementsText;
    } else if (action === "prepend") {
      updatedSystemPrompt =
        "=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n" +
        improvementsText +
        "\n\n=== ORIGINAL PROMPT ===\n" +
        updatedSystemPrompt;
    } else {
      // replace - merge intelligently
      // Remove old improvements section if it exists
      updatedSystemPrompt = updatedSystemPrompt.replace(
        /=== AI TEST IMPROVEMENTS[\s\S]*?===/,
        ""
      );
      updatedSystemPrompt += "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n";
      updatedSystemPrompt += improvementsText;
    }

    // Update prompts config
    const updatedPrompts = {
      ...currentPrompts,
      version: newVersion,
      templates: {
        ...currentPrompts.templates,
        system: updatedSystemPrompt,
      },
    };

    const { error: updateError } = await admin
      .from("app_config")
      .upsert({ key: "prompts", value: updatedPrompts }, { onConflict: "key" });

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Save a backup/version history
    try {
      await admin.from("admin_audit").insert({
        actor_id: user.id,
        action: "prompt_improved",
        target: "prompts",
        payload: {
          version: newVersion,
          suggestionsApplied: suggestions.length,
          action,
          previousVersion: currentPrompts.version,
        },
      });
    } catch (e) {
      // Audit log failure is non-critical
      console.warn("Failed to log prompt improvement:", e);
    }

    // Log the prompt length for debugging
    console.log(`[apply-improvements] Saved prompt version ${newVersion}, length: ${updatedSystemPrompt.length} chars`);

    return NextResponse.json({
      ok: true,
      message: `Applied ${suggestions.length} improvements to system prompt`,
      newVersion,
      previousVersion: currentPrompts.version,
      improvementsApplied: suggestions.length,
      promptLength: updatedSystemPrompt.length,
      preview: updatedSystemPrompt.slice(0, 200) + "...",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


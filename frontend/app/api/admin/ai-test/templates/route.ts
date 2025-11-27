import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

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

// Predefined test case templates
const TEMPLATES = [
  {
    id: "chat-ramp-question",
    name: "Ramp Question (Chat)",
    type: "chat",
    input: {
      userMessage: "What ramp cards should I add to my {format} deck?",
      format: "Commander",
    },
    expectedChecks: {
      shouldContain: ["ramp", "mana"],
      minLength: 100,
    },
    tags: ["ramp", "chat"],
  },
  {
    id: "chat-budget-suggestion",
    name: "Budget Suggestion (Chat)",
    type: "chat",
    input: {
      userMessage: "I need a budget alternative to {cardName} for my {format} deck.",
      format: "Commander",
    },
    expectedChecks: {
      shouldContain: ["budget", "cheaper", "alternative"],
      shouldMentionCard: ["{cardName}"],
    },
    tags: ["budget", "chat"],
  },
  {
    id: "deck-analysis-manabase",
    name: "Manabase Analysis",
    type: "deck_analysis",
    input: {
      deckText: "{decklist}",
      format: "Commander",
      colors: ["R", "G"],
    },
    expectedChecks: {
      mustFlagLowLands: true,
      shouldContain: ["land", "mana"],
    },
    tags: ["manabase", "deck_analysis"],
  },
  {
    id: "chat-synergy-question",
    name: "Synergy Question (Chat)",
    type: "chat",
    input: {
      userMessage: "What cards work well with {commander} in {format}?",
      format: "Commander",
      commander: "{commander}",
    },
    expectedChecks: {
      shouldContain: ["synergy", "{commander}"],
      minLength: 150,
    },
    tags: ["synergy", "chat", "commander"],
  },
  {
    id: "deck-analysis-curve",
    name: "Mana Curve Analysis",
    type: "deck_analysis",
    input: {
      deckText: "{decklist}",
      format: "Commander",
    },
    expectedChecks: {
      shouldContain: ["curve", "mana cost"],
      minRampMention: 1,
    },
    tags: ["curve", "deck_analysis"],
  },
];

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, templates: TEMPLATES });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { templateId, name, customizations } = body;

    if (!templateId) {
      return NextResponse.json({ ok: false, error: "templateId required" }, { status: 400 });
    }

    const template = TEMPLATES.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 });
    }

    // Apply customizations to template
    let finalInput: any = { ...template.input };
    let finalChecks = { ...template.expectedChecks };
    let finalTags = [...(template.tags || [])];

    if (customizations) {
      // Replace placeholders in input
      Object.keys(customizations).forEach(key => {
        const value = customizations[key];
        if (typeof finalInput === "object" && finalInput !== null) {
          Object.keys(finalInput).forEach(inputKey => {
            if (typeof finalInput[inputKey] === "string") {
              finalInput[inputKey] = finalInput[inputKey].replace(`{${key}}`, value);
            }
          });
        }
      });

      // Merge custom expected checks
      if (customizations.expectedChecks) {
        finalChecks = { ...finalChecks, ...customizations.expectedChecks };
      }

      // Add custom tags
      if (customizations.tags) {
        finalTags = [...finalTags, ...customizations.tags];
      }
    }

    // Create test case from template
    const { data: testCase, error } = await supabase
      .from("ai_test_cases")
      .insert({
        name: name || template.name,
        type: template.type,
        input: finalInput,
        expected_checks: finalChecks,
        tags: finalTags,
        source: "template",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, testCase });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


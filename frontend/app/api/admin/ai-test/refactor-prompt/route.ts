import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { getPromptVersion } from "@/lib/config/prompts";
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
    const { kind = "chat", setActive = false } = body;

    // Get current prompt
    const currentPrompt = await getPromptVersion(kind as "chat" | "deck_analysis");
    if (!currentPrompt) {
      return NextResponse.json({ ok: false, error: "No prompt version found" }, { status: 404 });
    }

    let promptText = currentPrompt.system_prompt;
    const originalLength = promptText.length;

    // Extract improvements section
    const improvementsRegex = /=== AI TEST IMPROVEMENTS \(Auto-Applied\) ===([\s\S]*?)(?=(?:===|$))/;
    const improvementsMatch = promptText.match(improvementsRegex);
    const improvementsText = improvementsMatch ? improvementsMatch[1].trim() : "";

    // Remove improvements section temporarily
    promptText = promptText.replace(improvementsRegex, "").trim();

    // Extract and deduplicate rules
    // Split by numbered rules (1., 2., etc.) or section headers
    const ruleSections: string[] = [];
    const seenRules = new Set<string>();

    // Split by major sections (GLOBAL BEHAVIORAL GUARDRAILS, etc.)
    const sections = promptText.split(/(?=------------------------------------------------------------)/);
    
    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      // Extract numbered rules
      const numberedRules = trimmed.match(/\d+\.\s+[A-Z][^\n]+(?:\n(?!\d+\.)[^\n]+)*/g);
      if (numberedRules) {
        for (const rule of numberedRules) {
          // Normalize rule text for deduplication (remove extra whitespace, case-insensitive key phrases)
          const normalized = rule
            .replace(/\s+/g, " ")
            .toLowerCase()
            .replace(/[^\w\s]/g, "");
          
          // Check for similar rules (fuzzy match on key phrases)
          const keyPhrases = normalized.split(" ").filter((w: string) => w.length > 4);
          const isDuplicate = Array.from(seenRules).some((seen: string) => {
            const seenPhrases = seen.split(" ").filter((w: string) => w.length > 4);
            const overlap = keyPhrases.filter((p: string) => seenPhrases.includes(p)).length;
            return overlap >= Math.min(keyPhrases.length, seenPhrases.length) * 0.7; // 70% overlap
          });

          if (!isDuplicate) {
            ruleSections.push(rule.trim());
            seenRules.add(normalized);
          }
        }
      } else {
        // Non-numbered section, keep as-is if not empty
        if (trimmed.length > 20) {
          ruleSections.push(trimmed);
        }
      }
    }

    // Reconstruct prompt
    const basePrompt = promptText.split(/(?=------------------------------------------------------------)/)[0] || promptText.split(/\d+\./)[0] || "";
    const refactoredPrompt = basePrompt.trim() + "\n\n" + ruleSections.join("\n\n");

    // Re-add improvements if they exist
    const finalPrompt = improvementsText
      ? refactoredPrompt + "\n\n=== AI TEST IMPROVEMENTS (Auto-Applied) ===\n" + improvementsText
      : refactoredPrompt;

    const refactoredLength = finalPrompt.length;
    const rulesBefore = (promptText.match(/\d+\./g) || []).length;
    const rulesAfter = (refactoredPrompt.match(/\d+\./g) || []).length;
    const improvementsCount = improvementsText ? improvementsText.split(/\n\n+/).filter((s: string) => s.trim().length > 0).length : 0;

    // Create new prompt version (service role for RLS-protected prompt_versions)
    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "missing_service_role_key" }, { status: 500 });
    }
    const version = `v${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}`;
    const { data: newVersion, error: versionError } = await admin
      .from("prompt_versions")
      .insert({
        kind,
        version,
        system_prompt: finalPrompt,
        meta: {
          refactored: true,
          original_length: originalLength,
          refactored_length: refactoredLength,
          rules_before: rulesBefore,
          rules_after: rulesAfter,
          improvements_count: improvementsCount,
        },
      })
      .select("id, version")
      .single();

    if (versionError || !newVersion) {
      return NextResponse.json({
        ok: false,
        error: `Failed to create refactored version: ${versionError?.message || "unknown"}`,
      }, { status: 500 });
    }

    // Set as active if requested
    if (setActive) {
      await admin
        .from("app_config")
        .upsert(
          {
            key: `active_prompt_version_${kind}`,
            value: { id: newVersion.id, version: newVersion.version },
          },
          { onConflict: "key" }
        );
    }

    return NextResponse.json({
      ok: true,
      newVersion: newVersion.version,
      stats: {
        originalLength,
        refactoredLength,
        rulesBefore,
        rulesAfter,
        improvementsCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

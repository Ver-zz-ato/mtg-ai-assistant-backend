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

/**
 * Structured test case format for PDF import
 */
interface PDFTestCase {
  id: string; // Unique, stable ID
  title: string;
  format: "commander" | "modern" | "standard" | "pioneer" | "other";
  commander: string | null;
  user_prompt: string;
  decklist: string; // Raw multiline string
  tags: string[]; // Failure-class tags (e.g. COLOR_IDENTITY_OFFCOLOR, CMD_BANNED_CARD_PRESENT, etc.)
  must_assert: string[]; // Machine-checkable requirements
  focus?: string; // From "Focus:" text in PDF
}

/**
 * Import test cases from PDF
 * 
 * This route expects test cases that have been parsed from the PDF externally.
 * The PDF parsing should be done with a tool like pdf-parse, pdfjs-dist, or similar.
 * 
 * Expected body: { testCases: PDFTestCase[] }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { testCases } = body;

    if (!Array.isArray(testCases) || testCases.length === 0) {
      return NextResponse.json(
        { ok: false, error: "testCases array required" },
        { status: 400 }
      );
    }

    // Validate: Must have at least 1 test (relaxed from 200 for partial imports)
    if (testCases.length < 1) {
      return NextResponse.json(
        {
          ok: false,
          error: `No test cases provided`,
        },
        { status: 400 }
      );
    }

    // Warn if less than 200 tests (but allow import)
    let warning = undefined;
    if (testCases.length < 200) {
      const formats = new Set<string>(testCases.map((tc: PDFTestCase) => tc.format));
      const expectedFormats: string[] = ["commander", "modern", "standard", "pioneer"];
      const missingFormats = expectedFormats.filter((f) => !formats.has(f));
      warning = `Only ${testCases.length} test cases provided (expected 200). Missing formats: ${missingFormats.join(", ")}`;
    }

    // Validate structure
    const invalidTests: any[] = [];
    const validTests: PDFTestCase[] = [];

    for (const tc of testCases) {
      const missing: string[] = [];
      if (!tc.id) missing.push("id");
      if (!tc.title) missing.push("title");
      if (!tc.format) missing.push("format");
      if (!tc.user_prompt) missing.push("user_prompt");
      // decklist can be empty for chat-only tests
      // tags and must_assert are arrays, can be empty

      if (missing.length > 0) {
        invalidTests.push({ testCase: tc, missing });
      } else {
        validTests.push(tc);
      }
    }

    if (invalidTests.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `${invalidTests.length} test cases missing required fields`,
          invalidTests: invalidTests.slice(0, 10), // First 10 examples
        },
        { status: 400 }
      );
    }

    // Clear old tests from database
    const { error: deleteError } = await supabase
      .from("ai_test_cases")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: `Failed to clear old tests: ${deleteError.message}` },
        { status: 500 }
      );
    }

    // Convert PDF format to database format
    const dbTestCases = validTests.map((tc) => {
      // Determine type based on whether decklist is present
      const type = tc.decklist && tc.decklist.trim() ? "deck_analysis" : "chat";

      // Build input object
      const input: any = {
        userMessage: tc.user_prompt,
        format:
          tc.format === "commander"
            ? "Commander"
            : tc.format.charAt(0).toUpperCase() + tc.format.slice(1),
      };

      if (tc.commander) {
        input.commander = tc.commander;
      }

      if (tc.decklist && tc.decklist.trim()) {
        input.deckText = tc.decklist;
      }

      // Build expected_checks from must_assert
      const expectedChecks: any = {};

      // Convert must_assert array to structured checks
      for (const assertion of tc.must_assert || []) {
        if (assertion.includes("must mention")) {
          const match = assertion.match(/must mention (.*)/i);
          if (match) {
            if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
            expectedChecks.shouldContain.push(match[1]);
          }
        } else if (
          assertion.includes("must not recommend") ||
          assertion.includes("must not suggest")
        ) {
          const match = assertion.match(/must not (?:recommend|suggest) (.*)/i);
          if (match) {
            if (!expectedChecks.shouldNotContain) expectedChecks.shouldNotContain = [];
            expectedChecks.shouldNotContain.push(match[1]);
          }
        } else if (assertion.includes("must flag")) {
          const match = assertion.match(/must flag (.*)/i);
          if (match) {
            if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
            expectedChecks.shouldContain.push(match[1]);
          }
        } else if (assertion.includes("≥") || assertion.includes(">=")) {
          const match = assertion.match(/≥?\s*(\d+)/);
          if (match) {
            expectedChecks.minCardSuggestions = parseInt(match[1], 10);
          }
        } else if (assertion.includes("must include")) {
          const match = assertion.match(/must include (.*)/i);
          if (match) {
            if (!expectedChecks.shouldContain) expectedChecks.shouldContain = [];
            expectedChecks.shouldContain.push(match[1]);
          }
        }
        // Add more assertion patterns as needed
      }

      // Add focus to tags if present
      const tags = [...(tc.tags || [])];
      if (tc.focus) {
        tags.push(`focus:${tc.focus}`);
      }

      return {
        name: tc.title,
        type,
        input,
        expected_checks: expectedChecks,
        tags,
        source: "pdf_import_2025",
      };
    });

    // Batch insert (Supabase supports up to 1000 rows per insert)
    const batchSize = 500;
    const inserted: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < dbTestCases.length; i += batchSize) {
      const batch = dbTestCases.slice(i, i + batchSize);
      const { data, error } = await supabase.from("ai_test_cases").insert(batch).select();

      if (error) {
        errors.push({ batch: i / batchSize + 1, error: error.message });
      } else {
        inserted.push(...(data || []));
      }
    }

    // Generate summary
    const formatCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    for (const tc of validTests) {
      formatCounts[tc.format] = (formatCounts[tc.format] || 0) + 1;
      for (const tag of tc.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    return NextResponse.json({
      ok: true,
      imported_count: inserted.length,
      summary: {
        total: inserted.length,
        by_format: formatCounts,
        by_tag: tagCounts,
      },
      errors: errors.length > 0 ? errors : undefined,
      warning: warning,
      message: `Successfully imported ${inserted.length} test cases from PDF`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

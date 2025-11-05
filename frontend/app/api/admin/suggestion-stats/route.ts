// Admin endpoint to review AI suggestion statistics and rejection patterns
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isAdmin(user: any): boolean {
  const ids = String(process.env.ADMIN_USER_IDS || '').split(/[\s,]+/).filter(Boolean);
  const emails = String(process.env.ADMIN_EMAILS || '').split(/[\s,]+/).filter(Boolean).map(s=>s.toLowerCase());
  const uid = String(user?.id || '');
  const email = String(user?.email || '').toLowerCase();
  return (!!uid && ids.includes(uid)) || (!!email && emails.includes(email));
}

/**
 * GET /api/admin/suggestion-stats
 * 
 * Returns guidance on how to query PostHog for suggestion rejection statistics.
 * 
 * To get actual rejection data, use PostHog's Insights API:
 * 
 * Query for implicit rejections:
 * - Event: ai_suggestion_shown
 * - Group by: card, category, reason
 * - Filter: events where ai_suggestion_accepted with same suggestion_id is NOT present within 24 hours
 * 
 * Query for explicit rejections:
 * - Event: ai_suggestion_rejected
 * - Group by: card, category, reason
 * 
 * This endpoint provides instructions and a summary of what to look for.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // Return guidance on how to query PostHog for suggestion statistics
    return NextResponse.json({
      ok: true,
      message: "Suggestion statistics guidance",
      instructions: {
        implicit_rejections: {
          description: "Suggestions that were shown but never accepted (within 24 hours)",
          posthog_query: {
            event: "ai_suggestion_shown",
            group_by: ["card", "category"],
            filter: "NOT EXISTS ai_suggestion_accepted with same suggestion_id within 24h",
            note: "This requires PostHog Insights API or manual query in PostHog dashboard"
          }
        },
        explicit_rejections: {
          description: "Suggestions that were explicitly rejected by users",
          posthog_query: {
            event: "ai_suggestion_rejected",
            group_by: ["card", "category", "reason"],
            note: "Currently tracked via frontend feedback buttons (if implemented)"
          }
        },
        acceptance_rate: {
          description: "Overall acceptance rate by category",
          posthog_query: {
            events: ["ai_suggestion_shown", "ai_suggestion_accepted"],
            calculate: "ai_suggestion_accepted / ai_suggestion_shown",
            group_by: ["category"],
            note: "Calculate acceptance rate per category (must-fix, synergy-upgrade, optional)"
          }
        },
        top_rejected_cards: {
          description: "Cards most frequently shown but not accepted",
          posthog_query: {
            event: "ai_suggestion_shown",
            group_by: ["card"],
            order_by: "count DESC",
            filter: "NOT EXISTS ai_suggestion_accepted with same suggestion_id",
            limit: 20,
            note: "Review top 20 rejected cards to identify patterns (wrong format, off-color, etc.)"
          }
        }
      },
      recommendations: [
        "Review top rejected cards monthly to identify common issues",
        "Update prompt rules based on rejection patterns",
        "Check if rejected cards are frequently off-color, illegal, or duplicates",
        "Consider adding more specific filters for commonly rejected card types",
        "Track acceptance rates per prompt version for A/B testing"
      ],
      next_steps: [
        "Set up PostHog Insights API access (if not already configured)",
        "Create a scheduled job to query PostHog and store rejection stats in database",
        "Build a dashboard UI to visualize rejection patterns",
        "Implement automatic prompt updates based on rejection thresholds"
      ]
    });
  } catch (error: any) {
    console.error('[admin/suggestion-stats] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || "Failed to fetch suggestion stats" 
    }, { status: 500 });
  }
}


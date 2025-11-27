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

function calculateNextRun(frequency: string, cronExpression?: string): Date {
  const now = new Date();
  const next = new Date(now);

  if (frequency === "daily") {
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0); // 2 AM
  } else if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
    next.setHours(2, 0, 0, 0);
  } else if (frequency === "custom" && cronExpression) {
    // Simple cron parsing for common patterns
    // For now, just add 24 hours - full cron parsing would require a library
    next.setDate(next.getDate() + 1);
  } else {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const { data: schedules, error } = await supabase
      .from("ai_test_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedules: schedules || [] });
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
    const { name, description, frequency, cronExpression, testCaseIds, validationOptions, alertThreshold, alertEmail, enabled = true } = body;

    if (!name || !frequency) {
      return NextResponse.json({ ok: false, error: "name and frequency required" }, { status: 400 });
    }

    const nextRunAt = calculateNextRun(frequency, cronExpression);

    const { data: schedule, error } = await supabase
      .from("ai_test_schedules")
      .insert({
        name,
        description,
        frequency,
        cron_expression: cronExpression,
        test_case_ids: testCaseIds || null,
        validation_options: validationOptions || {},
        alert_threshold: alertThreshold || 70,
        alert_email: alertEmail,
        enabled,
        next_run_at: nextRunAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedule });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    // Recalculate next_run_at if frequency changed
    if (updates.frequency) {
      updates.next_run_at = calculateNextRun(updates.frequency, updates.cron_expression || updates.cronExpression).toISOString();
    }

    updates.updated_at = new Date().toISOString();

    const { data: schedule, error } = await supabase
      .from("ai_test_schedules")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedule });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("ai_test_schedules")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "server_error" }, { status: 500 });
  }
}


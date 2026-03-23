import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdminUser } from "@/lib/admin-auth";
import { validateOrigin } from "@/lib/api/csrf";
import { featureFlagPlatformSchema } from "@/lib/mobile/validation";

export const runtime = "nodejs";

const upsertBody = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  platform: featureFlagPlatformSchema.optional(),
  min_app_version: z.string().nullable().optional(),
  max_app_version: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  priority: z.number().int().optional(),
});

export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const { data, error } = await admin
      .from("app_changelog")
      .select(
        "id, title, body, platform, min_app_version, max_app_version, is_active, starts_at, ends_at, priority, created_at, updated_at, created_by, updated_by"
      )
      .order("priority", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, rows: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!validateOrigin(req)) {
      return NextResponse.json(
        { ok: false, error: "Invalid origin. This request must come from the same site." },
        { status: 403 }
      );
    }

    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !isAdminUser(user)) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "admin_client_unavailable" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = upsertBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
    }

    const b = parsed.data;
    const now = new Date().toISOString();

    if (b.id) {
      const row = {
        title: b.title,
        body: b.body,
        platform: b.platform ?? "mobile",
        min_app_version: b.min_app_version ?? null,
        max_app_version: b.max_app_version ?? null,
        is_active: b.is_active ?? true,
        starts_at: b.starts_at ?? null,
        ends_at: b.ends_at ?? null,
        priority: b.priority ?? 100,
        updated_at: now,
        updated_by: user.id,
      };
      const { error } = await admin.from("app_changelog").update(row).eq("id", b.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      try {
        await admin.from("admin_audit").insert({
          actor_id: user.id,
          action: "mobile_app_changelog_update",
          target: b.id,
          payload: { title: b.title },
        });
      } catch {
        /* ignore */
      }
      return NextResponse.json({ ok: true, id: b.id });
    }

    const insertRow = {
      title: b.title,
      body: b.body,
      platform: b.platform ?? "mobile",
      min_app_version: b.min_app_version ?? null,
      max_app_version: b.max_app_version ?? null,
      is_active: b.is_active ?? true,
      starts_at: b.starts_at ?? null,
      ends_at: b.ends_at ?? null,
      priority: b.priority ?? 100,
      created_at: now,
      updated_at: now,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data: inserted, error } = await admin.from("app_changelog").insert(insertRow).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    try {
      await admin.from("admin_audit").insert({
        actor_id: user.id,
        action: "mobile_app_changelog_create",
        target: inserted?.id ?? "new",
        payload: { title: b.title },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, id: inserted?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

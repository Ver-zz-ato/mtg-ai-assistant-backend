import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/server-supabase";
import { getAdmin } from "@/app/api/_lib/supa";
import { isAdminUser } from "@/lib/admin-auth";
import { validateOrigin } from "@/lib/api/csrf";
import { remoteConfigPlatformSchema } from "@/lib/mobile/validation";

export const runtime = "nodejs";

const upsertBody = z.object({
  key: z.string().min(1),
  description: z.string().nullable().optional(),
  /** JSON object, array, or primitive — stored as jsonb */
  value: z.any(),
  platform: remoteConfigPlatformSchema.optional(),
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
      .from("remote_config")
      .select("key, description, value, platform, updated_at, updated_by")
      .order("key");

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

    const { key, description, platform } = parsed.data;
    let value: unknown = parsed.data.value;
    if (typeof value === "string") {
      try {
        value = JSON.parse(value) as unknown;
      } catch {
        return NextResponse.json({ ok: false, error: "Invalid JSON in value" }, { status: 400 });
      }
    }

    const row = {
      key,
      description: description ?? null,
      value,
      platform: platform ?? "all",
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    const { error } = await admin.from("remote_config").upsert(row, { onConflict: "key" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    try {
      await admin.from("admin_audit").insert({
        actor_id: user.id,
        action: "mobile_remote_config_upsert",
        target: key,
        payload: { platform: row.platform },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, key });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "server_error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

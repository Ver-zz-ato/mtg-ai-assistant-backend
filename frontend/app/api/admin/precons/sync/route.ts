/**
 * POST /api/admin/precons/sync
 * Admin-only. Fetches all Commander precons from Westly/CommanderPrecons (GitHub) and replaces precon_decks.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import {
  fetchWestlyPreconRows,
  replacePreconDecks,
  countPreconDecks,
  WESTLY_PRECON_SOURCE,
} from "@/lib/precons-westly-sync";

export const runtime = "nodejs";
export const maxDuration = 120;

async function resolveAdminUser(req: NextRequest) {
  let supabase = await getServerSupabase();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (bearerToken) {
      const { createClientWithBearerToken } = await import("@/lib/server-supabase");
      const bearerSupabase = createClientWithBearerToken(bearerToken);
      const {
        data: { user: bearerUser },
      } = await bearerSupabase.auth.getUser();
      if (bearerUser) {
        user = bearerUser;
        supabase = bearerSupabase;
      }
    }
  }

  return { user, supabase };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const { user } = await resolveAdminUser(req);
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Service role not configured" }, { status: 500 });
    }

    const { rows, fileErrors } = await fetchWestlyPreconRows();
    if (rows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No precon rows parsed from upstream",
          fileErrors,
          source: WESTLY_PRECON_SOURCE,
        },
        { status: 502 }
      );
    }

    await replacePreconDecks(admin, rows);
    const dbCount = await countPreconDecks(admin);
    const durationMs = Date.now() - t0;

    return NextResponse.json({
      ok: true,
      inserted: rows.length,
      dbCount,
      fileErrors,
      source: WESTLY_PRECON_SOURCE,
      durationMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    console.error("[admin/precons/sync]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

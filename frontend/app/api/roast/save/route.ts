import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  try {
    let supabase = await createClient();
    let { data: { user } } = await supabase.auth.getUser();

    // Bearer fallback for mobile
    if (!user) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
        }
      }
    }

    if (!user) {
      return NextResponse.json({ ok: false, error: "Must be logged in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const roastId = typeof body?.roastId === "string" ? body.roastId.trim() : "";

    if (roastId) {
      const { data: existing, error: existingError } = await supabase
        .from("roast_permalinks")
        .select("id, user_id, expires_at")
        .eq("id", roastId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
      }
      if (!existing) {
        return NextResponse.json({ ok: false, error: "Roast not found" }, { status: 404 });
      }

      const base = process.env.NEXT_PUBLIC_BASE_URL || (typeof req.url === "string" ? new URL(req.url).origin : "https://www.manatap.ai");
      const url = `${base}/roast/${roastId}`;
      return NextResponse.json({ ok: true, id: roastId, url, shareUrl: url, expires_at: existing.expires_at });
    }

    const roastText = String(body?.roastText ?? body?.roast ?? "").trim();
    const roastScore = typeof body?.roastScore === "number" ? body.roastScore : null;
    const commander = typeof body?.commander === "string" ? body.commander.trim() || null : null;
    const format = typeof body?.format === "string" ? body.format : "Commander";
    const roastLevel = typeof body?.roastLevel === "string" ? body.roastLevel : null;
    const commanderArtUrl = typeof body?.commanderArtUrl === "string" ? body.commanderArtUrl : null;

    if (!roastText) {
      return NextResponse.json({ ok: false, error: "roastText required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("roast_permalinks")
      .insert({
        user_id: user.id,
        roast_text: roastText,
        roast_score: roastScore,
        commander,
        format,
        roast_level: roastLevel,
        commander_art_url: commanderArtUrl,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || (typeof req.url === "string" ? new URL(req.url).origin : "https://www.manatap.ai");
    const url = `${base}/roast/${(data as { id: string }).id}`;

    return NextResponse.json({ ok: true, id: (data as { id: string }).id, url, shareUrl: url, expires_at: (data as { expires_at?: string }).expires_at });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "server_error" },
      { status: 500 }
    );
  }
}

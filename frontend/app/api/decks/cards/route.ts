// app/api/decks/cards/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeckText, parseDeckTextWithZones } from "@/lib/deck/parseDeckText";
import { isCommanderFormatString } from "@/lib/deck/formatRules";
import { sanitizedNameForDeckPersistence } from "@/lib/deck/cleanCardName";
import { canonicalize } from "@/lib/cards/canonicalize";

export const runtime = "nodejs";

function getDeckId(url: string) {
  const sp = new URL(url).searchParams;
  return sp.get("deckId") || sp.get("deckid") || sp.get("id");
}

function getDeckIds(url: string): string[] | null {
  const sp = new URL(url).searchParams;
  const raw = sp.get("deckIds") ?? sp.get("deck_ids");
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids.slice(0, 50) : null; // cap 50
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function GET(req: NextRequest) {
  try {
    const deckIds = getDeckIds(req.url);
    if (deckIds && deckIds.length > 0) {
      // Batch: return cards for multiple decks (e.g. ?deckIds=id1,id2,id3)
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
      const { createClient: createServiceClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      const service = serviceKey ? createServiceClient(url, serviceKey, { auth: { persistSession: false } }) : supabase;
      const { data: decks } = await service.from("decks").select("id, is_public, user_id").in("id", deckIds);
      const allowed = (decks ?? []).filter(
        (d: any) => d.is_public || d.user_id === user?.id
      ).map((d: any) => d.id);
      if (allowed.length === 0) {
        return NextResponse.json({ ok: true, decks: {} });
      }
      const { data: rows, error } = await service
        .from("deck_cards")
        .select("id, deck_id, name, qty, zone, created_at")
        .in("deck_id", allowed)
        .order("name", { ascending: true });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      const byDeck: Record<string, { cards: any[] }> = {};
      for (const id of allowed) byDeck[id] = { cards: [] };
      for (const r of rows ?? []) {
        if (byDeck[r.deck_id]) byDeck[r.deck_id].cards.push(r);
      }
      return NextResponse.json({ ok: true, decks: byDeck });
    }

    const deckId = getDeckId(req.url);
    if (!deckId) {
      return NextResponse.json({ ok: false, error: "deckId or deckIds required" }, { status: 400 });
    }
    const supabase = await createClient();

    // First check if deck is public - if so, use service role to bypass RLS
    const { data: deck } = await supabase
      .from("decks")
      .select("is_public, user_id")
      .eq("id", deckId)
      .maybeSingle();
    
    // If deck is public, use service role client to bypass RLS
    let client = supabase;
    if (deck?.is_public) {
      const { createClient: createServiceClient } = await import("@supabase/supabase-js");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
      if (serviceKey) {
        client = createServiceClient(url, serviceKey, { auth: { persistSession: false } }) as any;
      }
    }
    
    const { data, error } = await client
      .from("deck_cards")
      .select("id, deck_id, name, qty, zone, created_at")
      .eq("deck_id", deckId)
      .order("name", { ascending: true });
    
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, cards: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

async function importDeckText(supabase: SupabaseServerClient, deckId: string, deckText: string) {
  const { data: deckMeta } = await supabase.from("decks").select("format").eq("id", deckId).maybeSingle();
  const formatRaw = String(deckMeta?.format ?? "commander");

  const insertBatch: Array<{ deck_id: string; name: string; qty: number; zone: string }> = [];

  if (isCommanderFormatString(formatRaw)) {
    for (const entry of parseDeckText(deckText)) {
      const { canonicalName } = canonicalize(entry.name);
      const name = canonicalName || entry.name.trim();
      if (!name) continue;
      insertBatch.push({
        deck_id: deckId,
        name,
        qty: Math.max(1, entry.qty),
        zone: "mainboard",
      });
    }
  } else {
    for (const entry of parseDeckTextWithZones(deckText, { isCommanderFormat: false })) {
      const { canonicalName } = canonicalize(entry.name);
      const name = canonicalName || entry.name.trim();
      if (!name) continue;
      const zone = entry.zone === "sideboard" ? "sideboard" : "mainboard";
      insertBatch.push({
        deck_id: deckId,
        name,
        qty: Math.max(1, entry.qty),
        zone,
      });
    }
  }

  if (insertBatch.length === 0) {
    return NextResponse.json({ ok: false, error: "No cards found in decklist" }, { status: 400 });
  }

  const { error: delErr } = await supabase.from("deck_cards").delete().eq("deck_id", deckId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
  }

  const { error: insErr } = await supabase.from("deck_cards").insert(insertBatch);
  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
  }

  const { error: deckUpdateErr } = await supabase
    .from("decks")
    .update({ deck_text: deckText.trim() })
    .eq("id", deckId);
  if (deckUpdateErr) {
    return NextResponse.json({ ok: false, error: deckUpdateErr.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    inserted: insertBatch.length,
    updated: 0,
    deleted: 0,
  });
}

export async function POST(req: NextRequest) {
  try {
    const deckId = getDeckId(req.url);
    const body = await req.json().catch(() => ({}));

    if (!deckId) {
      return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });
    }

    let supabase = await createClient();
    let { data: { user }, error: uErr } = await supabase.auth.getUser();

    // Bearer fallback for mobile
    if (!user && !uErr) {
      const authHeader = req.headers.get("Authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (bearerToken) {
        const { createClientWithBearerToken } = await import("@/lib/server-supabase");
        const bearerSupabase = createClientWithBearerToken(bearerToken);
        const { data: { user: bearerUser } } = await bearerSupabase.auth.getUser();
        if (bearerUser) {
          user = bearerUser;
          supabase = bearerSupabase;
          uErr = null;
        }
      }
    }

    if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 401 });
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const deckText = typeof body?.deckText === "string" ? body.deckText : "";
    if (deckText.trim()) {
      return await importDeckText(supabase, deckId, deckText);
    }

    let name = sanitizedNameForDeckPersistence(String(body?.name ?? ""));
    const qty = Math.max(1, Number(body?.qty ?? 1) || 1);
    const rawZone = String(body?.zone ?? "mainboard").toLowerCase();
    const zone = rawZone === "sideboard" ? "sideboard" : "mainboard";

    if (!name) {
      return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
    }
    
    // Validate and fix card name before adding (unless skipValidation is true)
    if (!body.skipValidation) {
      try {
        const fuzzyRes = await fetch(`${req.nextUrl.origin}/api/cards/fuzzy`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ names: [name] })
        });
        const fuzzyData = await fuzzyRes.json().catch(() => ({}));
        const suggestion = fuzzyData?.results?.[name]?.suggestion;
        // Use suggestion if it exists and is different (case-insensitive check)
        if (suggestion && suggestion.toLowerCase() !== name.toLowerCase()) {
          name = suggestion; // Auto-fix the name
        }
      } catch (e) {
        // Continue with original name if validation fails
        console.warn('[decks/cards] Name validation failed, using original name:', e);
      }
    }

    // Merge by incrementing when card already exists (case-insensitive match) within the same zone
    const { data: existingRows } = await supabase
      .from("deck_cards")
      .select("id, qty, name, zone")
      .eq("deck_id", deckId);
    const nameLower = name.toLowerCase();
    const existing = (existingRows ?? []).find((r) => {
      const z = String((r as { zone?: string }).zone || "mainboard").toLowerCase();
      return (r.name || "").toLowerCase() === nameLower && z === zone;
    });

    if (existing?.id) {
      const newQty = Math.max(0, (existing.qty || 0) + qty);
      if (newQty <= 0) {
        await supabase.from("deck_cards").delete().eq("id", existing.id);
        return NextResponse.json({ ok: true, deleted: true });
      }
      const { error: upErr } = await supabase
        .from("deck_cards")
        .update({ qty: newQty })
        .eq("id", existing.id);
      if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
      try {
        const { logSuggestionOutcome } = await import("@/lib/data-moat/log-suggestion-outcome");
        const sid = body?.suggestion_id ?? body?.suggestionId;
        if (sid && user?.id) {
          await logSuggestionOutcome({
            suggestion_id: String(sid),
            deck_id: deckId,
            user_id: user.id,
            suggested_card: (name || body?.suggested_card) ?? null,
            category: body?.category ?? null,
            prompt_version_id: body?.prompt_version_id ?? body?.prompt_version ?? null,
            format: body?.format ?? null,
            commander: body?.commander ?? null,
            accepted: true,
            outcome_source: "client_accept",
          });
        }
      } catch (_) {}
      return NextResponse.json({ ok: true, id: existing.id, qty: newQty, merged: true });
    }

    const { error: insErr, data } = await supabase
      .from("deck_cards")
      .insert({ deck_id: deckId, name, qty, zone })
      .select("id, qty")
      .single();

    if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    try {
      const { logSuggestionOutcome } = await import("@/lib/data-moat/log-suggestion-outcome");
      const sid = body?.suggestion_id ?? body?.suggestionId;
      if (sid && user?.id) {
        await logSuggestionOutcome({
          suggestion_id: String(sid),
          deck_id: deckId,
          user_id: user.id,
          suggested_card: (name || body?.suggested_card) ?? null,
          category: body?.category ?? null,
          prompt_version_id: body?.prompt_version_id ?? body?.prompt_version ?? null,
          format: body?.format ?? null,
          commander: body?.commander ?? null,
          accepted: true,
          outcome_source: "client_accept",
        });
      }
    } catch (_) {}
    return NextResponse.json({ ok: true, id: data?.id, qty: data?.qty || qty, merged: false });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const deckId = getDeckId(req.url);
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  const delta = typeof body?.delta === 'number' ? Number(body.delta) : null;
  const newNameRaw = body?.new_name ? String(body.new_name).trim() : null;
  if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status:400 });

  const supabase = await createClient();
  const { data: row, error: selErr } = await supabase
    .from("deck_cards")
    .select("id, deck_id, name, qty, zone")
    .eq("id", id)
    .maybeSingle();
  if (selErr) return NextResponse.json({ ok: false, error: selErr.message }, { status: 400 });
  if (!row) return NextResponse.json({ ok: false, error: "Row not found" }, { status: 404 });

  const newZoneRaw = body?.new_zone != null ? String(body.new_zone).trim().toLowerCase() : "";
  if (newZoneRaw === "mainboard" || newZoneRaw === "sideboard") {
    const fromZone = String((row as { zone?: string }).zone || "mainboard").toLowerCase();
    if (fromZone === newZoneRaw) {
      return NextResponse.json({ ok: true, id: row.id, zone: newZoneRaw, unchanged: true });
    }
    const deckIdForRow = String(row.deck_id);
    const cardName = String(row.name);
    const qty = Math.max(0, Number(row.qty) || 0);
    if (qty <= 0) {
      return NextResponse.json({ ok: false, error: "Invalid quantity" }, { status: 400 });
    }
    const { data: target } = await supabase
      .from("deck_cards")
      .select("id, qty")
      .eq("deck_id", deckIdForRow)
      .eq("name", cardName)
      .eq("zone", newZoneRaw)
      .maybeSingle();
    if (target?.id) {
      const merged = Math.max(0, (target.qty || 0) + qty);
      const { error: upT } = await supabase.from("deck_cards").update({ qty: merged }).eq("id", target.id);
      if (upT) return NextResponse.json({ ok: false, error: upT.message }, { status: 400 });
      const { error: delM } = await supabase.from("deck_cards").delete().eq("id", row.id);
      if (delM) return NextResponse.json({ ok: false, error: delM.message }, { status: 400 });
      return NextResponse.json({ ok: true, id: target.id, qty: merged, merged: true, zone: newZoneRaw });
    }
    const { error: upZ } = await supabase.from("deck_cards").update({ zone: newZoneRaw }).eq("id", row.id);
    if (upZ) return NextResponse.json({ ok: false, error: upZ.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: row.id, zone: newZoneRaw });
  }

  // Rename path
  if (newNameRaw) {
    const newName = sanitizedNameForDeckPersistence(newNameRaw);
    if (!newName) {
      return NextResponse.json({ ok: false, error: "invalid card name" }, { status: 400 });
    }
    // If another row exists with same (case-sensitive) name, merge quantities
    const { data: existing } = await supabase
      .from('deck_cards')
      .select('id, qty')
      .eq('deck_id', row.deck_id)
      .eq('name', newName)
      .maybeSingle();
    if (existing?.id && existing.id !== row.id) {
      const mergedQty = (existing.qty || 0) + (row.qty || 0);
      const { error: up1 } = await supabase.from('deck_cards').update({ qty: mergedQty }).eq('id', existing.id);
      if (up1) return NextResponse.json({ ok:false, error: up1.message }, { status:400 });
      const { error: del } = await supabase.from('deck_cards').delete().eq('id', row.id);
      if (del) return NextResponse.json({ ok:false, error: del.message }, { status:400 });
      return NextResponse.json({ ok:true, id: existing.id, qty: mergedQty, merged: true, name: newName });
    } else {
      const { error: up } = await supabase.from('deck_cards').update({ name: newName }).eq('id', row.id);
      if (up) return NextResponse.json({ ok:false, error: up.message }, { status:400 });
      return NextResponse.json({ ok:true, id: row.id, name: newName });
    }
  }

  // Quantity delta path
  if (!Number.isFinite(delta as any) || (delta as number) === 0) {
    return NextResponse.json({ ok:false, error:'delta must be non-zero number when renaming is not requested' }, { status:400 });
  }
  const newQty = (row.qty || 0) + (delta as number);
  if (newQty <= 0) {
    const { error: delErr } = await supabase.from("deck_cards").delete().eq("id", id);
    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, deleted: true });
  } else {
    const { error: upErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", id);
    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, qty: newQty });
  }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = sp.get("id") || "";
    const deckId = getDeckId(req.url);
    
    // Support deletion by ID or by deck+name
    if (id) {
      const supabase = await createClient();
      const { error } = await supabase.from("deck_cards").delete().eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    }
    
    // Delete by name (for direct commands)
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? "").trim();
    const qty = Math.max(1, Number(body?.qty ?? 1) || 1);
    const rawZone = String(body?.zone ?? "mainboard").toLowerCase();
    const zone = rawZone === "sideboard" ? "sideboard" : "mainboard";

    if (!deckId || !name) {
      return NextResponse.json({ ok: false, error: "deckId and name required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: existingRows } = await supabase
      .from("deck_cards")
      .select("id, qty, name, zone")
      .eq("deck_id", deckId);
    const nameLower = name.toLowerCase();
    const existing = (existingRows ?? []).find((r) => {
      const z = String((r as { zone?: string }).zone || "mainboard").toLowerCase();
      return (r.name || "").toLowerCase() === nameLower && z === zone;
    });

    if (!existing?.id) {
      return NextResponse.json({ ok: false, error: "Card not found in deck" }, { status: 404 });
    }

    const newQty = Math.max(0, (existing.qty || 0) - qty);
    if (newQty <= 0) {
      const { error } = await supabase.from("deck_cards").delete().eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    } else {
      const { error } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", existing.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, qty: newQty });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

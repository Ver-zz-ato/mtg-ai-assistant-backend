// app/api/decks/upload-csv/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDeckOrCollectionCSV } from "@/lib/csv/parse";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: ures } = await supabase.auth.getUser();
    const user = ures?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ ok: false, error: "Use multipart/form-data" }, { status: 400 });

    const file = form.get("file");
    const deckId = String(form.get("deckId") || "");
    if (!(file instanceof Blob)) return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    if (!deckId) return NextResponse.json({ ok: false, error: "deckId required" }, { status: 400 });

    const { data: deck, error: dErr } = await supabase.from("decks").select("id, user_id").eq("id", deckId).single();
    if (dErr || !deck) return NextResponse.json({ ok: false, error: "Deck not found" }, { status: 404 });
    if (deck.user_id !== user.id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const text = await (file as Blob).text();
    const items = parseDeckOrCollectionCSV(text);

    let added = 0, updated = 0, skipped: string[] = [];
    for (const it of items) {
      const { data: existing } = await supabase.from("deck_cards").select("id, qty").eq("deck_id", deckId).eq("name", it.name).maybeSingle();
      if (existing?.id) {
        const newQty = Math.max(0, Number(existing.qty || 0) + (Number(it.qty) || 0));
        const { error: upErr } = await supabase.from("deck_cards").update({ qty: newQty }).eq("id", existing.id);
        if (upErr) skipped.push(`${it.name} (${it.qty})`); else updated++;
      } else {
        const { error: insErr } = await supabase.from("deck_cards").insert({ deck_id: deckId, name: it.name, qty: it.qty });
        if (insErr) skipped.push(`${it.name} (${it.qty})`); else added++;
      }
    }

    // After importing, rebuild deck_text from all deck_cards so Cost to Finish can load it
    try {
      const { data: allCards } = await supabase.from("deck_cards").select("name, qty").eq("deck_id", deckId).order("name");
      if (allCards && allCards.length > 0) {
        const deckTextLines = allCards.map((c: any) => `${c.qty} ${c.name}`);
        const deckTextString = deckTextLines.join("\n");
        await supabase.from("decks").update({ deck_text: deckTextString }).eq("id", deckId);
      }
    } catch (e) {
      console.warn("Failed to update deck_text after CSV import:", e);
    }

    return NextResponse.json({ ok: true, report: { added, updated, skipped, total: items.length } }, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}

/**
 * Admin bulk import of public decks from CSV.
 * Imports as public decks under the public-decks user.
 * No web scraping - you provide the CSV.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { isAdmin } from "@/lib/admin-check";
import { getAdmin } from "@/app/api/_lib/supa";
import { containsProfanity } from "@/lib/profanity";

const PUBLIC_DECKS_USER_ID = "b8c7d6e5-f4a3-4210-9d00-000000000001";
const MAX_DECKS = 500;

function parseCSV(csvContent: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvContent.split(/\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  let currentRow: string[] = [];
  let inQuotes = false;
  let currentField = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          j++;
        } else inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        currentRow.push(currentField.trim().replace(/^"|"$/g, ""));
        currentField = "";
      } else {
        currentField += char;
      }
    }
    if (!inQuotes) {
      if (currentField) currentRow.push(currentField.trim().replace(/^"|"$/g, ""));
      if (currentRow.length > 0) {
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = currentRow[idx] ?? "";
        });
        rows.push(row);
      }
      currentRow = [];
      currentField = "";
    } else {
      currentField += "\n";
    }
  }
  return { headers, rows };
}

function parseDecklist(text: string, format: string = "Commander"): { commander: string; cards: Array<{ name: string; qty: number }>; totalCards: number; sideboard: Array<{ name: string; qty: number }> } {
  // Split on blank lines to separate main deck from sideboard
  const sections = text.split(/\n\s*\n/);
  const mainDeckText = sections[0] || "";
  const sideboardText = sections[1] || "";
  
  const lines = mainDeckText.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("#") && !t.startsWith("//") && !t.toLowerCase().startsWith("sideboard");
  });
  if (lines.length === 0) return { commander: "", cards: [], totalCards: 0, sideboard: [] };
  
  // For 60-card formats, first card is NOT a commander - it's just a regular card
  const is60Card = format !== "Commander";
  
  const cards: Array<{ name: string; qty: number }> = [];
  let commander = "";
  let total = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = match ? parseInt(match[1], 10) || 1 : 1;
    const name = match ? match[2] : line;
    
    // For Commander format, first line is the commander
    if (!is60Card && i === 0) {
      commander = name;
      continue;
    }
    
    cards.push({ name, qty });
    total += qty;
  }
  
  // For Commander, add 1 for the commander
  if (!is60Card) {
    total += 1;
  }
  
  // Parse sideboard (for future use, currently ignored)
  const sideboard: Array<{ name: string; qty: number }> = [];
  if (sideboardText) {
    const sbLines = sideboardText.split(/\r?\n/).filter((l) => {
      const t = l.trim();
      return t && !t.startsWith("#") && !t.startsWith("//") && !t.toLowerCase().startsWith("sideboard");
    });
    for (const line of sbLines) {
      const match = line.trim().match(/^(\d+)\s*[xX]?\s+(.+)$/);
      const qty = match ? parseInt(match[1], 10) || 1 : 1;
      const name = match ? match[2] : line.trim();
      if (name) sideboard.push({ name, qty });
    }
  }
  
  return { commander, cards, totalCards: total, sideboard };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdmin(user)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }

    const text = await file.text();
    const { headers, rows } = parseCSV(text);
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows in CSV" }, { status: 400 });
    }
    if (rows.length > MAX_DECKS) {
      return NextResponse.json({ ok: false, error: `Max ${MAX_DECKS} decks per import` }, { status: 400 });
    }

    const admin = getAdmin();
    if (!admin) {
      return NextResponse.json({ ok: false, error: "Admin client unavailable" }, { status: 500 });
    }

    const results: Array<{ title: string; success: boolean; error?: string; deckId?: string }> = [];

    for (const deck of rows) {
      let decklistText = deck.decklist;
      if (!decklistText) {
        decklistText = deck.deck_text ?? deck.deck ?? deck.list ?? deck.cards ?? "";
      }
      const title = (deck.title ?? deck.name ?? "").trim() || "Imported Deck";
      const commander = (deck.commander ?? "").trim();
      const format = (deck.format ?? "Commander").trim() || "Commander";

      if (containsProfanity(title)) {
        results.push({ title, success: false, error: "Profanity in title" });
        continue;
      }
      if (!decklistText) {
        results.push({ title, success: false, error: "Missing decklist" });
        continue;
      }

      const parsed = parseDecklist(decklistText, format);
      const is60Card = format !== "Commander";
      
      // For 60-card formats, commander is optional (can be empty)
      const finalCommander = parsed.commander || commander;
      if (!is60Card && !finalCommander) {
        results.push({ title, success: false, error: "No commander found" });
        continue;
      }

      const minCards = is60Card ? 58 : 96;
      const maxCards = is60Card ? 61 : 101;
      if (parsed.totalCards < minCards || parsed.totalCards > maxCards) {
        results.push({ title, success: false, error: `Has ${parsed.totalCards} cards (expected ${format === "Commander" ? "99+1" : "60"} for ${format})` });
        continue;
      }

      // Build deck text - for 60-card formats, no commander line
      let deckText = "";
      if (!is60Card && finalCommander) {
        deckText = `${finalCommander}\n`;
      }
      for (const c of parsed.cards) {
        deckText += `${c.qty} ${c.name}\n`;
      }

      const { data: existing } = await admin
        .from("decks")
        .select("id")
        .eq("title", title)
        .eq("user_id", PUBLIC_DECKS_USER_ID)
        .maybeSingle();

      if (existing) {
        results.push({ title, success: false, error: "Already exists", deckId: existing.id });
        continue;
      }

      const { data: newDeck, error: deckErr } = await admin
        .from("decks")
        .insert({
          user_id: PUBLIC_DECKS_USER_ID,
          title,
          format,
          plan: "Optimized",
          colors: [],
          currency: "USD",
          deck_text: deckText.trim(),
          commander: is60Card ? null : finalCommander,
          is_public: true,
          public: true,
        })
        .select("id")
        .single();

      if (deckErr || !newDeck) {
        results.push({ title, success: false, error: deckErr?.message ?? "Insert failed" });
        continue;
      }

      const deckId = newDeck.id as string;
      for (const c of parsed.cards) {
        try {
          await admin.from("deck_cards").insert({ deck_id: deckId, name: c.name, qty: c.qty });
        } catch {
          /* ignore */
        }
      }
      // Insert commander only for Commander format
      if (!is60Card && finalCommander) {
        try {
          await admin.from("deck_cards").insert({ deck_id: deckId, name: finalCommander, qty: 1 });
        } catch {
          /* ignore */
        }
      }

      results.push({ title, success: true, deckId });
    }

    const successful = results.filter((r) => r.success).length;
    if (successful > 0) {
      const { pingGoogleSitemap } = await import("@/lib/seo/pingGoogle");
      pingGoogleSitemap().catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      results,
      summary: { total: results.length, successful, failed: results.length - successful },
    });
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}

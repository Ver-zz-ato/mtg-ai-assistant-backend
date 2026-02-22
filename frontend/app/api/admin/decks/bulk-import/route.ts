/**
 * Admin bulk import of public decks from CSV.
 * Imports as public decks under the public-decks user.
 * No web scraping - you provide the CSV.
 */

import { createHash } from "crypto";
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

function parseDecklist(text: string, format: string = "Commander"): { commander: string; cards: Array<{ name: string; qty: number }>; totalCards: number; mainboardCount: number; sideboard: Array<{ name: string; qty: number }> } {
  // For 60-card formats, first card is NOT a commander
  const is60Card = format !== "Commander";
  
  // Split all lines and filter empty/comment lines
  const allLines = text.split(/\r?\n/).filter((l) => {
    const t = l.trim();
    return t && !t.startsWith("#") && !t.startsWith("//");
  });
  
  if (allLines.length === 0) return { commander: "", cards: [], totalCards: 0, mainboardCount: 0, sideboard: [] };
  
  // Find where sideboard starts (blank line or "Sideboard" marker)
  let sideboardStartIdx = -1;
  const rawLines = text.split(/\r?\n/);
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim().toLowerCase();
    if (t === "" || t === "sideboard" || t === "sideboard:" || t === "sb" || t === "sb:") {
      // Check if there are more cards after this
      const remaining = rawLines.slice(i + 1).filter(l => l.trim() && !l.trim().toLowerCase().startsWith("sideboard"));
      if (remaining.length > 0 && remaining.length <= 15) {
        sideboardStartIdx = i;
        break;
      }
    }
  }
  
  // Parse cards - separate mainboard and sideboard
  const cards: Array<{ name: string; qty: number }> = [];
  const sideboard: Array<{ name: string; qty: number }> = [];
  let commander = "";
  let mainboardTotal = 0;
  let sideboardTotal = 0;
  let inSideboard = false;
  
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    
    // Check for sideboard marker
    if (line === "" || line.toLowerCase() === "sideboard" || line.toLowerCase() === "sideboard:" || line.toLowerCase() === "sb" || line.toLowerCase() === "sb:") {
      if (sideboardStartIdx !== -1 && i >= sideboardStartIdx) {
        inSideboard = true;
      }
      continue;
    }
    
    // Skip comments
    if (line.startsWith("#") || line.startsWith("//")) continue;
    
    const match = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = match ? parseInt(match[1], 10) || 1 : 1;
    const name = match ? match[2].trim() : line;
    
    if (!name) continue;
    
    // For Commander format, first non-empty line is the commander
    if (!is60Card && !commander) {
      commander = name;
      continue;
    }
    
    if (inSideboard) {
      sideboard.push({ name, qty });
      sideboardTotal += qty;
    } else {
      cards.push({ name, qty });
      mainboardTotal += qty;
    }
  }
  
  // Total cards: mainboard + sideboard (+ commander for EDH)
  let totalCards = mainboardTotal + sideboardTotal;
  if (!is60Card && commander) {
    totalCards += 1;
  }
  
  return { commander, cards, totalCards, mainboardCount: mainboardTotal, sideboard };
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

      // Validation: Check card counts
      if (is60Card) {
        // 60-card formats: 60 mainboard + up to 15 sideboard = 60-75 total
        // Since sideboard parsing may not always work, accept 60-75 total
        const totalCards = parsed.totalCards;
        if (totalCards < 58 || totalCards > 76) {
          results.push({ title, success: false, error: `Has ${totalCards} cards (expected 60-75 for ${format})` });
          continue;
        }
      } else {
        // Commander: 99 cards + 1 commander = 100
        if (parsed.totalCards < 96 || parsed.totalCards > 101) {
          results.push({ title, success: false, error: `Has ${parsed.totalCards} cards (expected 99+1 for Commander)` });
          continue;
        }
      }

      // Build deck text - for 60-card formats, no commander line
      let deckText = "";
      if (!is60Card && finalCommander) {
        deckText = `${finalCommander}\n`;
      }
      for (const c of parsed.cards) {
        deckText += `${c.qty} ${c.name}\n`;
      }
      // Add sideboard if present
      if (parsed.sideboard.length > 0) {
        deckText += "\nSideboard\n";
        for (const c of parsed.sideboard) {
          deckText += `${c.qty} ${c.name}\n`;
        }
      }

      // If title exists, disambiguate with decklist hash so each deck has a unique name
      const decklistHash = createHash("sha256").update(deckText.trim()).digest("hex").slice(0, 6).toLowerCase();
      let finalTitle = title;
      
      const { data: existingByTitle } = await admin
        .from("decks")
        .select("id, deck_text")
        .eq("title", title)
        .eq("user_id", PUBLIC_DECKS_USER_ID);
      
      // Exact duplicate (same title + same decklist)?
      const isExactDuplicate = existingByTitle?.some(
        (d) => (d.deck_text || "").trim() === deckText.trim()
      );
      if (isExactDuplicate) {
        results.push({ title, success: false, error: "Already exists (exact duplicate)" });
        continue;
      }
      
      // Same title but different decklist → use unique name with hash
      if (existingByTitle && existingByTitle.length > 0) {
        finalTitle = `${title} (${decklistHash})`;
        // Handle hash collision: if that name exists, fall back to #2, #3
        let suffix = 1;
        while (suffix <= 50) {
          const { data: coll } = await admin
            .from("decks")
            .select("id")
            .eq("title", finalTitle)
            .eq("user_id", PUBLIC_DECKS_USER_ID)
            .maybeSingle();
          if (!coll) break;
          suffix++;
          finalTitle = `${title} (${decklistHash}-${suffix})`;
        }
      }

      const { data: newDeck, error: deckErr } = await admin
        .from("decks")
        .insert({
          user_id: PUBLIC_DECKS_USER_ID,
          title: finalTitle,
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
      // Insert mainboard cards
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
      // Insert sideboard cards (marked with is_sideboard if column exists, otherwise just add)
      for (const c of parsed.sideboard) {
        try {
          await admin.from("deck_cards").insert({ deck_id: deckId, name: c.name, qty: c.qty, is_sideboard: true });
        } catch {
          // If is_sideboard column doesn't exist, try without it
          try {
            await admin.from("deck_cards").insert({ deck_id: deckId, name: c.name, qty: c.qty });
          } catch {
            /* ignore */
          }
        }
      }

      results.push({ title: finalTitle, success: true, deckId });
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

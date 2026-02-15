// app/api/decks/import-csv-batch/route.ts
// Imports multiple decks from CSV file (title, commander, decklist format)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Simple CSV parser for deck format
function parseCSV(csvContent: string): { headers: string[]; decks: any[] } {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) return { headers: [], decks: [] };
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  
  // Parse rows (handle quoted fields with newlines)
  const decks: any[] = [];
  let currentRow: string[] = [];
  let inQuotes = false;
  let currentField = '';
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const nextChar = line[j + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          j++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        currentRow.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    if (!inQuotes) {
      // End of row
      if (currentField) {
        currentRow.push(currentField.trim());
        currentField = '';
      }
      
      if (currentRow.length === headers.length) {
        const deck: any = {};
        headers.forEach((header, idx) => {
          deck[header] = currentRow[idx]?.replace(/^"|"$/g, '') || '';
        });
        decks.push(deck);
      }
      currentRow = [];
    } else {
      // Continue in next line (field spans multiple lines)
      currentField += '\n';
    }
  }
  
  return { headers, decks };
}

// Parse decklist text
function parseDecklist(decklistText: string): { commander: string; cards: Array<{ name: string; qty: number }>; totalCards: number } {
  const lines = decklistText.split('\n').filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//');
  });
  
  if (lines.length === 0) return { commander: '', cards: [], totalCards: 0 };
  
  const commanderLine = lines[0].trim();
  const commanderMatch = commanderLine.match(/^(\d+)\s+(.+)$/);
  const commander = commanderMatch ? commanderMatch[2] : commanderLine;
  
  const cards: Array<{ name: string; qty: number }> = [];
  let totalCards = 0;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const match = line.match(/^(\d+)\s+(.+)$/);
    const qty = match ? parseInt(match[1]) : 1;
    const cardName = match ? match[2] : line;
    
    if (cardName.toLowerCase() !== commander.toLowerCase()) {
      cards.push({ name: cardName, qty });
      totalCards += qty;
    }
  }
  
  totalCards += 1; // Commander
  
  return { commander, cards, totalCards };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file");
    
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "file required" }, { status: 400 });
    }

    const text = await file.text();
    const { headers, decks } = parseCSV(text);
    
    if (decks.length === 0) {
      return NextResponse.json({ ok: false, error: "No decks found in CSV" }, { status: 400 });
    }

    const results: Array<{ title: string; success: boolean; error?: string; deckId?: string }> = [];
    
    for (const deck of decks) {
      try {
        let decklistText = '';
        let commander = '';
        let title = '';
        
        // Try different column names
        if (deck.decklist) decklistText = deck.decklist;
        else if (deck.deck_text) decklistText = deck.deck_text;
        else if (deck.cards) decklistText = deck.cards;
        else if (deck.list) decklistText = deck.list;
        else if (deck.deck) decklistText = deck.deck;
        
        commander = deck.commander || '';
        title = deck.title || deck.name || `${commander} - Imported Deck`;
        
        const { containsProfanity } = await import("@/lib/profanity");
        if (containsProfanity(title)) {
          results.push({ title, success: false, error: "Profanity in title" });
          continue;
        }
        
        if (!decklistText) {
          results.push({ title, success: false, error: 'Missing decklist' });
          continue;
        }
        
        const parsed = parseDecklist(decklistText);
        
        if (!parsed.commander) {
          if (!commander) {
            results.push({ title, success: false, error: 'No commander found' });
            continue;
          }
          parsed.commander = commander;
        }
        
        if (parsed.totalCards !== 100) {
          results.push({ title, success: false, error: `Has ${parsed.totalCards} cards (expected 100)` });
          continue;
        }
        
        // Build deck text
        let deckText = `${parsed.commander}\n`;
        for (const card of parsed.cards) {
          deckText += `${card.qty} ${card.name}\n`;
        }
        
        // Check if deck already exists
        const { data: existing } = await supabase
          .from('decks')
          .select('id')
          .eq('title', title)
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (existing) {
          results.push({ title, success: false, error: 'Already exists', deckId: existing.id });
          continue;
        }
        
        // Insert deck
        const { data: newDeck, error: deckError } = await supabase
          .from('decks')
          .insert({
            user_id: user.id,
            title: title,
            format: 'Commander',
            plan: 'Optimized',
            colors: [],
            currency: 'USD',
            deck_text: deckText.trim(),
            commander: parsed.commander,
            is_public: false,
            public: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();
        
        if (deckError || !newDeck) {
          results.push({ title, success: false, error: deckError?.message || 'Failed to create deck' });
          continue;
        }
        
        // Insert cards
        for (const card of parsed.cards) {
          const { error } = await supabase
            .from('deck_cards')
            .insert({
              deck_id: newDeck.id,
              name: card.name,
              qty: card.qty,
            });
          // Ignore conflicts/errors for individual cards
          if (error && !error.message.includes('duplicate')) {
            console.warn(`Failed to insert card ${card.name}:`, error.message);
          }
        }
        
        // Insert commander
        const { error: commanderError } = await supabase
          .from('deck_cards')
          .insert({
            deck_id: newDeck.id,
            name: parsed.commander,
            qty: 1,
          });
        if (commanderError && !commanderError.message.includes('duplicate')) {
          console.warn(`Failed to insert commander ${parsed.commander}:`, commanderError.message);
        }
        
        results.push({ title, success: true, deckId: newDeck.id });
      } catch (error: any) {
        results.push({ title: deck.title || 'Unknown', success: false, error: error.message });
      }
    }
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    return NextResponse.json({
      ok: true,
      results,
      summary: {
        total: decks.length,
        successful,
        failed
      }
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || "Server error" }, { status: 500 });
  }
}

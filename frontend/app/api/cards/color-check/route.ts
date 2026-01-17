import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";
import type { SfCard } from "@/lib/deck/inference";

export const runtime = "nodejs";

function norm(s: string) {
  return String(s || '').toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const cardName = searchParams.get('name');
    const allowedColorsStr = searchParams.get('allowedColors');
    
    if (!cardName) {
      return NextResponse.json({ ok: false, error: 'name parameter required' }, { status: 400 });
    }
    
    const allowedColors = allowedColorsStr ? allowedColorsStr.split(',').map(c => c.trim()).filter(Boolean) : [];
    
    const supabase = await createClient();
    const normalizedName = norm(cardName);
    
    // Try to get card from Scryfall cache
    const { data: cacheRow } = await supabase
      .from('scryfall_cache')
      .select('name, color_identity')
      .eq('name', normalizedName)
      .maybeSingle();
    
    let cardColorIdentity: string[] = [];
    
    if (cacheRow && Array.isArray(cacheRow.color_identity)) {
      cardColorIdentity = cacheRow.color_identity;
    } else {
      // Fallback: try fetching from Scryfall API
      try {
        const scryfallRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`, {
          cache: 'no-store'
        });
        if (scryfallRes.ok) {
          const scryfallJson: any = await scryfallRes.json().catch(() => ({}));
          cardColorIdentity = Array.isArray(scryfallJson?.color_identity) ? scryfallJson.color_identity : [];
        }
      } catch (e) {
        // If API fetch fails, we'll allow the card (permissive fallback)
        return NextResponse.json({ ok: true, allowed: true, cardColors: [], reason: 'Could not fetch card data' });
      }
    }
    
    // Build SfCard-like object for validation
    const card: SfCard = {
      name: cardName,
      color_identity: cardColorIdentity,
      type_line: undefined,
      oracle_text: null,
      cmc: undefined,
      legalities: {},
      mana_cost: undefined
    };
    
    // Check if card is within color identity
    const allowed = allowedColors.length === 0 || isWithinColorIdentity(card, allowedColors);
    
    return NextResponse.json({
      ok: true,
      allowed,
      cardColors: cardColorIdentity,
      allowedColors,
      reason: allowed ? 'Card matches commander color identity' : 'Card does not match commander color identity'
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

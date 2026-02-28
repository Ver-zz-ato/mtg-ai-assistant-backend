import { NextRequest, NextResponse } from "next/server";
import { isWithinColorIdentity } from "@/lib/deck/mtgValidators";

export const runtime = "nodejs";

function norm(s: string) {
  return String(s || '').toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const names: string[] = Array.isArray(body.names) ? body.names : [];
    const allowedColors: string[] = Array.isArray(body.allowedColors) ? body.allowedColors.map((c: string) => c.toUpperCase()) : [];
    
    if (names.length === 0) {
      return NextResponse.json({ ok: true, violations: [] });
    }
    
    if (allowedColors.length === 0) {
      return NextResponse.json({ ok: true, violations: [] });
    }
    
    // Fetch color identity for all cards at once from Scryfall cache
    const { getDetailsForNamesCached } = await import('@/lib/server/scryfallCache');
    const cardDetails = await getDetailsForNamesCached(names);
    
    // Check each card against allowed colors
    const violations: string[] = [];
    
    for (const name of names) {
      const key = norm(name);
      const entry = cardDetails.get(key) || 
        Array.from(cardDetails.entries()).find(([k]) => norm(k) === key)?.[1];
      
      if (!entry) {
        // Card not found in cache - don't flag as violation (might be valid)
        continue;
      }
      
      const cardColors = entry.color_identity || [];
      
      // Use the same validation logic
      const isValid = isWithinColorIdentity(
        { color_identity: cardColors } as any,
        allowedColors
      );
      
      if (!isValid) {
        violations.push(name);
      }
    }
    
    return NextResponse.json({
      ok: true,
      violations,
      checkedCount: names.length,
      violationCount: violations.length
    });
  } catch (e: any) {
    console.error('[batch-color-check] Error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

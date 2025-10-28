import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    console.log('Checking scryfall_cache for bloodline keeper...');
    
    // Check all bloodline keeper variants
    const { data: allBloodline, error } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', '%bloodline keeper%')
      .limit(20);
    
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    
    // Also check what happens with our specific query
    const { data: dfcSearch } = await supabase
      .from('scryfall_cache')
      .select('name')
      .ilike('name', 'bloodline keeper //%')
      .limit(10);
    
    return NextResponse.json({
      ok: true,
      allBloodlineEntries: allBloodline,
      dfcSearchResults: dfcSearch,
      counts: {
        total: allBloodline?.length || 0,
        dfcMatches: dfcSearch?.length || 0
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}


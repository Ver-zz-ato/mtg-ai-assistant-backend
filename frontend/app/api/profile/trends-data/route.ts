import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCardDataForProfileTrends } from "@/lib/server/scryfallCache";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { cardNames } = body;
    
    if (!Array.isArray(cardNames)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Get cached card data
    const cardData = await getCardDataForProfileTrends(cardNames);
    
    // Convert Map to object for JSON serialization
    const result: Record<string, any> = {};
    for (const [key, value] of cardData.entries()) {
      result[key] = value;
    }

    return NextResponse.json({ ok: true, cardData: result });
  } catch (error: any) {
    console.error('Profile trends data error:', error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch trends data" },
      { status: 500 }
    );
  }
}
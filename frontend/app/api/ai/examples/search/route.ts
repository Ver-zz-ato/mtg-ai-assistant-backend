import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";

export async function POST(req: NextRequest) {
  try {
    const { query, category, tags, limit = 3 } = await req.json();
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ examples: [] }, { status: 200 });
    }
    
    // Build query
    let dbQuery = supabase
      .from('user_ai_examples')
      .select('id, query, response, feedback, category, tags')
      .eq('user_id', user.id)
      .eq('feedback', 'positive')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (category) {
      dbQuery = dbQuery.eq('category', category);
    }
    
    if (tags && tags.length > 0) {
      dbQuery = dbQuery.contains('tags', tags);
    }
    
    const { data, error } = await dbQuery;
    
    if (error) {
      console.warn('[examples/search] Error:', error);
      return NextResponse.json({ examples: [] }, { status: 200 });
    }
    
    return NextResponse.json({ examples: data || [] });
  } catch (error) {
    console.warn('[examples/search] Error:', error);
    return NextResponse.json({ examples: [] }, { status: 200 });
  }
}


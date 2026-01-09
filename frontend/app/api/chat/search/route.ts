import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/server-supabase";
import { z } from "zod";

const QuerySchema = z.object({
  q: z.string().min(1).max(200), // Search query
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      q: searchParams.get("q") || "",
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { q, limit, offset } = parsed.data;
    const searchTerm = `%${q}%`; // ILIKE pattern matching

    // First get all user's thread IDs
    const { data: userThreads, error: threadsError } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("user_id", user.id);

    if (threadsError || !userThreads || userThreads.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
      });
    }

    const threadIds = userThreads.map(t => t.id);

    // Search across all user's chat messages in their threads
    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select(`
        id,
        thread_id,
        role,
        content,
        created_at,
        chat_threads (
          id,
          title,
          user_id,
          created_at
        )
      `)
      .in("thread_id", threadIds)
      .ilike("content", searchTerm)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // Format results with thread info
    const results = (messages || []).map((msg: any) => {
      const thread = Array.isArray(msg.chat_threads) ? msg.chat_threads[0] : msg.chat_threads;
      return {
        messageId: msg.id,
        threadId: msg.thread_id,
        threadTitle: thread?.title || "Untitled",
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
        snippet: extractSnippet(msg.content, q), // Extract snippet with highlighted query
      };
    });

    // Get total count for pagination
    const { count } = await supabase
      .from("chat_messages")
      .select("*", { count: "exact", head: true })
      .in("thread_id", threadIds)
      .ilike("content", searchTerm);

    return NextResponse.json({
      ok: true,
      results,
      total: count || 0,
      limit,
      offset,
      hasMore: (count || 0) > offset + limit,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

// Helper to extract a snippet around the search term
function extractSnippet(content: string, query: string, length = 150): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerContent.indexOf(lowerQuery);
  
  if (index === -1) {
    // If exact match not found, return first part of content
    return content.slice(0, length) + (content.length > length ? "..." : "");
  }
  
  // Extract snippet around the match
  const start = Math.max(0, index - 50);
  const end = Math.min(content.length, index + query.length + 100);
  const snippet = content.slice(start, end);
  
  return (start > 0 ? "..." : "") + snippet + (end < content.length ? "..." : "");
}

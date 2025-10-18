import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Simple profanity filter (extensible)
const profanityList = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'hell', 'cock', 'dick', 'pussy', 'fag', 'nigger', 'cunt'];
function isProfane(text: string): boolean {
  const lower = text.toLowerCase();
  return profanityList.some(word => lower.includes(word));
}

/**
 * GET /api/decks/[id]/comments
 * Get all comments for a public deck
 */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    // Check if deck is public
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("is_public")
      .eq("id", deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    if (!deck.is_public) {
      return NextResponse.json(
        { ok: false, error: "Comments only available on public decks" },
        { status: 403 }
      );
    }

    // Get comments with user info
    const { data: comments, error: commentsError } = await supabase
      .from("deck_comments")
      .select(`
        id,
        content,
        created_at,
        updated_at,
        flagged,
        user_id
      `)
      .eq("deck_id", deckId)
      .order("created_at", { ascending: false });

    if (commentsError) {
      console.error("Error fetching comments:", commentsError);
      return NextResponse.json(
        { ok: false, error: "Failed to fetch comments" },
        { status: 500 }
      );
    }

    // Get user metadata for each comment (username/avatar)
    const enrichedComments = await Promise.all(
      (comments || []).map(async (comment) => {
        const { data: userData } = await supabase.auth.admin.getUserById(comment.user_id);
        const meta = userData?.user?.user_metadata || {};
        
        return {
          ...comment,
          author: {
            id: comment.user_id,
            username: meta.username || 'Anonymous',
            avatar: meta.avatar || null,
          },
        };
      })
    );

    return NextResponse.json({
      ok: true,
      comments: enrichedComments,
      count: enrichedComments.length,
    });
  } catch (error: any) {
    console.error("Error in comments GET:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/decks/[id]/comments
 * Add a comment to a public deck
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Must be logged in to comment" },
        { status: 401 }
      );
    }

    // Check if deck is public
    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("is_public")
      .eq("id", deckId)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    if (!deck.is_public) {
      return NextResponse.json(
        { ok: false, error: "Can only comment on public decks" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Comment content required" },
        { status: 400 }
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { ok: false, error: "Comment too long (max 5000 characters)" },
        { status: 400 }
      );
    }

    // Check for profanity
    if (isProfane(content)) {
      return NextResponse.json(
        { ok: false, error: "Comment contains inappropriate language" },
        { status: 400 }
      );
    }

    // Insert comment
    const { data: comment, error: insertError } = await supabase
      .from("deck_comments")
      .insert({
        deck_id: deckId,
        user_id: user.id,
        content: content.trim(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting comment:", insertError);
      return NextResponse.json(
        { ok: false, error: "Failed to post comment" },
        { status: 500 }
      );
    }

    // Get user metadata
    const meta = user.user_metadata || {};
    const enrichedComment = {
      ...comment,
      author: {
        id: user.id,
        username: meta.username || 'Anonymous',
        avatar: meta.avatar || null,
      },
    };

    return NextResponse.json({
      ok: true,
      comment: enrichedComment,
    });
  } catch (error: any) {
    console.error("Error in comments POST:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/decks/[id]/comments?commentId=...
 * Delete a comment (own comment or deck owner)
 */
export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { id: deckId } = await context.params;
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json(
        { ok: false, error: "commentId required" },
        { status: 400 }
      );
    }

    // Get comment and deck info
    const { data: comment, error: commentError } = await supabase
      .from("deck_comments")
      .select("user_id, deck_id")
      .eq("id", commentId)
      .single();

    if (commentError || !comment) {
      return NextResponse.json(
        { ok: false, error: "Comment not found" },
        { status: 404 }
      );
    }

    const { data: deck, error: deckError } = await supabase
      .from("decks")
      .select("user_id")
      .eq("id", comment.deck_id)
      .single();

    if (deckError || !deck) {
      return NextResponse.json(
        { ok: false, error: "Deck not found" },
        { status: 404 }
      );
    }

    // Check if user is comment author or deck owner
    const isAuthor = comment.user_id === user.id;
    const isDeckOwner = deck.user_id === user.id;

    if (!isAuthor && !isDeckOwner) {
      return NextResponse.json(
        { ok: false, error: "Can only delete own comments or comments on own decks" },
        { status: 403 }
      );
    }

    // Delete comment
    const { error: deleteError } = await supabase
      .from("deck_comments")
      .delete()
      .eq("id", commentId);

    if (deleteError) {
      console.error("Error deleting comment:", deleteError);
      return NextResponse.json(
        { ok: false, error: "Failed to delete comment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in comments DELETE:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


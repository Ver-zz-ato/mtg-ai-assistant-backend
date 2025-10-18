"use client";

import React, { useState, useEffect } from 'react';
import { capture } from '@/lib/ph';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  flagged: boolean;
  user_id: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

interface DeckCommentsProps {
  deckId: string;
  isPublic: boolean;
  deckOwnerId?: string;
}

export default function DeckComments({ deckId, isPublic, deckOwnerId }: DeckCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchComments();
    getCurrentUser();
  }, [deckId]);

  async function getCurrentUser() {
    try {
      // Use Supabase client to check auth
      const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
      const supabase = createBrowserSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    } catch (e) {
      console.error('Failed to get current user:', e);
    }
  }

  async function fetchComments() {
    if (!isPublic) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/decks/${deckId}/comments`, { cache: 'no-store' });
      const data = await res.json();
      
      if (data.ok) {
        setComments(data.comments || []);
      } else {
        setError(data.error || 'Failed to load comments');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;

    try {
      setPosting(true);
      setError(null);
      
      const res = await fetch(`/api/decks/${deckId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      const data = await res.json();

      if (data.ok) {
        setComments([data.comment, ...comments]);
        setNewComment('');
        capture('deck_comment_posted', { deck_id: deckId });
      } else {
        setError(data.error || 'Failed to post comment');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment?')) return;

    try {
      const res = await fetch(`/api/decks/${deckId}/comments?commentId=${commentId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (data.ok) {
        setComments(comments.filter(c => c.id !== commentId));
        capture('deck_comment_deleted', { deck_id: deckId, comment_id: commentId });
      } else {
        alert(data.error || 'Failed to delete comment');
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete comment');
    }
  }

  if (!isPublic) {
    return (
      <div className="bg-neutral-900/50 rounded-xl border border-neutral-800 p-6 text-center">
        <p className="text-sm text-gray-400">
          💬 Comments are only available on public decks
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-neutral-900/50 rounded-xl border border-neutral-800 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-neutral-800 rounded w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-neutral-800 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900/50 rounded-xl border border-neutral-800 p-6">
      <h3 className="text-lg font-semibold mb-4">
        💬 Comments ({comments.length})
      </h3>

      {error && (
        <div className="bg-red-900/20 border border-red-800/30 rounded-lg p-3 mb-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Post new comment */}
      <div className="mb-6">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={currentUserId ? "Add a comment..." : "Sign in to comment"}
          disabled={!currentUserId || posting}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          rows={3}
          maxLength={5000}
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-xs text-gray-500">
            {newComment.length}/5000
          </span>
          <button
            onClick={postComment}
            disabled={!currentUserId || !newComment.trim() || posting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {posting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No comments yet. Be the first to comment!
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bg-neutral-800/50 rounded-lg p-4 border border-neutral-700/50">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {comment.author.avatar ? (
                    <img
                      src={comment.author.avatar}
                      alt={comment.author.username}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                      {comment.author.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sm">{comment.author.username}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(comment.created_at).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Delete button for comment author or deck owner */}
                {(currentUserId === comment.user_id || currentUserId === deckOwnerId) && (
                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    title="Delete comment"
                  >
                    Delete
                  </button>
                )}
              </div>
              
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                {comment.content}
              </p>
              
              {comment.flagged && (
                <div className="mt-2 text-xs text-yellow-500">
                  ⚠️ This comment has been flagged for review
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}


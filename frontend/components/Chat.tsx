"use client";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import GuestLimitModal from "@/components/GuestLimitModal";
import { capture } from "@/lib/ph";
import { postMessage, postMessageStream, listMessages } from "@/lib/threads";
import { 
  trackFirstAction, 
  trackChatSessionLength, 
  trackFeatureLimitHit,
  trackValueMomentReached,
  startSession,
  endSession
} from "@/lib/analytics-enhanced";
import { detectErrorRepeat } from "@/lib/frustration-detector";
import { trackDeckCreationWorkflow } from '@/lib/analytics-workflow';
import { aiMemory } from '@/lib/ai-memory';
import type { ChatMessage } from "@/types/chat";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChatErrorFallback, withErrorFallback } from "@/components/ErrorFallbacks";
// Enhanced chat functionality
import { 
  analyzeDeckProblems, 
  generateDeckContext, 
  generateActionChips, 
  generateSourceAttribution,
  formatSourcesText,
  type ActionChip,
  type ChatSource 
} from "@/lib/chat/enhancements";

const DEV = process.env.NODE_ENV !== "production";

// Module-level tracking to prevent React Strict Mode duplicates
let currentlyAddingTypingMessage = false;
// Prevent React Strict Mode duplicate streaming registrations
let activeStreamingRef: { current: string | null } = { current: null };

function isDecklist(text: string): boolean {
  if (!text) return false;
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 6) return false;
  let hits = 0;
  const rxQty = /^(?:SB:\s*)?\d+\s*[xX]?\s+.+$/;
  const rxDash = /^-\s+.+$/;
  for (const l of lines) {
    if (rxQty.test(l) || rxDash.test(l)) hits++;
  }
  return hits >= Math.max(6, Math.floor(lines.length * 0.5));
}

type AnalysisPayload = {
  type: "analysis";
  data: {
    score: number;
    note?: string;
    bands: { curve: number; ramp: number; draw: number; removal: number; mana: number };
    curveBuckets: number[];
    whatsGood?: string[];
    quickFixes?: string[];
    illegalByCI?: number;
    illegalExamples?: string[];
  };
};

async function appendAssistant(threadId: string, content: string) {
  const res = await fetch("/api/chat/messages/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ threadId, role: "assistant", content }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) throw new Error(json?.error?.message || "append failed");
  return true;
}

function Chat() {
  // State management
  const [flags, setFlags] = useState<any>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessagesOriginal] = useState<ChatMessage[]>([]);
  
  // Simple setMessages wrapper - reduced logging
  const setMessages = (updater: any) => {
    setMessagesOriginal(updater);
  };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const [lastDeck, setLastDeck] = useState<string>("");
  const [fmt, setFmt] = useState<'commander'|'standard'|'modern'>('commander');
  const [colors, setColors] = useState<{[k in 'W'|'U'|'B'|'R'|'G']: boolean}>({W:false,U:false,B:false,R:false,G:false});
  const [budget, setBudget] = useState<'budget'|'optimized'|'luxury'>('optimized');
  const [teaching, setTeaching] = useState<boolean>(false);
  const [linkedDeckId, setLinkedDeckId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [fallbackBanner, setFallbackBanner] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0);
  const [showGuestLimitModal, setShowGuestLimitModal] = useState<boolean>(false);
  
  const recognitionRef = useRef<any>(null);
  const streamStartTimeRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSessionStartRef = useRef<number>(0);
  const messageCountRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false); // Guard against React Strict Mode double execution
  const streamingMessageIdRef = useRef<string | null>(null);
  const addingTypingMessageRef = useRef<boolean>(false);
  const skipNextRefreshRef = useRef<boolean>(false); // Skip refresh when we just created a new thread
  
  const COLOR_LABEL: Record<'W'|'U'|'B'|'R'|'G', string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  
  // Auto-scroll to bottom when new messages arrive or when streaming
  // Only scroll the messages container, not the entire page
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      const messagesContainer = messagesEndRef.current.closest('.overflow-y-auto');
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }
  };
  
  useEffect(() => {
    // Use requestAnimationFrame to ensure smooth scrolling without page jumps
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [messages, streamingContent]);

  // Initialize flags and user info
  useEffect(()=>{ 
    (async()=>{ 
      try{ 
        const r = await fetch('/api/config?key=flags', { cache:'no-store' }); 
        const j = await r.json(); 
        if (j?.config?.flags) setFlags(j.config.flags); 
      } catch {} 
    })(); 
  }, []);
  
  useEffect(() => { 
    (async () => { 
      try { 
        const sb = createBrowserSupabaseClient(); 
        const { data } = await sb.auth.getUser(); 
        const u:any = data?.user; 
        const md:any = u?.user_metadata || {}; 
        setDisplayName(String(md.username || u?.email || 'you')); 
        setIsLoggedIn(!!u);
        
        // Load guest message count from localStorage if not logged in
        if (!u) {
          try {
            const stored = localStorage.getItem('guest_message_count');
            setGuestMessageCount(stored ? parseInt(stored, 10) : 0);
          } catch {}
        }
        
        // Initialize chat session tracking
        if (chatSessionStartRef.current === 0) {
          chatSessionStartRef.current = Date.now();
          startSession('chat');
          
          // Track first action if this is their first chat
          if (!localStorage.getItem('analytics_first_action_taken')) {
            trackFirstAction('chat', { is_guest: !u });
          }
        }
      } catch {} 
    })(); 
  }, []);

  const extrasOn = flags ? (flags.chat_extras !== false) : true;

  // Guest chat persistence - save messages to localStorage
  useEffect(() => {
    if (!isLoggedIn && messages.length > 0) {
      try {
        localStorage.setItem('guest_chat_messages', JSON.stringify(messages));
        localStorage.setItem('guest_chat_thread_id', threadId || '');
        // Dispatch event for exit warning component
        window.dispatchEvent(new Event('guest-message-sent'));
      } catch {}
    }
  }, [isLoggedIn, messages, threadId]);

  // Restore guest messages on mount
  useEffect(() => {
    if (!isLoggedIn) {
      try {
        const storedMessages = localStorage.getItem('guest_chat_messages');
        const storedThreadId = localStorage.getItem('guest_chat_thread_id');
        if (storedMessages) {
          const parsed = JSON.parse(storedMessages);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
            if (storedThreadId) {
              setThreadId(storedThreadId);
            }
            capture('guest_chat_restored', { message_count: parsed.length });
          }
        }
      } catch {}
    }
  }, []); // Only run on mount

  // Message management functions
  let currentAbort: AbortController | null = null;

  async function refreshMessages(tid: string | null) {
    if (!tid) { 
      // Don't clear messages if we already have messages (e.g., from streaming)
      // Only clear if we're explicitly starting fresh
      return; 
    }
    
    try {
      if (currentAbort) { try { currentAbort.abort(); } catch {} }
      currentAbort = new AbortController();
      const { messages } = await listMessages(tid);
      const uniqueMessages = Array.isArray(messages) ? messages.filter((msg, index, arr) => 
        arr.findIndex(m => String(m.id) === String(msg.id)) === index
      ) : [];
      
      // Prevent clearing messages during active streaming to avoid UI glitches
      if (!isStreaming) {
        setMessages(uniqueMessages);
      }
    } catch (e: any) {
      // Handle auth errors gracefully for guests
      if (String(e?.message || "").toLowerCase().includes("auth session missing") || 
          String(e?.message || "").toLowerCase().includes("invalid refresh token") ||
          String(e?.message || "").toLowerCase().includes("http 401")) {
        // Guest user trying to access auth-required thread - clear and continue as guest
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); } catch {}
        setThreadId(null);
        if (!isStreaming) setMessages([]); // Only clear if not streaming
        return;
      }
      if (String(e?.message || "").toLowerCase().includes("thread not found")) {
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); } catch {}
        setThreadId(null);
        return;
      }
      // Only throw for unexpected errors - suppress auth errors for guests
      console.warn('Non-critical chat error:', e?.message);
    }
  }

  // Thread management
  useEffect(() => {
    try {
      if (!threadId) {
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('chat:last_thread') : null;
        if (saved && /^[0-9a-f\-]{36}$/i.test(saved)) setThreadId(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (threadId) {
        if (typeof window !== 'undefined') window.localStorage.setItem('chat:last_thread', String(threadId));
      }
      
      // Skip refresh if we just created a new thread (messages are already in UI)
      if (skipNextRefreshRef.current) {
        skipNextRefreshRef.current = false;
        return;
      }
      
      refreshMessages(threadId);
    } catch {}
  }, [threadId]);
  
  // Track chat session length on unmount
  useEffect(() => {
    return () => {
      if (chatSessionStartRef.current > 0 && messageCountRef.current > 0) {
        const durationMinutes = Math.round((Date.now() - chatSessionStartRef.current) / (1000 * 60));
        trackChatSessionLength(messageCountRef.current, durationMinutes, []);
        endSession('chat', { 
          messages_sent: messageCountRef.current,
          is_guest: !isLoggedIn
        });
      }
    };
  }, [isLoggedIn]);

  // Deck linking
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!threadId) { setLinkedDeckId(null); return; }
      try {
        const r = await fetch('/api/chat/threads/get', { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j?.threads) ? j.threads : Array.isArray(j?.data) ? j.data : [];
        const one = arr.find((t:any)=>t.id===threadId);
        if (!cancelled) setLinkedDeckId(one?.deck_id || null);
      } catch { if (!cancelled) setLinkedDeckId(null); }
    }
    probe();
    return () => { cancelled = true; };
  }, [threadId]);

  // Utility functions
  function newChat() {
    setThreadId(null);
    setMessages([]);
    setText("");
    setStreamingContent("");
    setIsStreaming(false);
    if (streamAbort) {
      streamAbort.abort();
      setStreamAbort(null);
    }
    try { 
      if (typeof window !== 'undefined') window.localStorage.removeItem('chat:last_thread'); 
    } catch {}
    setHistKey(k => k + 1);
  }

  function clearThread() {
    if (process.env.NODE_ENV === 'development') {
      setMessages([]);
      setText("");
      setIsStreaming(false);
      setStreamingContent("");
      if (streamAbort) {
        streamAbort.abort();
        setStreamAbort(null);
      }
    }
  }

  function gotoMyDecks() { 
    window.location.href = "/my-decks"; 
  }

  // Voice input functionality
  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser. Please try Chrome or Edge.');
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        if (finalTranscript) {
          setText(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please enable microphone permissions for this site.');
        } else if (event.error === 'network') {
          alert('Network error during voice recognition. Please check your internet connection.');
        } else if (event.error !== 'no-speech') {
          alert(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  // Main send function
  async function send() {
    if (!text.trim() || busy) return;
    
    // Prevent double execution in React Strict Mode (immediate effect)
    if (isExecutingRef.current) {
      return;
    }
    
    // Check if streaming is already active to prevent React Strict Mode duplicates
    if (activeStreamingRef.current) {
      return;
    }
    
    // Mark as executing immediately
    isExecutingRef.current = true;
    
    // Declare streamingMsgId at function scope for cleanup access
    let streamingMsgId: string = '';
    
    // Reset the flag when done (in finally block)
    try {
    
    // Check guest message limits
    if (!isLoggedIn && guestMessageCount >= 20) {
      trackFeatureLimitHit('guest_chat', guestMessageCount, 20);
      setShowGuestLimitModal(true);
      return;
    }
    
    // Show warnings at 15 and 18 messages
    if (!isLoggedIn) {
      if (guestMessageCount === 14) {
        // 15th message - first warning
        const { toast } = await import('@/lib/toast-client');
        toast('⚠️ 5 messages left - Sign up to continue chatting!', 'warning');
        capture('guest_limit_warning_15');
      } else if (guestMessageCount === 17) {
        // 18th message - urgent warning
        const { toast } = await import('@/lib/toast-client');
        toast('🚨 Only 2 messages left! Create a free account to keep chatting.', 'warning');
        capture('guest_limit_warning_18');
      }
    }
    
    // Track user action for error boundary context
    try {
      sessionStorage.setItem('last_user_action', 'sending_chat_message');
    } catch {}
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    const val = text;
    const looksDeck = isDecklist(val);
    if (looksDeck) setLastDeck(val);

    setText("");
    setBusy(true);
    const userMsgId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setMessages((m: any) => [
      ...m,
      { id: userMsgId, thread_id: threadId || "", role: "user", content: val, created_at: new Date().toISOString() } as any,
    ]);

    // Track analytics
    const streamStartTime = Date.now();
    streamStartTimeRef.current = streamStartTime;
    capture('chat_sent', { 
      chars: (val?.length ?? 0), 
      thread_id: threadId ?? null,
      is_decklist: looksDeck,
      format: fmt,
      budget: budget,
      teaching_mode: teaching
    });

    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k), teaching };
    
    // Build enhanced context with deck-aware problem analysis
    let deckContext = '';
    if (linkedDeckId) {
      try {
        const deckProblems = await analyzeDeckProblems(linkedDeckId);
        if (deckProblems.length > 0) {
          deckContext = generateDeckContext(deckProblems, 'Current Deck');
        }
      } catch (error) {
        console.warn('Failed to generate deck context:', error);
      }
    }
    
    // Get AI memory context
    let memoryContext = '';
    try {
      if (localStorage.getItem('ai_memory_consent') === 'true') {
        memoryContext = aiMemory.getChatContext();
      }
    } catch {}
    
    const context: any = { 
      deckId: linkedDeckId || null, 
      budget, 
      colors: prefs.colors, 
      teaching,
      deckContext: deckContext,
      memoryContext: memoryContext
    };
    
    // For logged-in users: Create thread before streaming if one doesn't exist
    let currentThreadId = threadId;
    if (isLoggedIn && !currentThreadId) {
      try {
        const title = val.slice(0, 60).replace(/\s+/g, " ").trim();
        const createRes = await fetch('/api/chat/threads/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, deckId: linkedDeckId || null })
        });
        const createJson = await createRes.json();
        if (createJson.ok && createJson.id) {
          currentThreadId = createJson.id;
          skipNextRefreshRef.current = true; // Skip the refresh triggered by setThreadId
          setThreadId(currentThreadId);
          setHistKey(k => k + 1);
        }
      } catch (e) {
        // Thread creation failed, continue with guest mode
      }
    }
    
    // Save user message to the thread (for logged-in users)
    if (isLoggedIn && currentThreadId) {
      // Add user message to UI immediately with deduplication
      const userMsgId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      let userMessageAdded = false; // Closure variable to prevent React Strict Mode duplicates
      
      setMessages((prev: any) => {
        // Check closure variable to prevent React Strict Mode double-execution
        if (userMessageAdded) {
          return prev;
        }
        
        // Check if this exact message content already exists (safety check)
        const hasUserMessage = prev.some((msg: any) => 
          msg.role === 'user' && 
          msg.content === val && 
          msg.thread_id === currentThreadId
        );
        if (hasUserMessage) {
          return prev;
        }
        
        // Mark as added in closure
        userMessageAdded = true;
        
        return [
          ...prev,
          {
            id: userMsgId,
            thread_id: currentThreadId,
            role: "user",
            content: val,
            created_at: new Date().toISOString()
          } as any
        ];
      });
      
      // Save to database (fire and forget)
      try {
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            threadId: currentThreadId, 
            message: { role: 'user', content: val }
          })
        });
      } catch (e) {
        // Silently fail - message is already in UI
      }
    }
    
    // Try streaming
    let streamFailed = false;
    let guestLimitExceeded = false;
    const abortController = new AbortController();
    setStreamAbort(abortController);
    setIsStreaming(true);
    setStreamingContent("");
    setFallbackBanner("");

    // Generate unique streaming message ID for each execution (prevent React Strict Mode duplicates)
    streamingMsgId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    streamingMessageIdRef.current = streamingMsgId;
    
    // Use closure variable to track if we've already added typing message in this execution
    let typingMessageAdded = false;
    
    setMessages((prev: any) => {
      // Check closure variable first - this should work across React Strict Mode calls
      if (typingMessageAdded) {
        return prev;
      }
      
      // Check if typing message already exists in state
      const hasTyping = prev.some((msg: any) => msg.role === 'assistant' && msg.content === 'Typing…');
      if (hasTyping) {
        return prev;
      }
      
      // Mark as added in closure
      typingMessageAdded = true;
      
      return [
        ...prev,
        {
          id: streamingMsgId,
          thread_id: currentThreadId || "",
          role: "assistant",
          content: "Typing…",
          created_at: new Date().toISOString()
        } as any,
      ];
    });

    // Set active streaming reference BEFORE starting stream to prevent race conditions
    activeStreamingRef.current = streamingMsgId;

    // Use a closure variable to accumulate streaming content and avoid React Strict Mode double-execution issues
    let accumulatedContent = '';

    try {
      await postMessageStream(
        { text: val, threadId: currentThreadId, context, prefs, guestMessageCount: !isLoggedIn ? guestMessageCount : undefined },
        (token: string) => {
          // Validate that this is still the active streaming session
          if (activeStreamingRef.current !== streamingMsgId) {
            return;
          }
          
          // Accumulate content in closure variable (not affected by React Strict Mode)
          accumulatedContent += token;
          
          // Update streaming content display ONLY - don't touch messages array during streaming
          // The messages array will be updated once at the end in onDone callback
          setStreamingContent(accumulatedContent);
        },
        () => {
          // Now that streaming is complete, update the messages array with the final content
          setMessages((m: any) => {
            const existingIndex = m.findIndex((msg: any) => msg.id === streamingMsgId);
            
            if (existingIndex !== -1) {
              // Update the existing "Typing..." placeholder with final content
              const newMessages = [...m];
              newMessages[existingIndex] = {
                ...newMessages[existingIndex],
                content: accumulatedContent
              };
              return newMessages;
            } else {
              // Placeholder was removed somehow, add the message back
              return [
                ...m,
                {
                  id: streamingMsgId,
                  thread_id: currentThreadId || "",
                  role: "assistant",
                  content: accumulatedContent,
                  created_at: new Date().toISOString()
                } as any
              ];
            }
          });
          
          setIsStreaming(false);
          setStreamAbort(null);
          setStreamingContent(''); // Clear streaming content display
          streamingMessageIdRef.current = null; // Clear the streaming message ID
          
          // Clear active streaming reference when StreamingPacer finishes
          if (activeStreamingRef.current === streamingMsgId) {
            activeStreamingRef.current = null;
          }
          
          // Save assistant's response to the thread (for logged-in users)
          if (isLoggedIn && currentThreadId && accumulatedContent) {
            fetch('/api/chat/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                threadId: currentThreadId, 
                message: { role: 'assistant', content: accumulatedContent }
              })
            }).catch(() => {
              // Silently fail - message is already in UI
            });
          }
          
          messageCountRef.current += 1;
          
          // Track value moment for first successful chat response
          if (messageCountRef.current === 1 && accumulatedContent.length > 50) {
            trackValueMomentReached('first_good_chat_response');
          }
          
          capture('chat_stream_stop', {
            stopped_by: 'complete',
            duration_ms: Date.now() - streamStartTime,
            tokens_if_known: Math.ceil(accumulatedContent.length / 4)
          });
        },
        (error: Error) => {
          setIsStreaming(false);
          setStreamAbort(null);
          
          // Clear active streaming reference on error
          if (activeStreamingRef.current === streamingMsgId) {
            activeStreamingRef.current = null;
          }
          
          if (error.message === "fallback") {
            streamFailed = true;
            capture('chat_stream_fallback', { reason: 'fallback_response' });
          } else if (error.message === "guest_limit_exceeded") {
            // Handle guest limit exceeded specifically
            streamFailed = true;
            guestLimitExceeded = true;
            setMessages((m: any) => m.filter((msg: any) => msg.id !== streamingMsgId)); // Remove streaming message
            const errorMsgId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            setMessages((m: any) => [
              ...m,
              { 
                id: errorMsgId, 
                thread_id: threadId || "", 
                role: "assistant", 
                content: "You've reached the guest message limit of 20 messages. Please sign in to continue chatting!", 
                created_at: new Date().toISOString() 
              } as any,
            ]);
            capture('chat_guest_limit', { message_count: guestMessageCount });
          } else {
            console.error("Stream error:", error);
            streamFailed = true;
            
            // Track repeated errors for frustration detection
            detectErrorRepeat('chat_stream_error', error.message);
            
            capture('chat_stream_error', {
              reason: error.message || 'unknown',
              duration_ms: Date.now() - streamStartTime,
              had_partial: streamingContent.length > 0
            });
          }
        },
        abortController.signal
      );
    } catch (error) {
      setIsStreaming(false);
      setStreamAbort(null);
      streamFailed = true;
      
      capture('chat_stream_error', {
        reason: String(error).substring(0, 100),
        duration_ms: Date.now() - streamStartTime,
        had_partial: streamingContent.length > 0
      });
        } finally {
          // Don't clear activeStreamingRef here - let onDone callback handle it
          // The StreamingPacer may still be emitting tokens after postMessageStream resolves
        }

    // Update guest message count for non-logged in users (only if not limit exceeded)
    if (!isLoggedIn && !guestLimitExceeded) {
      const newCount = guestMessageCount + 1;
      setGuestMessageCount(newCount);
      try {
        localStorage.setItem('guest_message_count', String(newCount));
      } catch {}
    }
    
    let res: any;
    if (streamFailed) {
      // Remove the streaming placeholder message since streaming failed
      setMessages((m: any) => m.filter((msg: any) => msg.id !== streamingMsgId));
      
      if (guestLimitExceeded) {
        // Don't try fallback if guest limit was exceeded
        res = { ok: true }; // Treat as success to avoid error message
      } else {
        // Fall back to regular post message (no streaming)
        res = await postMessage({ 
          text: val, 
          threadId, 
          context,
          guestMessageCount: !isLoggedIn ? guestMessageCount : undefined 
        }, threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));
      }
    } else {
      // Streaming succeeded - don't call postMessage again to avoid duplicates
      // The streamed message is already complete in the UI
      res = { ok: true, threadId: currentThreadId };
    }

    let tid = currentThreadId as string | null;
    if ((res as any)?.ok) {
      tid = (res as any).threadId as string;
      if (tid !== threadId) setThreadId(tid);
      setHistKey(k => k + 1);
      
      // Don't refresh messages after streaming to avoid duplicates
      // The streamed message is already in the UI
    } else {
      const errorMsg = res?.error?.message || "Chat failed";
      try { 
        const tc = await import("@/lib/toast-client");
        tc.toastError(errorMsg);
      } catch {}
      
      const errorMsgId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setMessages((m: any) => [
        ...m,
        { id: errorMsgId, thread_id: threadId || "", role: "assistant", content: `I encountered an error: ${errorMsg}. Please try asking again.`, created_at: new Date().toISOString() } as any,
      ]);
    }

    setBusy(false);
    } finally {
      // Always reset the execution flags when function completes
      isExecutingRef.current = false;
      streamingMessageIdRef.current = null;
      addingTypingMessageRef.current = false;
      currentlyAddingTypingMessage = false; // Reset module-level flag
    }
  }

  // Render helper components
  function InlineFeedback({ msgId, content }: { msgId: string; content: string }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [text, setText] = useState("");
    const [len, setLen] = useState(0);
    const maxLen = 500;
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    
    function onChangeText(v: string) {
      setText(v.slice(0, maxLen));
      setLen(Math.min(v.length, maxLen));
      // Auto-grow textarea height
      try {
        const el = taRef.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(200, el.scrollHeight)}px`;
      } catch {}
    }

    async function send(rating: number) {
      setBusy(true);
      try {
        await fetch('/api/feedback', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ rating, text }) });
        try { const { capture } = await import("@/lib/ph"); capture('chat_feedback', { rating, thread_id: threadId ?? null, msg_id: msgId }); } catch {}
        try { const tc = await import("@/lib/toast-client"); tc.toast('Thanks for the feedback!', 'success'); } catch {}
        setOpen(false); setText(""); setLen(0);
      } catch(e:any) {
        try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Failed to send'); } catch {}
      } finally { setBusy(false); }
    }

    async function quickReact(emoji: '😍'|'😐'|'😞') {
      // Map to rating: love=1, neutral=0, dislike=-1
      const score = emoji==='😍' ? 1 : emoji==='😐' ? 0 : -1;
      setText(emoji);
      await send(score);
    }
    
    return (
      <>
        {!open && (
          <div className="pointer-events-auto absolute right-1 bottom-2 md:bottom-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out text-[10px]">
            <button title="Helpful" onClick={()=>send(1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👍</button>
            <button title="Not helpful" onClick={()=>send(-1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👎</button>
            <button title="Comment" onClick={()=>setOpen(true)} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">💬</button>
          </div>
        )}
        {open && (
          <div className="mt-2 w-full">
            <textarea
              ref={taRef}
              value={text}
              onChange={(e)=>onChangeText(e.target.value)}
              rows={3}
              placeholder="Optional feedback on this message"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 resize-none overflow-hidden"
              maxLength={maxLen}
              onFocus={()=>{ try{ const el=taRef.current; if(el){ el.style.height='auto'; el.style.height=`${Math.min(200, el.scrollHeight)}px`; } } catch{} }}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="text-[10px] opacity-70">{len}/{maxLen} characters</div>
              <div className="flex gap-2">
                <button onClick={()=>send(1)} disabled={busy} className="px-2 py-[2px] rounded bg-emerald-600 text-white">Send 👍</button>
                <button onClick={()=>send(-1)} disabled={busy} className="px-2 py-[2px] rounded bg-red-700 text-white">Send 👎</button>
                <button onClick={()=>setOpen(false)} disabled={busy} className="px-2 py-[2px] rounded border border-neutral-600">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  function ManaIcon({ c, active }: { c: 'W'|'U'|'B'|'R'|'G'; active: boolean }){
    const srcCdn = c==='W' ? 'https://svgs.scryfall.io/card-symbols/W.svg'
      : c==='U' ? 'https://svgs.scryfall.io/card-symbols/U.svg'
      : c==='B' ? 'https://svgs.scryfall.io/card-symbols/B.svg'
      : c==='R' ? 'https://svgs.scryfall.io/card-symbols/R.svg'
      : 'https://svgs.scryfall.io/card-symbols/G.svg';
    
    return (
      <img
        src={srcCdn}
        alt={`${COLOR_LABEL[c]} mana`}
        width={16}
        height={16}
        className="block"
        style={{ 
          filter: active ? 'saturate(1.3) brightness(1.1) contrast(1.1)' : 'grayscale(100%) brightness(60%)',
          opacity: active ? 1 : 0.6
        }}
        onError={(e) => {
          // Fallback to colored circle if image fails with more vibrant colors
          const target = e.currentTarget;
          const color = c==='W'?'#FFF8DC':c==='U'?'#1E90FF':c==='B'?'#2F2F2F':c==='R'?'#FF4500':'#228B22';
          target.style.display = 'none';
          const fallback = document.createElement('div');
          fallback.style.cssText = `width:16px;height:16px;border-radius:50%;background-color:${color};display:inline-block;border:1px solid rgba(255,255,255,0.2);`;
          fallback.textContent = c;
          fallback.style.color = c === 'W' ? '#000' : '#FFF';
          fallback.style.fontSize = '10px';
          fallback.style.textAlign = 'center';
          fallback.style.lineHeight = '14px';
          fallback.style.fontWeight = 'bold';
          target.parentNode?.replaceChild(fallback, target);
        }}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
      {/* Mobile-optimized Header */}
      <div className="bg-neutral-900 p-3 sm:p-4 border-b border-neutral-700 flex-shrink-0">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-center bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 bg-clip-text text-transparent">AI Assistant</h1>
            {!threadId && (
              <span className="text-xs px-2 py-1 bg-neutral-800 rounded-full text-neutral-400">
                New Chat
              </span>
            )}
            {!isLoggedIn && (
              <span className="text-xs px-2 py-1 bg-yellow-900 rounded-full text-yellow-200">
                Guest Mode ({guestMessageCount}/20)
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* Collapsible preferences and thread selector for mobile */}
      <div className="p-2 sm:p-4 space-y-3 border-b border-neutral-800 flex-shrink-0">
        {/* Preferences strip */}
        {extrasOn && (
          <div className="w-full border border-neutral-800 bg-neutral-900/60 rounded-lg px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 text-sm sm:text-base">
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Format:</span>
                {(['commander','standard','modern'] as const).map(f => (
                  <button
                    key={f}
                    onClick={()=>setFmt(f)}
                    className={`px-2 py-1 sm:px-3 sm:py-2 rounded border touch-manipulation text-xs sm:text-sm ${fmt===f?'bg-blue-700 text-white border-blue-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{f}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Colors:</span>
                {(['W','U','B','R','G'] as const).map(c => (
                  <button
                    key={c}
                    onClick={()=>setColors(s=>({...s,[c]:!s[c]}))}
                    className={`px-1 py-1 sm:px-2 sm:py-1 rounded border touch-manipulation ${colors[c]?'bg-neutral-900 border-neutral-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'} flex flex-col items-center gap-1`}
                    title={`Color identity filter: ${COLOR_LABEL[c]}`}
                    aria-label={`Color identity filter: ${COLOR_LABEL[c]}`}
                  >
                    <span className={`relative inline-flex items-center justify-center rounded-full ${colors[c] ? 'ring-2 ring-offset-2 ring-offset-neutral-900 ' + (c==='W'?'ring-amber-300':c==='U'?'ring-sky-400':c==='B'?'ring-slate-400':c==='R'?'ring-red-400':'ring-emerald-400') : ''}`} style={{ width: 20, height: 20 }}>
                      <ManaIcon c={c as any} active={true} />
                    </span>
                    <span className="text-[8px] sm:text-[10px] opacity-80">{COLOR_LABEL[c]}</span>
                  </button>
                ))}
                <button
                  onClick={()=>setColors({W:false,U:false,B:false,R:false,G:false})}
                  className="px-2 py-1 sm:px-3 sm:py-2 rounded border bg-neutral-900 border-neutral-700 hover:bg-neutral-800 touch-manipulation text-xs sm:text-sm"
                  title="Clear color identity filter"
                >Clear</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Value:</span>
                {(['budget','optimized','luxury'] as const).map(b => (
                  <button
                    key={b}
                    onClick={()=>setBudget(b)}
                    className={`px-2 py-1 sm:px-3 sm:py-2 rounded border touch-manipulation text-xs sm:text-sm ${budget===b?'bg-emerald-700 text-white border-emerald-600':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{b}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="opacity-70 text-xs sm:text-sm">Teaching:</span>
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm touch-manipulation">
                  <input type="checkbox" checked={!!teaching} onChange={e=>setTeaching(e.target.checked)} className="touch-manipulation" />
                  <span className="opacity-80">Explain in more detail</span>
                </label>
              </div>
            </div>
          </div>
        )}
        
        {/* Thread selector */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <HistoryDropdown data-testid="history-dropdown" key={histKey} value={threadId} onChange={setThreadId} />
          </div>
        </div>

        <div className="w-full">
          <ThreadMenu
            threadId={threadId}
            onChanged={() => setHistKey((k: any) => k + 1)}
            onDeleted={() => { setThreadId(null); setMessages([]); setHistKey((k: any) => k + 1); }}
            onNewChat={newChat}
          />
        </div>

        {/* Assistant spotlight header */}
        <div className="">
          <div className="text-sm font-semibold opacity-90">Your deck-building assistant</div>
        </div>
      </div>
      
      {/* Messages area - flexible with scrolling */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {fallbackBanner && (
          <div className="mb-2 px-3 py-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-sm flex-shrink-0">
            {fallbackBanner}
          </div>
        )}
        
        {/* Context reminder bar */}
        {(() => {
          const activeFilters: string[] = [];
          if (fmt && fmt !== 'commander') activeFilters.push(fmt.charAt(0).toUpperCase() + fmt.slice(1));
          else if (fmt === 'commander') activeFilters.push('Commander');
          
          const activeColors = Object.entries(colors).filter(([_, v]) => v).map(([k]) => COLOR_LABEL[k as keyof typeof COLOR_LABEL]);
          if (activeColors.length > 0) activeFilters.push(activeColors.join('-'));
          
          // Show budget if it's set (including 'optimized')
          if (budget) activeFilters.push(budget.charAt(0).toUpperCase() + budget.slice(1));
          
          if (activeFilters.length > 0) {
            return (
              <div className="mb-2 px-3 py-1.5 bg-neutral-900/60 border border-neutral-700 rounded text-neutral-300 text-xs flex-shrink-0 flex items-center gap-1.5">
                <span className="opacity-70">Using:</span>
                <span className="font-medium">{activeFilters.join(' • ')}</span>
              </div>
            );
          }
          return null;
        })()}
        
        <div className="flex-1 space-y-3 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded p-3 overflow-y-auto overscroll-behavior-y-contain min-h-0 max-h-full">
          {/* Messages with streaming content */}
          {(!Array.isArray(messages) || messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
              <div className="text-6xl mb-6">💬</div>
              <h3 className="text-xl font-bold text-neutral-200 mb-3">
                Welcome to ManaTap AI!
              </h3>
              <p className="text-neutral-400 mb-8 max-w-md">
                Start building your perfect deck. Ask me anything about Magic: The Gathering, or get started with a sample Commander deck.
              </p>
              <div className="flex gap-4 flex-wrap justify-center">
                {(()=>{ try { const { SampleDeckButton } = require('./SampleDeckSelector'); return <SampleDeckButton />; } catch { return null; } })()}
                <div className="text-xs text-neutral-500 w-full mt-4">
                  💡 Try: "Build me a Gruul aggro deck" or "Find budget alternatives for Sol Ring"
                </div>
              </div>
            </div>
          ) : messages.map((m) => {
            const isAssistant = m.role === "assistant";
            return (
              <div key={m.id} className={isAssistant ? "text-right" : "text-left"}>
                <div
                  className={
                    "group inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
                    (isAssistant ? "bg-blue-900/40" : "bg-neutral-800")
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                    <span>{isAssistant ? 'assistant' : (displayName || 'you')}</span>
                  </div>
                  <div className="leading-relaxed">{m.content}</div>
                  {isAssistant && (
                    <div className="mt-2">
                      <InlineFeedback msgId={String(m.id)} content={String(m.content || '')} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Show streaming content */}
          {isStreaming && streamingContent && (
            <div className="text-right">
              <div className="inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 bg-blue-900/40 whitespace-pre-wrap">
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                  <span>assistant</span>
                  <span className="ml-2 animate-pulse">•••</span>
                </div>
                <div className="leading-relaxed">{streamingContent}</div>
              </div>
            </div>
          )}
          
          {/* Scroll anchor for auto-scroll */}
          <div ref={messagesEndRef} className="h-px" />
        </div>
      </div>
      
      {/* Mobile-optimized input area - sticky at bottom */}
      <div className="p-3 sm:p-4 border-t border-neutral-800 bg-black flex-shrink-0">
        {/* Suggested prompt chips */}
        <div className="mb-3 flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] opacity-90">
          {[
            { label: '"Build me a Commander deck"', text: 'Build me a Commander deck' },
            { label: '"Find budget swaps"', text: 'Find budget swaps' },
            { label: '"Upgrade a precon"', text: 'Upgrade a precon' },
            { label: '"Snapshot my deck"', text: 'Snapshot my deck' },
          ].map((p, i) => (
            <button 
              key={i} 
              onClick={()=>setText(p.text)} 
              className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-800 touch-manipulation"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <textarea
              data-testid="chat-textarea"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask anything or paste a decklist… (Shift+Enter for newline)"
              rows={3}
              className="w-full bg-neutral-900 text-white border border-neutral-700 rounded-lg px-4 py-3 pr-12 resize-none min-h-[80px] text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              style={{
                WebkitAppearance: 'none',
                fontSize: '16px' // Prevents zoom on iOS
              }}
            />
            {/* Mobile-optimized voice input button - positioned inside textarea */}
            <button 
              onClick={toggleVoiceInput} 
              className={`absolute right-2 top-2 p-2 rounded-full border text-white transition-all touch-manipulation ${
                isListening 
                  ? 'bg-red-600 border-red-500 animate-pulse scale-110' 
                  : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600 active:scale-95'
              } sm:hidden`}
              title={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>
          
          {/* Desktop voice input and send buttons */}
          <div className="hidden sm:flex gap-2 sm:flex-col justify-center sm:justify-start">
            <button 
              onClick={toggleVoiceInput} 
              className={`px-3 py-2 h-fit rounded border text-white transition-colors ${
                isListening 
                  ? 'bg-red-600 border-red-500 animate-pulse' 
                  : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600'
              }`}
              title={isListening ? 'Stop voice input' : 'Start voice input'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            {isStreaming ? (
              <button 
                onClick={() => {
                  if (streamAbort) {
                    streamAbort.abort();
                    setStreamAbort(null);
                    setIsStreaming(false);
                    capture('chat_stream_stop', {
                      stopped_by: 'user',
                      duration_ms: Date.now() - streamStartTimeRef.current,
                      tokens_if_known: Math.ceil(streamingContent.length / 4)
                    });
                  }
                }} 
                className="px-4 py-2 h-fit rounded bg-red-600 text-white hover:bg-red-700"
              >
                Stop
              </button>
            ) : (
              <button onClick={send} disabled={busy || !text.trim()} className="px-4 py-2 h-fit rounded bg-blue-600 text-white disabled:opacity-60" data-testid="chat-send">
                {busy ? "…" : "Send"}
              </button>
            )}
          </div>
          
          {/* Mobile send button - full width */}
          <div className="sm:hidden">
            {isStreaming ? (
              <button 
                onClick={() => {
                  if (streamAbort) {
                    streamAbort.abort();
                    setStreamAbort(null);
                    setIsStreaming(false);
                    capture('chat_stream_stop', {
                      stopped_by: 'user',
                      duration_ms: Date.now() - streamStartTimeRef.current,
                      tokens_if_known: Math.ceil(streamingContent.length / 4)
                    });
                  }
                }} 
                className="w-full py-4 rounded-lg bg-red-600 text-white text-lg font-medium hover:bg-red-700 active:bg-red-800 transition-all touch-manipulation"
              >
                Stop Generation
              </button>
            ) : (
              <button 
                onClick={send} 
                disabled={busy || !text.trim()} 
                className="w-full py-4 rounded-lg bg-blue-600 text-white text-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed hover:bg-blue-700 active:bg-blue-800 transition-all touch-manipulation" 
                data-testid="chat-send"
              >
                {busy ? "Thinking..." : "Send Message"}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Guest limit modal */}
      <GuestLimitModal 
        isOpen={showGuestLimitModal} 
        onClose={() => setShowGuestLimitModal(false)}
        messageCount={guestMessageCount}
      />
    </div>
  );
}

// Export Chat component wrapped with error boundary
export default withErrorFallback(Chat, ChatErrorFallback);
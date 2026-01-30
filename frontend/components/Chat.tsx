"use client";
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import HistoryDropdown from "@/components/HistoryDropdown";
import ThreadMenu from "@/components/ThreadMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import GuestLimitModal from "@/components/GuestLimitModal";
import FloatingSignupPrompt from "@/components/FloatingSignupPrompt";
import PostAnalysisSignupPrompt from "@/components/PostAnalysisSignupPrompt";
import { trackGuestValueMoment, hasValueMoment, getValueMomentType } from "@/lib/analytics/guest-value-moment";
import { useCapture } from "@/lib/analytics/useCapture";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { capture } from "@/lib/ph";
import { enrichChatEvent } from "@/lib/analytics/enrichChatEvent";
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
import { logger } from "@/lib/logger";
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
import { extractCardsForImages } from "@/lib/chat/cardImageDetector";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";
import { renderMarkdown } from "@/lib/chat/markdownRenderer";
import { useProStatus } from "@/hooks/useProStatus";
import { getBulkPrices } from "@/lib/chat/actions/bulk-prices";
import { isDecklist } from "@/lib/chat/decklistDetector";

const DEV = process.env.NODE_ENV !== "production";

// Module-level tracking to prevent React Strict Mode duplicates
let currentlyAddingTypingMessage = false;
// Prevent React Strict Mode duplicate streaming registrations
let activeStreamingRef: { current: string | null } = { current: null };

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
  // Rotating example prompts
  const examplePrompts = [
    "Analyze this Commander deck and tell me what it's missing.",
    "Fix the mana base for this 3-colour deck.",
    "Suggest 5 on-colour upgrades for this commander.",
    "Explain the right ramp mix for my deck.",
    "(Experimental) Build a token deck under £50"
  ];
  
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
  const [fmt, setFmt] = useState<'commander'|'standard'|'modern'|'pioneer'|'pauper'>('commander');
  const [colors, setColors] = useState<{[k in 'W'|'U'|'B'|'R'|'G']: boolean}>({W:false,U:false,B:false,R:false,G:false});
  const [budget, setBudget] = useState<'budget'|'optimized'|'luxury'>('optimized');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [teaching, setTeaching] = useState<boolean>(false);
  const [linkedDeckId, setLinkedDeckId] = useState<string | null>(null);
  const [hoveredPromptIndex, setHoveredPromptIndex] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [fallbackBanner, setFallbackBanner] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = checking, false = guest, true = logged in
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0);
  const [showGuestLimitModal, setShowGuestLimitModal] = useState<boolean>(false);
  const [hasDeckAnalyzed, setHasDeckAnalyzed] = useState<boolean>(false);
  const [showReasoning, setShowReasoning] = useState<boolean>(false);
  const { isPro } = useProStatus();
  const [hasSuggestionShown, setHasSuggestionShown] = useState<boolean>(false);
  const [showQuizModal, setShowQuizModal] = useState<boolean>(false);
  const capture = useCapture();
  
  // Card image and price states
  const [cardImages, setCardImages] = useState<Map<string, ImageInfo>>(new Map());
  const [cardPrices, setCardPrices] = useState<Map<string, number>>(new Map());
  const [hoverCard, setHoverCard] = useState<{ name: string; x: number; y: number; src: string } | null>(null);
  
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
  
  // Rotate example prompts every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPromptIndex((prev) => (prev + 1) % examplePrompts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [examplePrompts.length]);

  // Listen for quiz-build-deck event
  useEffect(() => {
    const handleQuizBuildDeck = (e: CustomEvent) => {
      if (e.detail?.message) {
        setText(e.detail.message);
      }
    };
    window.addEventListener('quiz-build-deck', handleQuizBuildDeck as EventListener);
    return () => {
      window.removeEventListener('quiz-build-deck', handleQuizBuildDeck as EventListener);
    };
  }, []);

  // Listen for open-sample-deck-modal event
  useEffect(() => {
    const handleOpenSampleModal = () => {
      setShowQuizModal(false); // Close quiz if open
      // Try to find and click the SampleDeckButton
      setTimeout(() => {
        try {
          const { SampleDeckButton } = require('./SampleDeckSelector');
          // We can't directly trigger the button, so we'll use a ref or state
          // For now, we'll dispatch a custom event that SampleDeckButton can listen to
          const buttons = Array.from(document.querySelectorAll('button'));
          const sampleBtn = buttons.find(btn => 
            btn.textContent?.includes('Sample Deck') || 
            btn.textContent?.includes('Start with a Sample')
          );
          if (sampleBtn) {
            sampleBtn.click();
          }
        } catch {}
      }, 100);
    };
    window.addEventListener('open-sample-deck-modal', handleOpenSampleModal);
    return () => {
      window.removeEventListener('open-sample-deck-modal', handleOpenSampleModal);
    };
  }, []);
  
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
        // Use getSession() instead of getUser() - instant, no network hang
        const { data: { session } } = await sb.auth.getSession(); 
        const u:any = session?.user; 
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
      logger.warn('Non-critical chat error:', { message: e?.message });
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
  
  // Extract and fetch card images and prices from assistant messages (including streaming content)
  useEffect(() => {
    (async () => {
      try {
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        
        // Extract cards from all assistant messages
        const allCards: string[] = [];
        for (const msg of assistantMessages) {
          const extracted = extractCardsForImages(msg.content || '');
          extracted.forEach(card => {
            if (!allCards.includes(card.name)) {
              allCards.push(card.name);
            }
          });
        }
        
        // Also extract cards from streaming content if active
        if (isStreaming && streamingContent) {
          const extracted = extractCardsForImages(streamingContent);
          extracted.forEach(card => {
            if (!allCards.includes(card.name)) {
              allCards.push(card.name);
            }
          });
        }
        
        if (allCards.length === 0) return;
        
        // Fetch images and prices in parallel
        // getImagesForNames only returns cards that exist in scryfall_cache (acts as validation)
        const [imagesMap, pricesMap] = await Promise.all([
          getImagesForNames(allCards),
          getBulkPrices(allCards)
        ]);
        
        // Only keep cards that have images (validation against cache)
        // This filters out false positives like "Good", "Great", etc.
        const validCards = Array.from(imagesMap.keys());
        
        setCardImages(imagesMap);
        setCardPrices(pricesMap);
      } catch (error) {
        logger.warn('Failed to fetch card data:', { error });
      }
    })();
  }, [messages, isStreaming, streamingContent]);

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
    
    // Check guest message limits (lowered from 20 to 10)
    if (!isLoggedIn && guestMessageCount >= 10) {
      trackFeatureLimitHit('guest_chat', guestMessageCount, 10);
      setShowGuestLimitModal(true);
      return;
    }
    
    // Show warnings at 5, 7, and 9 messages (earlier soft prompts)
    if (!isLoggedIn) {
      if (guestMessageCount === 4) {
        // 5th message - early soft prompt
        const { toast } = await import('@/lib/toast-client');
        toast('💡 Enjoying the chat? Sign up to save your progress!', 'info');
        capture('guest_limit_warning_5');
      } else if (guestMessageCount === 6) {
        // 7th message - reminder warning
        const { toast } = await import('@/lib/toast-client');
        toast('⚠️ 3 messages left - Sign up to continue chatting!', 'warning');
        capture('guest_limit_warning_7');
      } else if (guestMessageCount === 8) {
        // 9th message - urgent warning
        const { toast } = await import('@/lib/toast-client');
        toast('🚨 Only 1 message left! Create a free account to keep chatting.', 'warning');
        capture('guest_limit_warning_9');
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
    
    // Track analytics
    const streamStartTime = Date.now();
    streamStartTimeRef.current = streamStartTime;
    capture('chat_sent', enrichChatEvent(
      { 
        chars: (val?.length ?? 0), 
        is_decklist: looksDeck,
        budget: budget,
        teaching_mode: teaching,
        source: 'client'
      },
      {
        threadId: threadId ?? null,
        format: fmt || null,
        userMessage: val || null,
        // commander_name: would need to fetch from linkedDeckId (not available here)
        // persona and prompt_version not available client-side
      }
    ));

    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k), teaching };
    
    // Build enhanced context with deck-aware problem analysis
    let deckContext = '';
    if (linkedDeckId) {
      try {
        // Fetch deck info to get commander and deck_aim
        const deckRes = await fetch(`/api/decks/get?id=${encodeURIComponent(linkedDeckId)}`, { cache: 'no-store' });
        const deckData = await deckRes.json().catch(() => ({ ok: false }));
        const commander = deckData?.deck?.commander || null;
        const deckAim = deckData?.deck?.deck_aim || null;
        
        const deckProblems = await analyzeDeckProblems(linkedDeckId);
        // Always generate context if we have commander or deck_aim, even without problems
        if (deckProblems.length > 0 || commander || deckAim) {
          deckContext = generateDeckContext(deckProblems, 'Current Deck', undefined, commander, deckAim);
        }
      } catch (error) {
        logger.warn('Failed to generate deck context:', { error });
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
    
    // ALWAYS add user message to UI immediately (for both logged-in and guests)
    // This ensures messages are visible even if thread creation fails
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
        (currentThreadId ? msg.thread_id === currentThreadId : true)
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
          thread_id: currentThreadId || "",
          role: "user",
          content: val,
          created_at: new Date().toISOString()
        } as any
      ];
    });
    
    // Dispatch event for homepage signup banner (first message trigger)
    // Check before incrementing (messageCountRef is incremented later in the stream completion)
    const isFirstMessage = messageCountRef.current === 0;
    if (isFirstMessage) {
      window.dispatchEvent(new CustomEvent('message-sent'));
    }
    
    // Save user message to the thread (for logged-in users only)
    if (isLoggedIn && currentThreadId) {
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
    } else if (!isLoggedIn) {
      // For guests, messages are only in UI state (not saved to DB)
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
          
          // Track guest value moment after 2+ chat messages
          if (!isLoggedIn && messageCountRef.current >= 2) {
            trackGuestValueMoment('chat_engaged', capture, {
              chat_count: messageCountRef.current,
            });
          }
          
          capture('chat_stream_stop', enrichChatEvent(
            {
              stopped_by: 'complete',
              duration_ms: Date.now() - streamStartTime,
              tokens_if_known: Math.ceil(accumulatedContent.length / 4),
              assistant_message_id: streamingMsgId
            },
            {
              threadId: currentThreadId || threadId || null,
              userMessage: val || null,
              assistantMessage: accumulatedContent.slice(0, 200) || null,
              format: fmt || null,
              // persona and prompt_version not available client-side
            }
          ));
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
            logger.error("Stream error:", error);
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
        try { 
          const { capture } = await import("@/lib/ph");
          // Find the message being rated
          const message = messages.find((m: any) => String(m.id) === msgId);
          // Find the user message that preceded it
          const messageIndex = messages.findIndex((m: any) => String(m.id) === msgId);
          const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
          
          capture('chat_feedback', enrichChatEvent(
            { rating, msg_id: msgId },
            {
              threadId: threadId ?? null,
              userMessage: userMessage?.content || null,
              assistantMessage: message?.content || content || null,
              format: fmt || null,
              // persona and prompt_version not available client-side
            }
          ));
        } catch {}
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

  // Card image hover handlers
  function handleCardMouseEnter(e: React.MouseEvent, cardName: string) {
    const image = cardImages.get(cardName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim());
    if (!image?.normal) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    setHoverCard({
      name: cardName,
      x: rect.right + 10,
      y: rect.top,
      src: image.normal
    });
  }
  
  function handleCardMouseLeave() {
    setHoverCard(null);
  }
  
  // Render message content with card images at bottom
  function renderMessageContent(content: string, isAssistant: boolean) {
    if (!isAssistant) {
      // User messages: just render markdown
      return renderMarkdown(content);
    }
    
    // Extract cards from this message (handles [[Card Name]] format)
    const extractedCards = extractCardsForImages(content);
    
    // Remove [[Card Name]] markers from display text (they're extracted separately for images)
    // The markers will be replaced with just the card name for natural reading
    const displayContent = content.replace(/\[\[([^\]]+)\]\]/g, '$1');
    
    return (
      <div className="space-y-3">
        {/* Main message content */}
        <div>{renderMarkdown(displayContent)}</div>
        
        {/* Card images row at bottom with price badges */}
        {extractedCards.length > 0 && (
          <div className="flex gap-3 flex-wrap pt-2 border-t border-neutral-600">
            {extractedCards.map((card, idx) => {
              const normalized = card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
              const image = cardImages.get(normalized);
              const price = cardPrices.get(normalized);
              if (!image?.small) return null;
              
              return (
                <div key={idx} className="relative">
                  <img
                    src={image.small}
                    alt={card.name}
                    loading="lazy"
                    decoding="async"
                    className="w-16 h-22 rounded cursor-pointer border border-neutral-600 hover:border-blue-500 transition-colors hover:scale-105"
                    onMouseEnter={(e) => handleCardMouseEnter(e, card.name)}
                    onMouseLeave={handleCardMouseLeave}
                    title={card.name}
                  />
                  {price !== undefined && (
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-lg">
                      ${price.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
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
    <div className="h-screen flex flex-col bg-black text-white overflow-hidden relative">
      {/* Subtle glow animation on chat container */}
      <div className="absolute inset-0 pointer-events-none rounded-lg border-2 border-blue-500/20 animate-chatGlow" style={{ zIndex: 0 }}></div>
      {/* Mobile-optimized Header */}
      <div className="bg-neutral-900 p-3 sm:p-4 border-b border-neutral-700 flex-shrink-0">
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-center bg-gradient-to-r from-blue-400 via-purple-500 to-emerald-400 bg-clip-text text-transparent">
                  ManaTap AI — Your Deck-Building Companion
                </h2>
                {isLoggedIn === false && (
                  <button
                    onClick={() => {
                      capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, {
                        source: 'guest_mode_badge',
                        message_count: guestMessageCount
                      });
                      window.dispatchEvent(new CustomEvent('open-auth-modal', { 
                        detail: { mode: 'signup' } 
                      }));
                    }}
                    className={`text-xs px-2 py-1 rounded-full transition-all cursor-pointer hover:scale-105 ${
                      guestMessageCount >= 7 
                        ? 'bg-red-900 text-red-200 animate-pulse' 
                        : guestMessageCount >= 5
                        ? 'bg-amber-900 text-amber-200'
                        : 'bg-yellow-900 text-yellow-200'
                    }`}
                    title={guestMessageCount >= 7 
                      ? 'Only a few messages left! Sign up to continue'
                      : guestMessageCount >= 5
                      ? 'Sign up to save your chat history'
                      : 'Click to sign up and save your progress'
                    }
                  >
                    Guest Mode ({guestMessageCount}/10)
                  </button>
                )}
              </div>
              {/* Progress bar for guest users */}
              {isLoggedIn === false && guestMessageCount > 0 && (
                <div className="w-full max-w-xs">
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        guestMessageCount >= 7 
                          ? 'bg-red-500' 
                          : guestMessageCount >= 5
                          ? 'bg-amber-500'
                          : 'bg-yellow-500'
                      }`}
                      style={{ width: `${(guestMessageCount / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Cycling mana-colored underline */}
            <div className="h-0.5 w-32 bg-gradient-to-r from-yellow-400 via-blue-500 to-green-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>
      
      {/* Collapsible preferences and thread selector for mobile */}
      <div className="p-2 sm:p-4 space-y-3 border-b border-neutral-800 flex-shrink-0">
        {/* Preferences strip */}
        {extrasOn && (
          <div className="w-full space-y-3">
            {/* Tier 1: Format and Value - Primary intent with background panel */}
            <div className="border border-neutral-700/50 bg-neutral-800/40 rounded-lg px-3 py-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="opacity-90 text-xs sm:text-sm font-bold">Format:</span>
                {(['commander','standard','modern','pioneer','pauper'] as const).map(f => (
                  <button
                    key={f}
                    onClick={()=>setFmt(f)}
                    className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded border touch-manipulation text-xs sm:text-sm font-medium ${fmt===f?'bg-blue-700 text-white border-blue-600 shadow-lg shadow-blue-700/30':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{f}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="opacity-90 text-xs sm:text-sm font-bold">Value:</span>
                {(['budget','optimized','luxury'] as const).map(b => (
                  <button
                    key={b}
                    onClick={()=>setBudget(b)}
                    className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded border touch-manipulation text-xs sm:text-sm font-medium ${budget===b?'bg-emerald-700 text-white border-emerald-600 shadow-lg shadow-emerald-700/30':'bg-neutral-900 border-neutral-700 hover:bg-neutral-800'}`}
                  >{b}</button>
                ))}
              </div>
            </div>

            {/* Tier 2: Colors - Less prominent */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="opacity-60 text-xs sm:text-sm font-medium">Colors:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['W','U','B','R','G'] as const).map(c => (
                  <button
                    key={c}
                    onClick={()=>setColors(s=>({...s,[c]:!s[c]}))}
                    className={`px-1 py-1 sm:px-1.5 sm:py-1 rounded border touch-manipulation transition-all ${colors[c]?'bg-neutral-900 border-neutral-600':'bg-neutral-900/60 border-neutral-800/50 hover:bg-neutral-800/80 opacity-50 hover:opacity-70'} flex flex-col items-center gap-0.5`}
                    title={`Color identity filter: ${COLOR_LABEL[c]}`}
                    aria-label={`Color identity filter: ${COLOR_LABEL[c]}`}
                  >
                    <span className={`relative inline-flex items-center justify-center rounded-full ${colors[c] ? 'ring-1 ring-offset-1 ring-offset-neutral-900 ' + (c==='W'?'ring-amber-300':c==='U'?'ring-sky-400':c==='B'?'ring-slate-400':c==='R'?'ring-red-400':'ring-emerald-400') : ''}`} style={{ width: 16, height: 16 }}>
                      <ManaIcon c={c as any} active={true} />
                    </span>
                    <span className="text-[7px] sm:text-[9px] opacity-70">{COLOR_LABEL[c]}</span>
                  </button>
                ))}
                <button
                  onClick={()=>setColors({W:false,U:false,B:false,R:false,G:false})}
                  className="px-2 py-1 rounded border bg-neutral-900/60 border-neutral-800/50 hover:bg-neutral-800/80 touch-manipulation text-[10px] sm:text-xs opacity-60"
                  title="Clear color identity filter"
                >Clear</button>
              </div>
              {Object.values(colors).every(v => !v) && (
                <span className="text-[10px] sm:text-xs text-neutral-500 italic ml-1">
                  Optional — inferred from Commander or decklist
                </span>
              )}
            </div>

            {/* Tier 3: Explanation depth - Grouped Teaching + Reasoning */}
            <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800/50 pt-2">
              <span className="opacity-70 text-xs sm:text-sm font-medium">Explanation depth:</span>
              <label className="inline-flex items-center gap-2 text-xs sm:text-sm touch-manipulation cursor-pointer group" title="Turn this on if you want why, not just what">
                <input 
                  type="checkbox" 
                  checked={!!teaching} 
                  onChange={e=>setTeaching(e.target.checked)} 
                  className="touch-manipulation w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500" 
                />
                <span className="opacity-80 group-hover:opacity-100">Explain in more detail</span>
              </label>
              {isPro && (
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm touch-manipulation cursor-pointer group" title="Turn this on if you want why, not just what">
                  <input
                    type="checkbox"
                    checked={showReasoning}
                    onChange={(e) => setShowReasoning(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-600 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="opacity-80 group-hover:opacity-100">Show reasoning</span>
                </label>
              )}
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
            deckId={linkedDeckId}
            messageCount={messages.length}
          />
        </div>

        {/* Assistant spotlight header */}
        <div className="flex items-center justify-between">
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
            // Build sentence-like context
            const formatName = fmt === 'commander' ? 'Commander' : fmt ? fmt.charAt(0).toUpperCase() + fmt.slice(1) : 'Commander';
            const valueDesc = budget === 'budget' ? 'budget-friendly' : budget === 'luxury' ? 'luxury' : 'optimized for power and consistency';
            return (
              <div className="mb-2 px-3 py-1.5 bg-neutral-900/60 border border-neutral-700 rounded text-neutral-300 text-xs flex-shrink-0">
                <span className="opacity-90 break-words">You're building a <span className="font-medium">{formatName}</span> deck, <span className="font-medium">{valueDesc}</span>.</span>
              </div>
            );
          }
          return null;
        })()}
        
        <div className="flex-1 space-y-3 bg-neutral-950 text-neutral-100 border-2 border-neutral-700 rounded-lg p-4 overflow-y-auto overscroll-behavior-y-contain min-h-[800px] md:min-h-[1600px] max-h-[75vh] md:max-h-none shadow-inner">
          {/* Messages with streaming content */}
          {(!Array.isArray(messages) || messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center min-h-[800px] p-8 text-center">
              <div className="text-8xl mb-6 opacity-80">💬</div>
              <h3 className="text-base md:text-xl font-bold text-neutral-200 mb-3">
                Paste a decklist or name a Commander.
              </h3>
              <p className="text-xs md:text-sm text-neutral-400 mb-3 max-w-md px-2">
                I'll check legality, mana balance, and synergy—and tell you exactly what to fix.
              </p>
              {/* Confidence framing sentence */}
              <p className="text-xs md:text-sm text-neutral-500 mb-8 max-w-md px-2">
                ManaTap will check legality, mana balance, synergy, and budget—automatically.
              </p>
              
              <div className="flex flex-col gap-3 items-center justify-center mb-8">
                <div className="flex gap-4 flex-wrap justify-center">
                  {(()=>{ try { const { SampleDeckButton } = require('./SampleDeckSelector'); return <SampleDeckButton />; } catch { return null; } })()}
                  {(()=>{ 
                    try { 
                      const PlaystyleQuizModal = require('./PlaystyleQuizModal').default;
                      return (
                        <>
                          <div className="flex flex-col items-center">
                            <button
                              onClick={() => setShowQuizModal(true)}
                              className="relative px-6 py-3 bg-gradient-to-r from-purple-500/90 via-pink-500/90 to-purple-500/90 text-white rounded-xl font-bold text-base hover:from-purple-500/80 hover:via-pink-500/80 hover:to-purple-500/80 transition-all shadow-lg hover:shadow-purple-500/30 hover:scale-105 transform duration-200 border-2 border-purple-400/40"
                            >
                              <span className="relative z-10 flex items-center gap-2">
                                <span>🎯</span>
                                <span>
                                  <span className="block text-yellow-200 text-xs font-extrabold uppercase tracking-wider mb-0.5">FIND MY</span>
                                  <span>Playstyle</span>
                                </span>
                              </span>
                            </button>
                            <span className="mt-2 text-[10px] text-neutral-500 italic">Not sure what you like yet?</span>
                          </div>
                          {showQuizModal && <PlaystyleQuizModal onClose={() => setShowQuizModal(false)} />}
                        </>
                      );
                    } catch { return null; } 
                  })()}
                </div>
              </div>
              
              {/* Example prompt pills - with intro text and hover pre-fill */}
              <div className="mt-6 space-y-3 max-w-2xl px-2">
                <p className="text-xs md:text-sm text-neutral-500 mb-2">
                  Or try one of these instantly:
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {examplePrompts.slice(0, 3).map((prompt, idx) => {
                    const isHovered = hoveredPromptIndex === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setText(prompt);
                          setHoveredPromptIndex(null);
                        }}
                        onMouseEnter={() => {
                          // Pre-fill on hover (even before click) for momentum - only if input is empty
                          if ((!Array.isArray(messages) || messages.length === 0) && !text) {
                            setHoveredPromptIndex(idx);
                            setText(prompt);
                          }
                        }}
                        onMouseLeave={() => {
                          // Reset hover state when mouse leaves
                          if (isHovered) {
                            setHoveredPromptIndex(null);
                          }
                        }}
                        className="px-4 py-2.5 md:px-5 md:py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 hover:border-blue-500/60 rounded-full text-xs md:text-sm text-neutral-300 transition-all hover:scale-105 max-w-full shadow-md hover:shadow-blue-500/20"
                        style={{ 
                          animation: `fadeIn 0.3s ease-in ${idx * 0.1}s both`
                        }}
                        title={prompt}
                      >
                        {prompt}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : messages.map((m) => {
            const isAssistant = m.role === "assistant";
            return (
              <div key={m.id} className={isAssistant ? "text-left" : "text-right"}>
                <div
                  className={
                    "group inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
                    (isAssistant ? "bg-neutral-800" : "bg-blue-900/40")
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                    <span>{isAssistant ? 'assistant' : (displayName || 'you')}</span>
                    {isAssistant && (
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(String(m.content || ''));
                            capture('chat_message_copied', { messageId: String(m.id) });
                            // Could show a toast here if needed
                          } catch (err) {
                            // Silently fail
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white"
                        title="Copy message"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="leading-relaxed">{renderMessageContent(m.content, isAssistant)}</div>
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
            <div className="text-left">
              <div className="inline-block max-w-[95%] sm:max-w-[85%] md:max-w-[80%] rounded px-3 py-2 bg-neutral-800 whitespace-pre-wrap relative overflow-visible">
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                  <span>assistant</span>
                  <span className="ml-2 animate-pulse">•••</span>
                </div>
                <div className="leading-relaxed">{renderMessageContent(streamingContent, true)}</div>
              </div>
            </div>
          )}
          
          {/* Post-analysis signup prompt for guest users */}
          <PostAnalysisSignupPrompt messages={messages} />
          
          {/* Scroll anchor for auto-scroll with extra padding */}
          <div ref={messagesEndRef} className="h-px pb-8 md:pb-12" />
        </div>
      </div>
      
      {/* Mobile-optimized input area - sticky at bottom with background tint */}
      <div className="p-3 sm:p-4 border-t border-neutral-800 bg-black flex-shrink-0">
        {/* Background tint behind input area */}
        <div className="bg-neutral-900/40 border-t border-neutral-800/50 rounded-lg p-3 -mx-3 sm:-mx-4 -mt-3 sm:-mt-4 mb-3 sm:mb-4">
          {/* Suggested prompt chips */}
          <div className="mb-3 flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] opacity-90">
          {[
            { label: '“Analyze my Commander deck”', text: "Analyze this Commander deck and tell me what it's missing." },
            { label: '“Fix my 3-colour mana base”', text: "Fix the mana base for this 3-colour deck." },
            { label: '“Suggest five upgrades”', text: "Suggest 5 on-colour upgrades for this commander." },
            { label: '“(Experimental) Build token deck under £50”', text: "(Experimental) Build a token deck under £50" },
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

          {/* Input area */}
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
              placeholder={(!Array.isArray(messages) || messages.length === 0) ? "Paste a decklist, name a Commander, or ask a question…" : examplePrompts[currentPromptIndex]}
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
                    capture('chat_stream_stop', enrichChatEvent(
                      {
                        stopped_by: 'user',
                        duration_ms: Date.now() - streamStartTimeRef.current,
                        tokens_if_known: Math.ceil(streamingContent.length / 4),
                        assistant_message_id: streamingMessageIdRef.current || null
                      },
                      {
                        threadId: threadId || null,
                        userMessage: null, // Not available in this closure
                        assistantMessage: streamingContent.slice(0, 200) || null,
                        format: fmt || null,
                        // persona and prompt_version not available client-side
                      }
                    ));
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
                    capture('chat_stream_stop', enrichChatEvent(
                      {
                        stopped_by: 'user',
                        duration_ms: Date.now() - streamStartTimeRef.current,
                        tokens_if_known: Math.ceil(streamingContent.length / 4),
                        assistant_message_id: streamingMessageIdRef.current || null
                      },
                      {
                        threadId: threadId || null,
                        userMessage: null, // Not available in this closure
                        assistantMessage: streamingContent.slice(0, 200) || null,
                        format: fmt || null,
                        // persona and prompt_version not available client-side
                      }
                    ));
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
      </div>
      
      {/* Guest limit modal */}
      <GuestLimitModal 
        isOpen={showGuestLimitModal} 
        onClose={() => setShowGuestLimitModal(false)}
        messageCount={guestMessageCount}
        hasValueMoment={hasValueMoment(guestMessageCount)}
        valueMomentType={getValueMomentType(undefined, guestMessageCount)}
      />
      
      {/* Floating signup prompt for guest users */}
      <FloatingSignupPrompt messageCount={guestMessageCount} />
      
      {/* Card hover preview */}
      {hoverCard && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: hoverCard.x, top: hoverCard.y }}
        >
          <img
            src={hoverCard.src}
            alt={hoverCard.name}
            className="w-64 rounded-lg shadow-2xl border-2 border-neutral-700"
          />
        </div>
      )}
    </div>
  );
}

// Export Chat component wrapped with error boundary
export default withErrorFallback(Chat, ChatErrorFallback);
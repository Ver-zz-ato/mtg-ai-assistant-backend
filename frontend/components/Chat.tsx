"use client";
import { useEffect, useState, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import BuilderOverflowMenu from "@/components/BuilderOverflowMenu";
import DeckHealthCard from "@/components/DeckHealthCard";
import GuestLimitModal from "@/components/GuestLimitModal";
import FloatingSignupPrompt from "@/components/FloatingSignupPrompt";
import PostAnalysisSignupPrompt from "@/components/PostAnalysisSignupPrompt";
import { trackGuestValueMoment, hasValueMoment, getValueMomentType } from "@/lib/analytics/guest-value-moment";
import { useCapture } from "@/lib/analytics/useCapture";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { capture } from "@/lib/ph";
import { enrichChatEvent } from "@/lib/analytics/enrichChatEvent";
import { postMessage, postMessageStream, postMessageStreamWithDebug, listMessages } from "@/lib/threads";
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
import SourceReceipts from "@/components/SourceReceipts";
import ChatCorrectionModal from "@/components/ChatCorrectionModal";
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
import { FREE_DAILY_MESSAGE_LIMIT, GUEST_MESSAGE_LIMIT } from "@/lib/limits";
import { copyTextToClipboard } from "@/lib/clipboard";

const DEV = process.env.NODE_ENV !== "production";

/** Pro-only: Save format/budget/colors as default for all chats */
function SavePreferencesButton({ format, budget, colors }: { format: string; budget: string; colors: string[] }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/user/chat-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, budget, colors }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    setSaving(false);
  };
  return (
    <button
      onClick={handleSave}
      disabled={saving}
      title="Pro: Save these preferences so the AI remembers them in every chat"
      className="px-2.5 py-1.5 rounded text-xs font-medium bg-amber-900/50 text-amber-300 border border-amber-700/50 hover:bg-amber-800/50 disabled:opacity-50"
    >
      {saved ? "✓ Saved" : saving ? "..." : "Remember"}
    </button>
  );
}

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

export type ChatDebugLogEntry = { ts: number; tag: string; data: Record<string, unknown> };

export type ChatProps = {
  debugMode?: boolean;
  onDebugLog?: (entry: ChatDebugLogEntry) => void;
  /** Admin only: override tier for testing (guest/free/pro). Sent in context when set. */
  forceTier?: "guest" | "free" | "pro";
  /** With debugMode: request prompt composition preview (requires admin session). Default true. */
  adminPromptPreview?: boolean;
};

function Chat(props: ChatProps = {}) {
  const { debugMode = false, onDebugLog, forceTier, adminPromptPreview = true } = props;
  // Rotating example prompts - expanded pool for randomization
  const ALL_SUGGESTION_PROMPTS = [
    { label: 'Analyze my Commander deck', text: "Analyze this Commander deck and tell me what it's missing." },
    { label: 'Fix my 3-colour mana base', text: "Fix the mana base for this 3-colour deck." },
    { label: 'Suggest five upgrades', text: "Suggest 5 on-colour upgrades for this commander." },
    { label: 'Build token deck under £50', text: "Build a token deck under £50" },
    { label: 'Explain the right ramp mix', text: "Explain the right ramp mix for my deck." },
    { label: 'What removal should I add?', text: "What removal spells should I add to this deck?" },
    { label: 'Suggest card draw options', text: "Suggest card draw options for this commander." },
    { label: 'Improve my mana curve', text: "How can I improve my mana curve?" },
    { label: 'Add more interaction', text: "Add more interaction and protection to this deck." },
    { label: 'Budget alternatives for staples', text: "Suggest budget alternatives for the expensive cards in this deck." },
  ];
  const examplePrompts = ALL_SUGGESTION_PROMPTS.map(p => p.text);
  
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
  const [deckMode, setDeckMode] = useState<'beginner'|'intermediate'|'pro'>('beginner');
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [teaching, setTeaching] = useState<boolean>(false);
  const [linkedDeckId, setLinkedDeckId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [isListening, setIsListening] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [streamAbort, setStreamAbort] = useState<AbortController | null>(null);
  const [fallbackBanner, setFallbackBanner] = useState<string>("");
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = checking, false = guest, true = logged in
  const [guestMessageCount, setGuestMessageCount] = useState<number>(0);
  const [showGuestLimitModal, setShowGuestLimitModal] = useState<boolean>(false);
  const [showReasoning, setShowReasoning] = useState<boolean>(false);
  const { isPro, modelTier, modelLabel, upgradeMessage, loading: proLoading } = useProStatus();
  const pathname = usePathname() ?? "/";
  const [hasSuggestionShown, setHasSuggestionShown] = useState<boolean>(false);
  const [showQuizModal, setShowQuizModal] = useState<boolean>(false);
  const [correctedMessageIds, setCorrectedMessageIds] = useState<string[]>([]);
  const [correctionOpenForMessageId, setCorrectionOpenForMessageId] = useState<string | null>(null);
  const [showStartBuildingModal, setShowStartBuildingModal] = useState<boolean>(false);
  const [showSampleDeckModal, setShowSampleDeckModal] = useState<boolean>(false);
  const capture = useCapture();
  
  // Card image and price states
  const [cardImages, setCardImages] = useState<Map<string, ImageInfo>>(new Map());
  const [cardPrices, setCardPrices] = useState<Map<string, number>>(new Map());
  const [hoverCard, setHoverCard] = useState<{ name: string; x: number; y: number; src: string } | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const streamStartTimeRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const userAtBottomRef = useRef<boolean>(true);
  const chatSessionStartRef = useRef<number>(0);
  const messageCountRef = useRef<number>(0);
  const isExecutingRef = useRef<boolean>(false); // Guard against React Strict Mode double execution
  const streamingMessageIdRef = useRef<string | null>(null);
  const addingTypingMessageRef = useRef<boolean>(false);
  const skipNextRefreshRef = useRef<boolean>(false); // Skip refresh when we just created a new thread
  const lastOptimisticUserMsgRef = useRef<{ content: string; threadId: string } | null>(null);
  const cardImagesRef = useRef<Map<string, ImageInfo>>(new Map());
  const cardExtractDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const COLOR_LABEL: Record<'W'|'U'|'B'|'R'|'G', string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  
  // Rotate example prompts every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPromptIndex((prev) => (prev + 1) % examplePrompts.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [examplePrompts.length]);

  // Suggestion pills: use deterministic order for SSR/hydration, then randomize on client
  const [visiblePills, setVisiblePills] = useState(() =>
    ALL_SUGGESTION_PROMPTS.slice(0, 4)
  );
  useEffect(() => {
    const shuffle = () => {
      setVisiblePills(
        [...ALL_SUGGESTION_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 4)
      );
    };
    shuffle(); // Randomize once after mount
    const interval = setInterval(shuffle, 10000);
    return () => clearInterval(interval);
  }, []);

  // Ref to track pending auto-submit from quiz
  const pendingQuizSubmitRef = useRef<string | null>(null);
  
  // Listen for quiz-build-deck event
  useEffect(() => {
    const handleQuizBuildDeck = (e: CustomEvent) => {
      if (e.detail?.message) {
        // Store the message to auto-submit
        pendingQuizSubmitRef.current = e.detail.message;
        setText(e.detail.message);
      }
    };
    window.addEventListener('quiz-build-deck', handleQuizBuildDeck as EventListener);
    return () => {
      window.removeEventListener('quiz-build-deck', handleQuizBuildDeck as EventListener);
    };
  }, []);
  
  // Auto-submit when quiz message is set
  useEffect(() => {
    if (pendingQuizSubmitRef.current && text === pendingQuizSubmitRef.current && !busy) {
      pendingQuizSubmitRef.current = null;
      // Small delay to ensure UI updates first
      const timer = setTimeout(() => {
        send();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [text, busy]);

  // Pro: Load saved chat preferences on mount
  useEffect(() => {
    if (!isPro) return;
    fetch("/api/user/chat-preferences")
      .then((r) => r.json())
      .then((j) => {
        if (!j?.ok || !j?.preferences) return;
        const p = j.preferences;
        if (p.format && ["commander","standard","modern","pioneer","pauper"].includes(p.format))
          setFmt(p.format as typeof fmt);
        if (p.budget && ["budget","optimized","luxury"].includes(p.budget))
          setBudget(p.budget as typeof budget);
        if (Array.isArray(p.colors) && p.colors.length > 0) {
          const next: typeof colors = { W: false, U: false, B: false, R: false, G: false };
          for (const c of p.colors) if (["W","U","B","R","G"].includes(c)) next[c as keyof typeof next] = true;
          setColors(next);
        }
      })
      .catch(() => {});
  }, [isPro]);

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
  
  // Auto-scroll to bottom only when user was already at bottom (like ChatGPT – don’t lock scroll while streaming)
  const scrollToBottom = () => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };
  const AT_BOTTOM_THRESHOLD_PX = 120;
  const checkAtBottom = (el: HTMLElement) =>
    el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_THRESHOLD_PX;

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      userAtBottomRef.current = checkAtBottom(container);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!userAtBottomRef.current) return;
    requestAnimationFrame(() => scrollToBottom());
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
      let uniqueMessages = Array.isArray(messages) ? messages.filter((msg, index, arr) => 
        arr.findIndex(m => String(m.id) === String(msg.id)) === index
      ) : [];
      // Preserve optimistic user message if not yet in server response (stream route inserts it)
      const pending = lastOptimisticUserMsgRef.current;
      if (pending && pending.threadId === tid && !uniqueMessages.some((m: any) => m.role === 'user' && m.content === pending.content)) {
        uniqueMessages = [...uniqueMessages, { id: `user_${Date.now()}`, thread_id: tid, role: 'user', content: pending.content, created_at: new Date().toISOString() }];
      }
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
  
  // Keep ref in sync for "already have" check when streaming
  useEffect(() => {
    cardImagesRef.current = cardImages;
  }, [cardImages]);

  // Extract and fetch card images/prices from finalized assistant messages + current streaming content.
  // When streaming: debounce 400ms and merge new results into state. When not: run immediately and replace.
  useEffect(() => {
    const normalizedCardKey = (name: string) =>
      name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

    const runFetch = async () => {
      try {
        const assistantMessages = messages.filter((m: ChatMessage) => m.role === 'assistant');
        const texts: string[] = assistantMessages.map((m: ChatMessage) => m.content || '');
        if (isStreaming && streamingContent) texts.push(streamingContent);
        const allCards: string[] = [];
        for (const text of texts) {
          const extracted = extractCardsForImages(text);
          extracted.forEach(card => {
            if (!allCards.includes(card.name)) allCards.push(card.name);
          });
        }
        if (allCards.length === 0) return;
        const haveKeys = new Set(cardImagesRef.current.keys());
        const toFetch = isStreaming ? allCards.filter(name => !haveKeys.has(normalizedCardKey(name))) : allCards;
        if (toFetch.length === 0 && isStreaming) return;
        const namesToFetch = isStreaming ? toFetch : allCards;
        const [imagesMap, pricesMap] = await Promise.all([
          getImagesForNames(namesToFetch),
          getBulkPrices(namesToFetch)
        ]);
        if (isStreaming) {
          setCardImages(prev => new Map([...prev, ...imagesMap]));
          setCardPrices(prev => new Map([...prev, ...pricesMap]));
        } else {
          setCardImages(imagesMap);
          setCardPrices(pricesMap);
        }
      } catch (error) {
        logger.warn('Failed to fetch card data:', { error });
      }
    };

    if (isStreaming && streamingContent) {
      if (cardExtractDebounceRef.current) clearTimeout(cardExtractDebounceRef.current);
      cardExtractDebounceRef.current = setTimeout(() => {
        cardExtractDebounceRef.current = null;
        runFetch();
      }, 400);
      return () => {
        if (cardExtractDebounceRef.current) {
          clearTimeout(cardExtractDebounceRef.current);
          cardExtractDebounceRef.current = null;
        }
      };
    }
    runFetch();
  }, [messages, streamingContent, isStreaming]);

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
    if (!isLoggedIn && guestMessageCount >= GUEST_MESSAGE_LIMIT) {
      trackFeatureLimitHit('guest_chat', guestMessageCount, GUEST_MESSAGE_LIMIT);
      setShowGuestLimitModal(true);
      return;
    }
    
    // Show warnings at 5, 7, and 9 messages (earlier soft prompts)
    if (!isLoggedIn) {
      if (guestMessageCount === GUEST_MESSAGE_LIMIT - 6) {
        // 5th message - early soft prompt
        const { toast } = await import('@/lib/toast-client');
        toast('💡 Enjoying the chat? Sign up to save your progress!', 'info');
        capture('guest_limit_warning_5');
      } else if (guestMessageCount === GUEST_MESSAGE_LIMIT - 4) {
        // 7th message - reminder warning
        const { toast } = await import('@/lib/toast-client');
        toast('⚠️ 3 messages left - Sign up to continue chatting!', 'warning');
        capture('guest_limit_warning_7');
      } else if (guestMessageCount === GUEST_MESSAGE_LIMIT - 2) {
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
    // Mark guest chat activity this session - so exit warning only shows when they've actually chatted
    if (!isLoggedIn) {
      try {
        sessionStorage.setItem('guest_chat_has_session_activity', '1');
      } catch {}
    }
    
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

    const prefs: any = { format: fmt, budget, colors: Object.entries(colors).filter(([k,v])=>v).map(([k])=>k), teaching, userLevel: deckMode };
    
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
      memoryContext: memoryContext,
      ...(forceTier && { forceTier }),
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

    // Track optimistic user message so refresh does not drop it (stream route inserts to DB)
    lastOptimisticUserMsgRef.current = { content: val, threadId: currentThreadId || "" };

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
      const hasTyping = prev.some((msg: any) => msg.role === 'assistant' && msg.content === 'Thinking..');
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
          content: "Thinking..",
          created_at: new Date().toISOString()
        } as any,
      ];
    });

    // Set active streaming reference BEFORE starting stream to prevent race conditions
    activeStreamingRef.current = streamingMsgId;

    // Use a closure variable to accumulate streaming content and avoid React Strict Mode double-execution issues
    let accumulatedContent = '';

    try {
      const streamPayload = {
        text: val,
        threadId: currentThreadId,
        context,
        prefs,
        guestMessageCount: !isLoggedIn ? guestMessageCount : undefined,
        messages: messages.map((m: any) => ({ role: m.role, content: String(m.content || "") })).filter((m: any) => m.role === "user" || m.role === "assistant").slice(-12),
        sourcePage: debugMode ? `${pathname} · Admin Chat Test` : `${pathname} · Chat.tsx`,
      };
      if (debugMode && onDebugLog) {
        await postMessageStreamWithDebug(
          streamPayload,
          (token: string) => {
            if (activeStreamingRef.current !== streamingMsgId) return;
            accumulatedContent += token;
            setStreamingContent(accumulatedContent);
          },
          () => {
            setMessages((m: any) => {
              const i = m.findIndex((msg: any) => msg.id === streamingMsgId);
              if (i === -1) return m;
              const next = [...m];
              next[i] = { ...next[i], content: accumulatedContent || "—" };
              return next;
            });
            setStreamingContent("");
            activeStreamingRef.current = null;
            setStreamAbort(null);
            setIsStreaming(false);
            setBusy(false);
            streamingMessageIdRef.current = null;
            lastOptimisticUserMsgRef.current = null;
            messageCountRef.current += 1;
            streamStartTimeRef.current = 0;
            if (isLoggedIn && currentThreadId && accumulatedContent) {
              fetch("/api/chat/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threadId: currentThreadId, message: { role: "assistant", content: accumulatedContent } }),
              }).catch(() => {});
            }
            if (messageCountRef.current === 1 && accumulatedContent.length > 50) trackValueMomentReached("first_good_chat_response");
            if (!isLoggedIn && messageCountRef.current >= 2) trackGuestValueMoment("chat_engaged", capture, { chat_count: messageCountRef.current });
            capture("chat_stream_stop", enrichChatEvent({ stopped_by: "complete", duration_ms: Date.now() - streamStartTime, tokens_if_known: Math.ceil(accumulatedContent.length / 4), assistant_message_id: streamingMsgId }, { threadId: currentThreadId || threadId || null, userMessage: val || null, assistantMessage: accumulatedContent.slice(0, 200) || null, format: fmt || null }));
            onDebugLog({
              ts: Date.now(),
              tag: "stream_debug",
              data: {
                phase: "stream_complete",
                content: accumulatedContent,
                stream_duration_ms: Date.now() - streamStartTime,
                content_length: accumulatedContent.length,
              },
            });
          },
          (err: Error) => {
            streamFailed = true;
            setFallbackBanner(err.message || "Stream failed");
            setBusy(false);
            setIsStreaming(false);
            setStreamAbort(null);
            activeStreamingRef.current = null;
          },
          (data: Record<string, unknown>) => {
            onDebugLog({ ts: (data.ts as number) ?? Date.now(), tag: "stream_debug", data });
          },
          abortController.signal,
          debugMode && adminPromptPreview ? { "x-admin-prompt-preview": "1" } : undefined
        );
      } else {
        await postMessageStream(
          streamPayload,
          (token: string) => {
            if (activeStreamingRef.current !== streamingMsgId) return;
            accumulatedContent += token;
            setStreamingContent(accumulatedContent);
          },
        () => {
          // Now that streaming is complete, update the messages array with the final content
          setMessages((m: any) => {
            const existingIndex = m.findIndex((msg: any) => msg.id === streamingMsgId);
            
            if (existingIndex !== -1) {
              // Update the existing "Thinking.." placeholder with final content
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
          lastOptimisticUserMsgRef.current = null; // User message is now in DB
          
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
          lastOptimisticUserMsgRef.current = null;
          
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
                content: `You've reached the guest message limit of ${GUEST_MESSAGE_LIMIT} messages. Please sign in to continue chatting!`, 
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
      }
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
          threadId: currentThreadId ?? threadId, 
          context,
          prefs,
          guestMessageCount: !isLoggedIn ? guestMessageCount : undefined 
        }, currentThreadId ?? threadId).catch(e => ({ ok: false, error: { message: String(e.message) } } as any));
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
      
      // When stream failed but postMessage (non-stream) succeeded, add the assistant response to the UI
      // so the user sees it without refreshing (fixes "response doesn't show until refresh")
      const responseText = (res as any)?.text ?? (res as any)?.message?.content;
      if (streamFailed && !guestLimitExceeded && responseText && typeof responseText === 'string') {
        const assistantMsgId = `fallback_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        setMessages((m: any) => [
          ...m,
          { id: assistantMsgId, thread_id: tid || "", role: "assistant", content: responseText, created_at: new Date().toISOString() } as any,
        ]);
      }
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
  function InlineFeedback({
    msgId,
    content,
    isCorrected,
    onOpenCorrection,
  }: {
    msgId: string;
    content: string;
    isCorrected: boolean;
    onOpenCorrection: (id: string) => void;
  }) {
    const [open, setOpen] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [text, setText] = useState("");
    const [len, setLen] = useState(0);
    const maxLen = 500;
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    
    // Report modal state
    const [reportIssues, setReportIssues] = useState<string[]>([]);
    const [reportDescription, setReportDescription] = useState("");
    
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
        await fetch('/api/feedback', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ rating, text, source: 'chat' }) });
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
    
    function toggleReportIssue(issue: string) {
      setReportIssues(prev => 
        prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]
      );
    }
    
    async function submitReport() {
      if (reportIssues.length === 0) {
        try { const tc = await import("@/lib/toast-client"); tc.toastError('Please select at least one issue type'); } catch {}
        return;
      }
      setBusy(true);
      try {
        // Get the user message that preceded this assistant message
        const messageIndex = messages.findIndex((m: any) => String(m.id) === msgId);
        const userMessage = messageIndex > 0 ? messages[messageIndex - 1]?.content : null;
        
        const res = await fetch('/api/chat/report', { 
          method: 'POST', 
          headers: { 'content-type': 'application/json' }, 
          body: JSON.stringify({ 
            threadId: threadId ?? null,
            messageId: msgId,
            issueTypes: reportIssues,
            description: reportDescription,
            aiResponseText: content,
            userMessageText: userMessage
          }) 
        });
        if (!res.ok) throw new Error('Failed to submit report');
        try { const tc = await import("@/lib/toast-client"); tc.toast('Report submitted. Thank you!', 'success'); } catch {}
        setReportOpen(false);
        setReportIssues([]);
        setReportDescription("");
      } catch (e: any) {
        try { const tc = await import("@/lib/toast-client"); tc.toastError(e?.message || 'Failed to submit report'); } catch {}
      } finally { setBusy(false); }
    }
    
    const issueOptions = [
      { id: 'invented_card', label: 'Invented/fake card name' },
      { id: 'wrong_format', label: 'Wrong format legality' },
      { id: 'bad_recommendation', label: 'Bad recommendation' },
      { id: 'incorrect_data', label: 'Incorrect price/data' },
      { id: 'other', label: 'Other' }
    ];
    
    return (
      <>
        {!open && !reportOpen && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out text-[10px]">
            <button title="Helpful" onClick={()=>send(1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👍</button>
            <button title="Not helpful" onClick={()=>send(-1)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">👎</button>
            <button title="Comment" onClick={()=>setOpen(true)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">💬</button>
            <button title="Report issue" onClick={()=>setReportOpen(true)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70">🚩</button>
            {isCorrected ? (
              <span className="px-1 py-[1px] text-neutral-500 text-[10px]">Corrected</span>
            ) : (
              <button title="Correct the AI" onClick={()=>onOpenCorrection(msgId)} disabled={busy} className="px-1 py-[1px] rounded border border-neutral-600/70 bg-neutral-900/40 hover:bg-neutral-800/70 text-neutral-400">Correct</button>
            )}
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
        {reportOpen && (
          <div className="mt-2 w-full p-3 rounded border border-neutral-700 bg-neutral-900">
            <div className="font-medium mb-2">Report an issue</div>
            <div className="space-y-1 mb-3">
              {issueOptions.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 cursor-pointer hover:bg-neutral-800 px-2 py-1 rounded">
                  <input 
                    type="checkbox" 
                    checked={reportIssues.includes(opt.id)} 
                    onChange={() => toggleReportIssue(opt.id)}
                    className="accent-amber-500"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
            {reportIssues.includes('other') && (
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value.slice(0, 500))}
                placeholder="Describe the issue..."
                rows={2}
                className="w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 resize-none mb-2 text-sm"
                maxLength={500}
              />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={()=>{ setReportOpen(false); setReportIssues([]); setReportDescription(""); }} disabled={busy} className="px-3 py-1 rounded border border-neutral-600 text-sm">Cancel</button>
              <button onClick={submitReport} disabled={busy || reportIssues.length === 0} className="px-3 py-1 rounded bg-amber-600 text-white text-sm disabled:opacity-50">Submit Report</button>
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
  
  // Render message content with inline card images (like roast) and optional strip at bottom
  function renderMessageContent(content: string, isAssistant: boolean, skipCardImages?: boolean) {
    if (!isAssistant) {
      return renderMarkdown(content);
    }
    const normalizedCardKey = (name: string) =>
      name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
    const renderCard = (cardName: string) => {
      const normalized = normalizedCardKey(cardName);
      const image = cardImages.get(normalized);
      const normalUrl = image?.normal || image?.art_crop || image?.small;
      return (
        <span
          className="inline align-middle cursor-help border-b border-dotted border-neutral-500"
          title={cardName}
          onMouseEnter={(e) => normalUrl && handleCardMouseEnter(e, cardName)}
          onMouseLeave={handleCardMouseLeave}
        >
          {cardName}
        </span>
      );
    };
    const extractedCards = extractCardsForImages(content);
    const knownCardNames = new Set(extractedCards.map(c => normalizedCardKey(c.name)));
    return (
      <div className="space-y-3">
        <div>{renderMarkdown(content, { renderCard, knownCardNames })}</div>
      </div>
    );
  }
  
  function ManaIcon({ c, active }: { c: 'W'|'U'|'B'|'R'|'G'; active: boolean }){
    // Use local files first to avoid CDN failures on iOS Safari
    const localSrc = `/mana/${c.toLowerCase()}.svg`;
    const cdnSrc = `https://svgs.scryfall.io/card-symbols/${c}.svg`;
    
    return (
      <img
        src={localSrc}
        alt={`${COLOR_LABEL[c]} mana`}
        width={16}
        height={16}
        className="block"
        style={{ 
          filter: active ? 'saturate(1.3) brightness(1.1) contrast(1.1)' : 'grayscale(100%) brightness(60%)',
          opacity: active ? 1 : 0.6
        }}
        onError={(e) => {
          const target = e.currentTarget;
          // Try CDN as fallback if local fails
          if (target.src.includes('/mana/')) {
            target.src = cdnSrc;
            return;
          }
          // If CDN also fails, show colored circle
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

  const correctionMessage = correctionOpenForMessageId
    ? messages.find((m: any) => String(m.id) === correctionOpenForMessageId)
    : null;
  const correctionUserMessage = correctionOpenForMessageId && correctionMessage
    ? (() => {
        const idx = messages.findIndex((m: any) => String(m.id) === correctionOpenForMessageId);
        return idx > 0 ? messages[idx - 1]?.content : null;
      })()
    : null;

  return (
    <div className="flex flex-col min-w-0 bg-black text-white overflow-hidden relative">
      {correctionOpenForMessageId && (
        <ChatCorrectionModal
          open={!!correctionOpenForMessageId}
          onClose={() => setCorrectionOpenForMessageId(null)}
          messageId={correctionOpenForMessageId}
          aiContent={correctionMessage?.content ?? ""}
          userMessageContent={correctionUserMessage ?? null}
          threadId={threadId}
          deckId={linkedDeckId}
          commanderName={null}
          format={fmt}
          promptVersion={null}
          chatSurface="main_chat"
          onSuccess={() => setCorrectedMessageIds((prev) => [...prev, correctionOpenForMessageId!])}
        />
      )}
      {/* Mobile-optimized Header - compact on mobile, visually striking on larger screens */}
      <div className="relative p-2 sm:p-4 md:p-5 flex-shrink-0 overflow-hidden border-b border-neutral-700/80">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-900 to-amber-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(251,191,36,0.12),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent" />
        <div className="relative flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center bg-gradient-to-r from-amber-200 via-amber-100 to-amber-200 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(251,191,36,0.3)]">
                  ManaTap AI
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
                      guestMessageCount >= GUEST_MESSAGE_LIMIT - 3
                        ? 'bg-red-900 text-red-200 animate-pulse'
                        : guestMessageCount >= GUEST_MESSAGE_LIMIT - 5
                        ? 'bg-amber-900 text-amber-200'
                        : 'bg-yellow-900 text-yellow-200'
                    }`}
                    title={guestMessageCount >= GUEST_MESSAGE_LIMIT - 3
                      ? 'Only a few messages left! Sign up to continue'
                      : guestMessageCount >= GUEST_MESSAGE_LIMIT - 5
                      ? 'Sign up to save your chat history'
                      : 'Click to sign up and save your progress'
                    }
                  >
                    Guest Mode ({guestMessageCount}/{GUEST_MESSAGE_LIMIT})
                  </button>
                )}
              </div>
              {/* Progress bar for guest users */}
              {isLoggedIn === false && guestMessageCount > 0 && (
                <div className="w-full max-w-xs">
                  <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        guestMessageCount >= GUEST_MESSAGE_LIMIT - 3
                          ? 'bg-red-500'
                          : guestMessageCount >= GUEST_MESSAGE_LIMIT - 5
                          ? 'bg-amber-500'
                          : 'bg-yellow-500'
                      }`}
                      style={{ width: `${(guestMessageCount / GUEST_MESSAGE_LIMIT) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Controls strip: Mode, Format, Value, overflow menu - compact, no scroll to allow menu popout */}
      <div className="p-2 sm:p-3 space-y-2 border-b border-neutral-800 flex-shrink-0 overflow-visible">
        {extrasOn && (
          <div className="w-full space-y-2">
            {/* Deck Mode - tailors AI language/tone/depth (beginner/intermediate/pro) */}
            <div className="space-y-1.5">
              <span className="text-xs text-neutral-500">Deck Mode</span>
              <div className="flex gap-0.5 p-0.5 rounded-lg bg-neutral-800/60 border border-neutral-700/50">
                {([
                  { id: 'beginner' as const, label: 'Beginner', tip: 'Simple language, step-by-step. Best for new deck builders. AI explains basics and walks you through choices.' },
                  { id: 'intermediate' as const, label: 'Intermediate', tip: 'Balanced depth. Assumes you know basics. Adds strategy, synergies, and meta context.' },
                  { id: 'pro' as const, label: 'Pro', tip: 'Concise and advanced. Card names, lines, meta talk. For experienced players who want direct answers.' },
                ].map(({ id: m, label, tip }) => {
                  const colors = {
                    beginner: deckMode === m
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-500/30'
                      : 'text-emerald-300/70 hover:text-emerald-200 hover:bg-emerald-900/30 border border-transparent',
                    intermediate: deckMode === m
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-500/30'
                      : 'text-blue-300/70 hover:text-blue-200 hover:bg-blue-900/30 border border-transparent',
                    pro: deckMode === m
                      ? 'bg-amber-500 text-black border-amber-400 shadow-sm shadow-amber-500/30 font-semibold'
                      : 'text-amber-300/70 hover:text-amber-200 hover:bg-amber-900/30 border border-transparent',
                  };
                  return (
                    <div key={m} className="flex-1 relative">
                      <button
                        onClick={() => setDeckMode(m)}
                        className={`w-full px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all border ${colors[m]}`}
                      >
                        {label}
                      </button>
                      <span
                        className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-medium text-neutral-500 hover:text-neutral-300 cursor-help border border-neutral-600 bg-neutral-900/80"
                        title={tip}
                        aria-label={`${label} mode: ${tip}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {'i'}
                      </span>
                    </div>
                  );
                }))}
              </div>
            </div>

            {/* Format and Value - reduced styling */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">Format:</span>
                <div className="flex gap-0.5">
                  {(['commander','standard','modern','pioneer','pauper'] as const).map(f => (
                    <button
                      key={f}
                      onClick={()=>setFmt(f)}
                      className={`px-2.5 py-1.5 rounded text-xs font-medium ${
                        fmt===f
                          ? 'bg-neutral-600 text-white border border-neutral-500'
                          : 'bg-neutral-800/80 text-neutral-400 border border-neutral-700 hover:bg-neutral-700/80 hover:text-neutral-300'
                      }`}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">Value:</span>
                <div className="flex gap-0.5">
                  {(['budget','optimized','luxury'] as const).map(b => (
                    <button
                      key={b}
                      onClick={()=>setBudget(b)}
                      className={`px-2.5 py-1.5 rounded text-xs font-medium ${
                        budget===b
                          ? 'bg-neutral-600 text-white border border-neutral-500'
                          : 'bg-neutral-800/80 text-neutral-400 border border-neutral-700 hover:bg-neutral-700/80 hover:text-neutral-300'
                      }`}
                    >{b}</button>
                  ))}
                </div>
              </div>
              {isPro && (
                <SavePreferencesButton
                  format={fmt}
                  budget={budget}
                  colors={Object.entries(colors).filter(([,v])=>v).map(([k])=>k)}
                />
              )}
            </div>

          </div>
        )}
        
        {/* Top bar: Manage chats + thread overflow menu (right) */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-neutral-500">Manage chats</span>
          <BuilderOverflowMenu
            threadId={threadId}
            value={threadId}
            onChange={setThreadId}
            onChanged={() => setHistKey((k: number) => k + 1)}
            onDeleted={() => { setThreadId(null); setMessages([]); setHistKey((k: number) => k + 1); }}
            onNewChat={newChat}
            messageCount={messages.length}
            refreshKey={histKey}
          />
        </div>
      </div>
      
      {/* Messages area - EXPLICIT HEIGHT to guarantee visibility on all screens */}
      <div className="flex flex-col overflow-hidden">
        {fallbackBanner && (
          <div className="mb-2 px-3 py-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-200 text-sm flex-shrink-0">
            {fallbackBanner}
          </div>
        )}
        
        <div ref={messagesContainerRef} className="h-[50vh] md:h-[55vh] lg:h-[60vh] flex flex-col space-y-3 bg-neutral-950 text-neutral-100 border border-neutral-800 rounded-lg p-4 overflow-y-auto overscroll-contain">
          {/* Messages with streaming content */}
          {(!Array.isArray(messages) || messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="text-8xl mb-6 opacity-80">💬</div>
              <h3 className="text-base md:text-xl font-bold text-neutral-200 mb-8 max-w-md">
                Paste a decklist to be analysed or ask a magic question to get started
              </h3>
              
              <div className="flex flex-col gap-3 items-center justify-center mb-8">
                <button
                  onClick={() => setShowStartBuildingModal(true)}
                  className="px-8 py-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white rounded-xl font-bold text-base transition-colors shadow-lg"
                >
                  <span className="flex items-center gap-2">
                    <span>🎲</span>
                    <span>Start building a deck</span>
                    <span>→</span>
                  </span>
                </button>
                {showStartBuildingModal && (
                  <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowStartBuildingModal(false)}>
                    <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                      <h3 className="text-lg font-bold text-white mb-4 text-center">Start building a deck</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <button
                          onClick={() => { setShowStartBuildingModal(false); setShowQuizModal(true); }}
                          className="p-4 rounded-xl border border-neutral-600 hover:border-blue-500 hover:bg-neutral-800/50 text-left transition-colors"
                        >
                          <span className="text-2xl block mb-2">🎯</span>
                          <span className="font-semibold text-white">Find my playstyle</span>
                          <p className="text-xs text-neutral-400 mt-1">Answer a few questions and we&apos;ll match you to decks that fit</p>
                        </button>
                        <button
                          onClick={() => { setShowStartBuildingModal(false); setShowSampleDeckModal(true); }}
                          className="p-4 rounded-xl border border-neutral-600 hover:border-emerald-500 hover:bg-neutral-800/50 text-left transition-colors"
                        >
                          <span className="text-2xl block mb-2">🎲</span>
                          <span className="font-semibold text-white">Start from example decks</span>
                          <p className="text-xs text-neutral-400 mt-1">Pick from curated sample decks by archetype</p>
                        </button>
                      </div>
                      <a
                        href="/decks/browse"
                        className="block text-center text-sm text-cyan-400 hover:text-cyan-300 py-2"
                      >
                        Click here to browse public decks to start from →
                      </a>
                      <button onClick={() => setShowStartBuildingModal(false)} className="w-full mt-4 py-2 text-neutral-400 hover:text-white text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {showQuizModal && (()=>{ try { const PlaystyleQuizModal = require('./PlaystyleQuizModal').default; return <PlaystyleQuizModal onClose={() => setShowQuizModal(false)} />; } catch { return null; } })()}
                {showSampleDeckModal && (()=>{ try { const SampleDeckSelector = require('./SampleDeckSelector').default; return (
                  <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                      <div className="p-6">
                        <SampleDeckSelector onSuccess={() => setShowSampleDeckModal(false)} onCancel={() => setShowSampleDeckModal(false)} />
                      </div>
                    </div>
                  </div>
                ); } catch { return null; } })()}
              </div>
              
              {/* Example prompt pills - with intro text and hover pre-fill */}
              <div className="mt-6 space-y-3 max-w-2xl px-2">
                <p className="text-xs md:text-sm text-neutral-500 mb-2">
                  Or try one of these instantly:
                </p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {examplePrompts.slice(0, 3).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => setText(prompt)}
                        className="px-4 py-2.5 md:px-5 md:py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs md:text-sm text-neutral-300 transition-colors max-w-full"
                        style={{ 
                          animation: `fadeIn 0.3s ease-in ${idx * 0.1}s both`
                        }}
                        title={prompt}
                      >
                        {prompt}
                      </button>
                  ))}
                </div>
              </div>
            </div>
          ) : messages.map((m) => {
            const isAssistant = m.role === "assistant";
            return (
              <div key={m.id} className={isAssistant ? "flex justify-start" : "flex justify-end"}>
                <div
                  className={
                    "group max-w-[85%] sm:max-w-[80%] md:max-w-[75%] rounded-lg px-3 py-2 whitespace-pre-wrap relative overflow-visible " +
                    (isAssistant ? "bg-neutral-800 text-left" : "bg-blue-600/80 text-left")
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                    <span>{isAssistant ? 'assistant' : (displayName || 'you')}</span>
                  </div>
                  <div className="leading-relaxed">{renderMessageContent(m.content, isAssistant)}</div>
                  {isAssistant && (
                    <>
                      <SourceReceipts sources={generateSourceAttribution(String(m.content || ''), { deckId: linkedDeckId || undefined })} />
                      <div className="mt-2 w-full flex flex-col items-end gap-1">
                        <div className="flex justify-end w-full max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const text = String(m.content || "");
                              const ok = await copyTextToClipboard(text);
                              if (ok) {
                                capture("chat_message_copied", {
                                  messageId: String(m.id),
                                  role: m.role,
                                });
                                try {
                                  const { toast } = await import("@/lib/toast-client");
                                  toast("Copied to clipboard", "success");
                                } catch {
                                  /* non-blocking */
                                }
                              } else {
                                try {
                                  const { toastError } = await import("@/lib/toast-client");
                                  toastError("Could not copy — try selecting the text manually.");
                                } catch {
                                  /* non-blocking */
                                }
                              }
                            }}
                            className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700/90"
                            title="Copy"
                            aria-label="Copy message"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        </div>
                        <div className="w-full flex justify-end">
                          <InlineFeedback
                            msgId={String(m.id)}
                            content={String(m.content || '')}
                            isCorrected={correctedMessageIds.includes(String(m.id))}
                            onOpenCorrection={setCorrectionOpenForMessageId}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {!isAssistant && (
                    <div className="flex justify-end mt-1.5 max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const text = String(m.content || "");
                          const ok = await copyTextToClipboard(text);
                          if (ok) {
                            capture("chat_message_copied", {
                              messageId: String(m.id),
                              role: m.role,
                            });
                            try {
                              const { toast } = await import("@/lib/toast-client");
                              toast("Copied to clipboard", "success");
                            } catch {
                              /* non-blocking */
                            }
                          } else {
                            try {
                              const { toastError } = await import("@/lib/toast-client");
                              toastError("Could not copy — try selecting the text manually.");
                            } catch {
                              /* non-blocking */
                            }
                          }
                        }}
                        className="p-1.5 rounded-md text-blue-100/90 hover:text-white hover:bg-blue-500/35"
                        title="Copy"
                        aria-label="Copy message"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
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
                <div className="leading-relaxed">{renderMessageContent(streamingContent, true, false)}</div>
              </div>
            </div>
          )}
          
          {/* Post-analysis signup prompt for guest users */}
          <PostAnalysisSignupPrompt messages={messages} />
          
          {/* Scroll anchor for auto-scroll with extra padding */}
          <div ref={messagesEndRef} className="h-px pb-8 md:pb-12" />
        </div>
      </div>
      
      {/* Input area */}
      <div className="p-3 sm:p-4 border-t border-neutral-800 bg-neutral-950 flex-shrink-0">
        <div className="space-y-3">
          {/* Suggested prompt chips - de-emphasized */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-[11px] text-neutral-500">
          {visiblePills.map((p) => (
            <button 
              key={p.label} 
              onClick={()=>setText(p.text)} 
              className="px-2 py-[2px] rounded border border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300 touch-manipulation"
            >
              &quot;{p.label}&quot;
            </button>
          ))}
        </div>

          {/* Input area */}
          <div className="flex gap-2 flex-col sm:flex-row min-w-0">
            <div className="relative flex-1 min-w-0">
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
              placeholder={(!Array.isArray(messages) || messages.length === 0) ? "Paste a decklist to be analysed or ask a magic question…" : examplePrompts[currentPromptIndex]}
              rows={3}
              className="w-full bg-neutral-900 text-white border border-neutral-700 rounded-lg px-4 py-3.5 pr-12 resize-none min-h-[88px] text-base focus:outline-none focus:ring-1 focus:ring-neutral-500 focus:border-neutral-600 transition-all"
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
              <button onClick={send} disabled={busy || !text.trim()} className="px-5 py-2.5 h-fit rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" data-testid="chat-send">
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
                className="w-full py-4 rounded-lg bg-blue-600 text-white text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 active:bg-blue-400 transition-colors touch-manipulation" 
                data-testid="chat-send"
              >
                {busy ? "Thinking..." : "Send"}
              </button>
            )}
          </div>
        </div>

          {/* Model tier reminder - below input; hide while Pro status loads to avoid false "guest" copy */}
          {!proLoading && !isPro && modelTier !== 'pro' && (
            <div className="mt-3 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-center gap-2 text-sm">
              {modelTier === 'guest' && isLoggedIn === false && (
                <button
                  type="button"
                  onClick={() => {
                    capture(AnalyticsEvents.SIGNUP_CTA_CLICKED, { source: 'guest_mode_badge_input', message_count: guestMessageCount });
                    window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signup' } }));
                  }}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer hover:scale-105 ${
                    guestMessageCount >= GUEST_MESSAGE_LIMIT - 3 ? 'bg-red-900 text-red-200 animate-pulse' :
                    guestMessageCount >= GUEST_MESSAGE_LIMIT - 5 ? 'bg-amber-900 text-amber-200' : 'bg-yellow-900 text-yellow-200'
                  }`}
                >
                  Guest Mode ({guestMessageCount}/{GUEST_MESSAGE_LIMIT})
                </button>
              )}
              <span className="text-neutral-400">
                Using {(modelTier === 'free' || (isLoggedIn && !isPro)) ? (modelLabel || 'Standard') : modelLabel} model.
                {(modelTier === 'free' || (isLoggedIn && !isPro)) && <> {FREE_DAILY_MESSAGE_LIMIT} messages/day.</>}{' '}
                <a href="/pricing" className="text-blue-400 hover:text-blue-300 font-medium">
                  {modelTier === 'guest' ? 'Sign in for a better model. Upgrade to Pro for the best.' : (modelTier === 'free' || (isLoggedIn && !isPro)) ? 'Upgrade to Pro for the best chat model.' : 'Upgrade to Pro for the best model.'}
                </a>
              </span>
            </div>
          )}
          {!proLoading && (isPro || modelTier === 'pro') && (
            <div className="mt-2 text-center text-sm text-neutral-500">You&apos;re on the best model — thank you!</div>
          )}
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
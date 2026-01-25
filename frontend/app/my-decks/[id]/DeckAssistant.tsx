"use client";
import React from "react";
import { listMessages, postMessage, postMessageStream } from "@/lib/threads";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
// Enhanced chat functionality
import { 
  analyzeDeckProblems, 
  generateDeckContext, 
  generateActionChips, 
  generateSourceAttribution,
  type ActionChip,
  type ChatSource 
} from "@/lib/chat/enhancements";
import { extractCardsForImages } from "@/lib/chat/cardImageDetector";
import { getImagesForNames, type ImageInfo } from "@/lib/scryfall-cache";
import { renderMarkdown } from "@/lib/chat/markdownRenderer";
import { parseDeckCommand } from "@/lib/chat/commandParser";
import { toast } from "@/lib/toast-client";
import { validateAndNormalizeCardName } from "@/lib/chat/cardValidator";

type Msg = { id: any; role: "user"|"assistant"; content: string };

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

export default function DeckAssistant({ deckId, format: initialFormat }: { deckId: string; format?: string }) {
  const [threadId, setThreadId] = React.useState<string | null>(null);
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [deckCI, setDeckCI] = React.useState<string[] | null>(null);
  const [commander, setCommander] = React.useState<string>("");
  const [fmt, setFmt] = React.useState<string>(initialFormat || "commander");
  const [plan, setPlan] = React.useState<string>("optimized");
  const [teaching, setTeaching] = React.useState<boolean>(false);
  const [isListening, setIsListening] = React.useState(false);
  const recognitionRef = React.useRef<any>(null);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamingContent, setStreamingContent] = React.useState<string>("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  
  // Card image states
  const [cardImages, setCardImages] = React.useState<Map<string, ImageInfo>>(new Map());
  const [hoverCard, setHoverCard] = React.useState<{ name: string; x: number; y: number; src: string } | null>(null);
  
  // Deck Health AI Suggestions modal state
  const [healthSuggestionsOpen, setHealthSuggestionsOpen] = React.useState(false);
  const [healthSuggestionsLoading, setHealthSuggestionsLoading] = React.useState(false);
  const [healthSuggestionsCategory, setHealthSuggestionsCategory] = React.useState<string>('');
  const [healthSuggestionsLabel, setHealthSuggestionsLabel] = React.useState<string>('');
  const [healthSuggestions, setHealthSuggestions] = React.useState<Array<{ card: string; reason: string }>>([]);
  const [healthSuggestionsError, setHealthSuggestionsError] = React.useState<string | null>(null);

  async function deckContext(): Promise<string> {
    try {
      const sb = createBrowserSupabaseClient();
      const { data } = await sb.from('decks').select('title, commander, deck_text, format, plan').eq('id', deckId).maybeSingle();
      const title = (data as any)?.title || 'Untitled';
      const cmd = (data as any)?.commander || '';
      setCommander(cmd);
      const f = String((data as any)?.format || 'Commander').toLowerCase();
      const p = String((data as any)?.plan || 'Optimized').toLowerCase();
      setFmt(f.includes('commander') ? 'commander' : f);
      setPlan(p);
      
      // Get ALL deck cards instead of just top 40 lines
      const { data: allCards } = await sb.from('deck_cards').select('name, qty').eq('deck_id', deckId).limit(400);
      const cardList = Array.isArray(allCards) 
        ? allCards.map((c: any) => `${c.qty}x ${c.name}`).join("; ")
        : String((data as any)?.deck_text || '').split(/\r?\n/).map((l:string)=>l.trim()).filter(Boolean).join("; ");
      
      // Fetch commander color identity for filtering suggestions
      try {
        const cmdName = String((data as any)?.commander || '').trim();
        if (cmdName) {
          const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cmdName)}`, { cache: 'no-store' });
          if (r.ok) {
            const j: any = await r.json().catch(()=>({}));
            const ci = Array.isArray(j?.color_identity) ? j.color_identity : [];
            setDeckCI(ci);
          }
        }
      } catch {}
      
      // Enhanced deck context with problem analysis
      let enhancedContext = `Deck: ${title}${cmd?` | Commander: ${cmd}`:''} | Full Decklist: ${cardList}`;
      
      try {
        const deckProblems = await analyzeDeckProblems(deckId);
        if (deckProblems.length > 0) {
          const problemContext = generateDeckContext(deckProblems, title);
          enhancedContext = problemContext + '\n\n' + enhancedContext;
        }
      } catch (error) {
        // Silently fail
      }
      
      return enhancedContext;
    } catch { return ''; }
  }

  async function refresh(tid: string) {
    try {
      const { messages } = await listMessages(tid);
      const arr = Array.isArray(messages) ? messages : [];
      setMsgs(arr.map((m:any)=>({ id: m.id, role: m.role, content: m.content })) as Msg[]);
      // Auto-scroll to bottom after refresh
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
      });
    } catch {}
  }
  
  // Auto-scroll when messages change or streaming content updates
  React.useEffect(() => {
    if (msgs.length > 0 || isStreaming || streamingContent) {
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 50);
      });
    }
  }, [msgs.length, isStreaming, streamingContent]);
  
  // Listen for deck health click events
  React.useEffect(() => {
    const handleHealthClick = async (e: CustomEvent) => {
      const category = e.detail?.category || '';
      const label = e.detail?.label || '';
      const status = e.detail?.status || '';
      
      if (!category || !deckId) return;
      
      // Pro check - deck health features are Pro-only
      // Use standardized Pro check that checks both database and metadata
      try {
        const { showProToast } = await import('@/lib/pro-ux');
        const { useProStatus } = await import('@/hooks/useProStatus');
        const sb = createBrowserSupabaseClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          showProToast();
          return;
        }
        
        // Use API endpoint that checks both sources consistently
        const proStatusRes = await fetch('/api/user/pro-status');
        const proStatusData = await proStatusRes.json().catch(() => ({ ok: false, isPro: false }));
        
        if (!proStatusData.ok || !proStatusData.isPro) {
          showProToast();
          return;
        }
      } catch (err) {
        // If check fails, show error
        try {
          const { showProToast } = await import('@/lib/pro-ux');
          showProToast();
        } catch {
          alert('Deck Health features are Pro-only. Please upgrade to unlock AI suggestions!');
        }
        return;
      }
      
      // Open modal and show loading
      setHealthSuggestionsOpen(true);
      setHealthSuggestionsLoading(true);
      setHealthSuggestionsCategory(category);
      setHealthSuggestionsLabel(label);
      setHealthSuggestions([]);
      setHealthSuggestionsError(null);
      
      try {
        // Use stateless API to avoid thread creation
        const res = await fetch('/api/deck/health-suggestions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deckId,
            category,
            label
          })
        });
        
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error?.error || 'Failed to get suggestions');
        }
        
        const data = await res.json();
        if (data.ok && Array.isArray(data.suggestions)) {
          setHealthSuggestions(data.suggestions);
        } else {
          throw new Error('No suggestions returned');
        }
      } catch (e: any) {
        console.error('Health suggestions error:', e);
        setHealthSuggestionsError(e?.message || 'Failed to generate suggestions');
      } finally {
        setHealthSuggestionsLoading(false);
      }
    };
    
    window.addEventListener('deck:health-click' as any, handleHealthClick as unknown as EventListener);
    return () => {
      window.removeEventListener('deck:health-click' as any, handleHealthClick as unknown as EventListener);
    };
  }, [deckId, threadId, commander, fmt, plan, deckCI, teaching]);
  
  // Extract and fetch card images from assistant messages
  React.useEffect(() => {
    (async () => {
      try {
        const assistantMessages = msgs.filter(m => m.role === 'assistant');
        if (assistantMessages.length === 0) return;
        
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
        
        if (allCards.length === 0) return;
        
        // Fetch images for extracted cards
        const imagesMap = await getImagesForNames(allCards);
        setCardImages(imagesMap);
      } catch (error) {
        // Silently fail
      }
    })();
  }, [msgs]);

  function parseAdds(s: string): Array<{ qty:number; name:string }> {
    const out: Array<{qty:number; name:string}> = [];
    const lines = s.split(/\r?\n/);
    for (const l of lines) {
      const t = l.trim();
      let m = t.match(/^add\s+(\d+)\s*[xX]?\s+(.+)$/i);
      if (m) { out.push({ qty: Math.max(1, parseInt(m[1],10)), name: m[2].trim() }); continue; }
      m = t.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) { out.push({ qty: Math.max(1, parseInt(m[1],10)), name: m[2].trim() }); continue; }
      m = t.match(/^add\s+(.+)$/i);
      if (m) { out.push({ qty: 1, name: m[1].trim() }); continue; }
    }
    return out.slice(0, 10);
  }

  function prefillQuickAddFromReply(s: string) {
    const items = parseAdds(s);
    if (!items.length) return;
    const first = items[0];
    const line = `add ${first.qty} ${first.name}`;
    try { window.dispatchEvent(new CustomEvent('quickadd:prefill', { detail: line })); } catch {}
  }

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input is not supported in this browser. Please try Chrome or Edge.');
      return;
    }

    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      // Start listening
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

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

        // Update text with final results
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
          // Only show error for non-silent issues
          alert(`Voice input error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        // In single-shot mode, automatically restart if user hasn't manually stopped
        if (recognitionRef.current === recognition && isListening) {
          setTimeout(() => {
            if (recognitionRef.current === recognition && isListening) {
              try {
                recognition.start();
              } catch (e) {
                setIsListening(false);
              }
            }
          }, 100);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  async function send() {
    if (!text.trim() || busy) return;
    
    // Stop voice input if it's active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    // Check for direct deck editing commands FIRST (before sending to chat)
    const command = parseDeckCommand(text);
    if (command) {
      // Prevent text from being sent to chat
      setText('');
      setBusy(true);
      try {
        switch (command.type) {
          case 'add':
            for (const card of command.cards) {
              // Validate and normalize card name
              const validName = await validateAndNormalizeCardName(card.name);
              if (!validName) {
                toast(`❌ Card "${card.name}" not found. Check spelling?`, 'error');
                setBusy(false);
                return;
              }
              await addCard(validName, card.qty);
            }
            toast(`✅ Added ${command.cards[0].name} to deck!`, 'success');
            setBusy(false);
            return;
            
          case 'remove':
            for (const card of command.cards) {
              // Validate and normalize card name
              const validName = await validateAndNormalizeCardName(card.name);
              if (!validName) {
                toast(`❌ Card "${card.name}" not found. Check spelling?`, 'error');
                setBusy(false);
                return;
              }
              await removeCard(validName, card.qty);
            }
            toast(`✅ Removed ${command.cards[0].name} from deck!`, 'success');
            setBusy(false);
            return;
            
          case 'swap':
            // Validate both card names
            const validRemove = await validateAndNormalizeCardName(command.remove);
            const validAdd = await validateAndNormalizeCardName(command.add);
            
            if (!validRemove) {
              toast(`❌ Card "${command.remove}" not found. Check spelling?`, 'error');
              setBusy(false);
              return;
            }
            if (!validAdd) {
              toast(`❌ Card "${command.add}" not found. Check spelling?`, 'error');
              setBusy(false);
              return;
            }
            
            await removeCard(validRemove, 1);
            await addCard(validAdd, 1);
            toast(`✅ Swapped ${validRemove} for ${validAdd}!`, 'success');
            setBusy(false);
            return;
        }
      } catch (error: any) {
        toast(error.message || 'Command failed', 'error');
      } finally {
        setBusy(false);
      }
    }
    
    // Clear input immediately (optimistic UI)
    const messageText = text;
    setText('');
    setBusy(true);
    
    // Add user message to UI immediately
    const userMsgId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setMsgs((prev: any) => [
      ...prev,
      {
        id: userMsgId,
        thread_id: threadId || "",
        role: "user",
        content: messageText,
        created_at: new Date().toISOString()
      } as any
    ]);
    
    // Create streaming message placeholder
    const streamingMsgId = `streaming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setMsgs((prev: any) => [
      ...prev,
      {
        id: streamingMsgId,
        thread_id: threadId || "",
        role: "assistant",
        content: "",
        created_at: new Date().toISOString()
      } as any
    ]);
    
    let accumulatedContent = '';
    setIsStreaming(true);
    setStreamingContent('');
    
    try {
      // Pass deckId via context parameter (not as text) so chat route can fetch deck properly
      const pm = await postMessage({ text: messageText, threadId });
      const tid = (pm as any)?.threadId || threadId;
      if (tid && tid !== threadId) setThreadId(tid);
      
      // Link thread to deck if not already linked
      if (tid && deckId) {
        try {
          await fetch('/api/chat/threads/link', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ threadId: tid, deckId })
          }).catch(() => {}); // Non-blocking
        } catch {}
      }
      
      // Stream assistant reply with prefs and context
      const prefs: any = { format: fmt, budget: plan, colors: Array.isArray(deckCI)?deckCI:[], teaching };
      const context = { deckId }; // Pass deckId via context, not as text
      
      await postMessageStream(
        { text: messageText, threadId: tid || null, context, prefs },
        (token: string) => {
          accumulatedContent += token;
          setStreamingContent(accumulatedContent);
          // Auto-scroll during streaming as content arrives
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
          });
        },
        () => {
          // Streaming complete - update message with final content
          setMsgs((m: any) => {
            const existingIndex = m.findIndex((msg: any) => msg.id === streamingMsgId);
            if (existingIndex !== -1) {
              const newMessages = [...m];
              newMessages[existingIndex] = {
                ...newMessages[existingIndex],
                content: accumulatedContent
              };
              return newMessages;
            }
            return m;
          });
          setIsStreaming(false);
          setStreamingContent('');
          if (tid) refresh(tid);
          
          // Scroll to bottom after streaming completes
          requestAnimationFrame(() => {
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
          });
        },
        (error: Error) => {
          setIsStreaming(false);
          setStreamingContent('');
          // Remove streaming message on error
          setMsgs((m: any) => m.filter((msg: any) => msg.id !== streamingMsgId));
          alert(error.message || 'Failed to get response');
        }
      );
      
      // Don't show helper messages - keep it simple like main chat
    } catch (e:any) { 
      alert(e?.message || 'Assistant failed');
      // Restore text if error occurred
      setText(messageText);
    }
    finally { setBusy(false); }
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
    
    // Extract cards from this message
    const extractedCards = extractCardsForImages(content);
    
    return (
      <div className="space-y-3">
        {/* Main message content */}
        <div>{renderMarkdown(content)}</div>
        
        {/* Card images row at bottom */}
        {extractedCards.length > 0 && (
          <div className="flex gap-2 flex-wrap pt-2 border-t border-neutral-600">
            {extractedCards.map((card, idx) => {
              const normalized = card.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
              const image = cardImages.get(normalized);
              if (!image?.small) return null;
              
              return (
                <img
                  key={idx}
                  src={image.small}
                  alt={card.name}
                  loading="lazy"
                  decoding="async"
                  className="w-16 h-22 rounded cursor-pointer border border-neutral-600 hover:border-blue-500 transition-colors hover:scale-105"
                  onMouseEnter={(e) => handleCardMouseEnter(e, card.name)}
                  onMouseLeave={handleCardMouseLeave}
                  title={card.name}
                />
                );
            })}
          </div>
        )}
      </div>
    );
  }
  
  // Source attribution component
  function SourceReceipts({ sources }: { sources: ChatSource[] }) {
    if (sources.length === 0) return null;
    
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] opacity-60">
        <span>Sources:</span>
        {sources.map((source, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-1 py-[1px] rounded border border-neutral-700 bg-neutral-900">
            <span>{source.icon}</span>
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="hover:underline">
                {source.name}
              </a>
            ) : (
              <span>{source.name}</span>
            )}
            {source.date && <span className="opacity-60">({source.date})</span>}
          </span>
        ))}
      </div>
    );
  }
  
  // Enhanced action chips component
  function ActionChipsComponent({ chips }: { chips: ActionChip[] }) {
    if (chips.length === 0) return null;
    
    const handleChipClick = async (chip: ActionChip) => {
      try {
        switch (chip.action) {
          case 'add_to_deck':
            if (chip.data?.cards && deckId) {
              const card = chip.data.cards[0];
              await addCard(card, 1);
            }
            break;
          case 'budget_swaps':
            window.open('/deck/swap-suggestions', '_blank');
            break;
          case 'view_scryfall':
            if (chip.data?.cardName) {
              const searchQuery = encodeURIComponent(`!"${chip.data.cardName}"`);
              window.open(`https://scryfall.com/search?q=${searchQuery}`, '_blank');
            }
            break;
          case 'run_probability':
            window.open('/tools/probability', '_blank');
            break;
          case 'open_ctf':
            window.open('/collections/cost-to-finish', '_blank');
            break;
        }
      } catch (error) {
        // Silently fail
      }
    };
    
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <span className="opacity-60">Quick:</span>
        {chips.slice(0, 3).map((chip) => (
          <button
            key={chip.id}
            onClick={() => handleChipClick(chip)}
            className="inline-flex items-center gap-1 px-1 py-[1px] rounded border border-neutral-700 hover:bg-neutral-800"
          >
            {chip.icon && <span>{chip.icon}</span>}
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    );
  }
  
  // Helper function for removing cards
  async function removeCard(name: string, qty: number) {
    try {
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, qty })
      });
      
      if (!res.ok) {
        throw new Error('Failed to remove card');
      }
      
      // Trigger deck update event
      window.dispatchEvent(new CustomEvent('deck:changed'));
    } catch (error) {
      throw error;
    }
  }
  
  // Helper function for adding cards with undo support
  async function addCard(name: string, qty: number, showUndo = true) {
    try {
      // Store previous state for undo
      const previousCards = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`).then(r => r.json().catch(() => ({ ok: false })));
      const previousCard = previousCards?.ok ? (previousCards.cards || []).find((c: any) => c.name === name) : null;
      const previousQty = previousCard?.qty || 0;
      
      const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, qty })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) throw new Error(j?.error || 'Add failed');
      
      const newQty = j?.qty || qty;
      const wasMerged = j?.merged || false;
      const message = wasMerged && previousQty > 0 
        ? `Added ${qty}x ${name} (now ${newQty} total)`
        : `Added ${qty}x ${name}`;
      
      try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      
      // Show undo toast if requested
      if (showUndo) {
        const { undoToastManager } = await import('@/lib/undo-toast');
        undoToastManager.showUndo({
          id: `add-card-${deckId}-${name}-${Date.now()}`,
          message,
          duration: 5000,
          onUndo: async () => {
            // Revert: if it was merged, restore previous quantity; otherwise delete
            if (wasMerged && previousQty > 0) {
              await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name, qty: previousQty })
              });
            } else {
              await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, {
                method: 'DELETE',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name, qty })
              });
            }
            try { window.dispatchEvent(new Event('deck:changed')); } catch {}
          },
          onExecute: () => {
            // Action already executed, nothing to do
          }
        });
      }
      
      return { ok: true, merged: wasMerged, qty: newQty };
    } catch (e: any) {
      alert(e?.message || 'Add failed');
      throw e;
    }
  }

  function SuggestionButtons({ rawText }: { rawText: string }){
    const [items, setItems] = React.useState<Array<{ name:string; qty:number }>>([]);
    const [loading, setLoading] = React.useState(false);
    React.useEffect(() => {
      let cancelled = false;
      async function run(){
        const parsed = parseAdds(rawText);
        if (!deckCI || deckCI.length===0) { setItems(parsed); return; }
        setLoading(true);
        try {
          const kept: Array<{name:string; qty:number}> = [];
          const want = new Set(deckCI);
          const pick = parsed.slice(0, 12);
          await Promise.all(pick.map(async (it) => {
            try {
              const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(it.name)}`, { cache: 'no-store' });
              if (!r.ok) { kept.push(it); return; } // keep unknowns
              const c: any = await r.json().catch(()=>({}));
              const ci: string[] = Array.isArray(c?.color_identity) ? c.color_identity : [];
              const subset = ci.every(x => want.has(x));
              if (subset) kept.push(it);
            } catch { kept.push(it); }
          }));
          if (!cancelled) setItems(kept);
        } finally { if (!cancelled) setLoading(false); }
      }
      run();
      return () => { cancelled = true; };
    }, [rawText, (deckCI||[]).join(',')]);

    async function addNow(name: string, qty: number){
      try {
        const res = await fetch(`/api/decks/cards?deckid=${encodeURIComponent(deckId)}`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ name, qty }) });
        const j = await res.json().catch(()=>({}));
        if (!res.ok || j?.ok===false) throw new Error(j?.error || 'Add failed');
        try { window.dispatchEvent(new Event('deck:changed')); } catch {}
      } catch(e:any){ alert(e?.message || 'Add failed'); }
    }

    if (loading) return <div className="text-[10px] opacity-70">Filtering suggestions…</div>;
    if (items.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        {items.map((it, i) => (
          <button key={it.name+':'+i} onClick={()=>addNow(it.name, it.qty)} className="px-2 py-[2px] rounded border border-neutral-600 hover:bg-neutral-700">
            + Add {it.qty>1?`${it.qty} `:''}{it.name}
          </button>
        ))}
        {deckCI && deckCI.length>0 && (
          <span className="text-[10px] opacity-60">(filtered to deck colors)</span>
        )}
      </div>
    );
  }

  function renderHelpers(obj: any) {
    const d = obj?.data || {};
    return (
      <div className="mt-2 space-y-3 text-[12px] opacity-90">
        {d.nl && (
          <div>
            <div className="font-semibold mb-1">Search</div>
            <div className="mb-1"><code className="px-1 py-[1px] rounded bg-neutral-800 border border-neutral-700">{d.nl.scryfall_query}</code></div>
            <ul className="list-disc ml-5">
              {(Array.isArray(d.nl.results)?d.nl.results:[]).slice(0,5).map((c:any,i:number)=> (
                <li key={i}>{c.name}{c.mana_cost?` (${c.mana_cost})`:''} — {c.type_line}</li>
              ))}
            </ul>
          </div>
        )}
        {d.combos && (
          <div>
            <div className="font-semibold mb-1">Combos ({d.combos.commander})</div>
            <ul className="list-disc ml-5">{(Array.isArray(d.combos.combos)?d.combos.combos:[]).map((c:any,i:number)=>(<li key={i}>{c.line}</li>))}</ul>
          </div>
        )}
        {d.combos_detect && (
          <div>
            <div className="font-semibold mb-1">Combos detected</div>
            {Array.isArray(d.combos_detect.present) && d.combos_detect.present.length>0 && (
              <div className="mb-1">
                <div className="opacity-80 text-[12px]">Present:</div>
                <ul className="list-disc ml-5">{d.combos_detect.present.slice(0,5).map((c:any,i:number)=>(<li key={'p'+i}><span className="font-medium">{c.name}</span>{Array.isArray(c.pieces)&&c.pieces.length>0?(<span className="opacity-80"> — {c.pieces.join(' + ')}</span>):null}</li>))}</ul>
              </div>
            )}
            {Array.isArray(d.combos_detect.missing) && d.combos_detect.missing.length>0 && (
              <div>
                <div className="opacity-80 text-[12px]">One piece missing:</div>
                <ul className="list-disc ml-5">{d.combos_detect.missing.slice(0,5).map((c:any,i:number)=>(<li key={'m'+i}><span className="font-medium">{c.name}</span>{Array.isArray(c.have)&&c.have.length>0?(<span className="opacity-80"> — have {c.have.join(' + ')}, need <a className="underline" href={`https://scryfall.com/search?q=${encodeURIComponent('!"'+(c.suggest||'')+'"')}`} target="_blank" rel="noreferrer">{c.suggest}</a></span>):null}</li>))}</ul>
              </div>
            )}
          </div>
        )}
        {d.rules && (
          <div>
            <div className="font-semibold mb-1">Rules references</div>
            <ul className="list-disc ml-5">{(Array.isArray(d.rules.results)?d.rules.results:[]).slice(0,5).map((r:any,i:number)=>(<li key={i}><span className="font-medium">{r.rule}</span>: {r.text}</li>))}</ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="text-sm rounded-xl border border-neutral-700 bg-gradient-to-b from-neutral-900 to-neutral-950 p-4 shadow-lg h-[min(75vh,56rem)] flex flex-col">
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <div className="h-1 w-1 rounded-full bg-purple-400 animate-pulse shadow-lg shadow-purple-400/50"></div>
        <h3 className="text-base font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
          Deck Assistant
        </h3>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden rounded-lg border border-neutral-700 p-3 bg-black/30" style={{ scrollbarGutter: 'auto' }}>
        {msgs.length === 0 ? (
          <div className="flex items-center justify-center py-12 opacity-70 text-sm text-neutral-400">
            <div className="text-center">
              <p className="mb-2">💬 Ask me anything about your deck!</p>
              <p className="text-xs opacity-70">I can see your full decklist, commander, and card synergies.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {msgs.map(m => {
          // Skip empty streaming placeholder
          if (m.id.toString().startsWith('streaming_') && !m.content && !isStreaming) return null;
          
          try {
            const obj = JSON.parse(m.content);
            if (obj && obj.type === 'helpers') {
              return (
                <div key={m.id} className="text-left">
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">assistant</div>
                  {renderHelpers(obj)}
                </div>
              );
            }
          } catch {}
          
          const isAssistant = m.role === 'assistant';
          return (
            <div key={m.id} className={isAssistant ? "text-left" : "text-right"}>
              <div
                className={
                  "group inline-block max-w-[95%] rounded px-3 py-2 align-top whitespace-pre-wrap relative overflow-visible " +
                  (isAssistant ? "bg-neutral-800" : "bg-blue-900/40")
                }
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1 flex items-center justify-between gap-2">
                  <span>{isAssistant ? 'assistant' : 'you'}</span>
                  {isAssistant && m.content && (
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(String(m.content || ''));
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
              </div>
            </div>
          );
            })}
            
            {/* Show streaming content */}
            {isStreaming && streamingContent && (
              <div className="text-left">
                <div className="inline-block max-w-[95%] rounded px-3 py-2 bg-neutral-800 whitespace-pre-wrap relative overflow-visible">
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">
                    <span>assistant</span>
                    <span className="ml-2 animate-pulse">•••</span>
                  </div>
                  <div className="leading-relaxed">{renderMessageContent(streamingContent, true)}</div>
                </div>
              </div>
            )}
            
            {/* Scroll anchor */}
            <div ref={messagesEndRef} className="h-px" />
          </div>
        )}
      </div>
      <div className="shrink-0 border-t border-neutral-800 pt-4">
        <div className="flex gap-2 flex-col sm:flex-row">
          <div className="relative flex-1">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Auto-resize textarea up to max height
                const textarea = e.target;
                textarea.style.height = 'auto';
                const newHeight = Math.min(textarea.scrollHeight, 128); // max-h-32 = 8rem = 128px
                textarea.style.height = `${Math.max(44, newHeight)}px`; // min-h-[44px] = 44px
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ask me anything about your deck…"
              rows={1}
              className="w-full bg-neutral-900 text-white border border-neutral-700 rounded-lg px-4 py-3 pr-12 resize-none min-h-[44px] max-h-32 overflow-y-auto text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              style={{
                WebkitAppearance: 'none',
                fontSize: '16px', // Prevents zoom on iOS
                height: '44px' // Initial height
              }}
            />
            {/* Voice input button - positioned inside textarea */}
            <button 
              onClick={toggleVoiceInput} 
              className={`absolute right-2 top-2 p-2 rounded-full border text-white transition-all ${
                isListening 
                  ? 'bg-red-600 border-red-500 animate-pulse scale-110' 
                  : 'bg-neutral-700 border-neutral-600 hover:bg-neutral-600 active:scale-95'
              }`}
              title={isListening ? 'Stop voice input (recording...)' : 'Start voice input'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
          </div>
          <button 
            onClick={send} 
            disabled={busy || !text.trim() || isStreaming} 
            className="px-6 py-3 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {busy || isStreaming ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
      
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
      
      {/* Deck Health AI Suggestions Modal */}
      {healthSuggestionsOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setHealthSuggestionsOpen(false)}
        >
          <div 
            className="bg-neutral-900 border-2 border-purple-500 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                AI Suggestions: {healthSuggestionsLabel}
              </h3>
              <button
                onClick={() => setHealthSuggestionsOpen(false)}
                className="text-neutral-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            
            {healthSuggestionsLoading && (
              <div className="flex items-center gap-3 py-8">
                <svg className="animate-spin h-6 w-6 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-neutral-300">Generating AI suggestions...</span>
              </div>
            )}
            
            {healthSuggestionsError && (
              <div className="text-red-400 py-4">{healthSuggestionsError}</div>
            )}
            
            {!healthSuggestionsLoading && !healthSuggestionsError && healthSuggestions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400 mb-4">
                  Here are AI-suggested cards to improve your deck's {healthSuggestionsLabel.toLowerCase()}:
                </p>
                {healthSuggestions.map((suggestion, idx) => (
                  <div key={idx} className="border border-neutral-700 rounded-lg p-4 bg-neutral-800/50 hover:bg-neutral-800 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-semibold text-white mb-1">{suggestion.card}</div>
                        <div className="text-sm text-neutral-400">{suggestion.reason}</div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const result = await addCard(suggestion.card, 1, true);
                            // Toast is handled by undo toast system
                          } catch (e: any) {
                            toast(e?.message || 'Failed to add card', 'error');
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-medium transition-all shadow-md hover:shadow-lg whitespace-nowrap"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {!healthSuggestionsLoading && !healthSuggestionsError && healthSuggestions.length === 0 && (
              <div className="text-neutral-400 py-8 text-center">
                No suggestions generated. Try again or ask the assistant directly.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

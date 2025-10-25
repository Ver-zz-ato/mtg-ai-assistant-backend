import { capture } from './ph';

interface UserContext {
  lastDeck?: {
    id: string;
    name: string;
    commander?: string;
    colors: string[];
    timestamp: number;
  };
  lastCollection?: {
    id: string;
    name: string;
    cardCount: number;
    timestamp: number;
  };
  recentCards?: {
    name: string;
    set?: string;
    timestamp: number;
  }[];
  preferences?: {
    favoriteFormats?: string[];
    playStyle?: string;
    budgetRange?: string;
  };
  lastSession?: {
    timestamp: number;
    duration: number;
    actions: string[];
  };
}

const STORAGE_KEY = 'manatap_ai_memory';
const MAX_RECENT_CARDS = 10;
const CONTEXT_EXPIRY_DAYS = 30;

export class AIMemoryManager {
  private static instance: AIMemoryManager;
  private context: UserContext = {};

  static getInstance(): AIMemoryManager {
    if (!AIMemoryManager.instance) {
      AIMemoryManager.instance = new AIMemoryManager();
    }
    return AIMemoryManager.instance;
  }

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Clean expired data
        this.context = this.cleanExpiredData(parsed);
      }
    } catch (error) {
      console.warn('Failed to load AI memory context:', error);
      this.context = {};
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.context));
    } catch (error) {
      console.warn('Failed to save AI memory context:', error);
    }
  }

  private cleanExpiredData(data: UserContext): UserContext {
    const now = Date.now();
    const expiryMs = CONTEXT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const cleaned: UserContext = {};

    // Clean deck context
    if (data.lastDeck && (now - data.lastDeck.timestamp) < expiryMs) {
      cleaned.lastDeck = data.lastDeck;
    }

    // Clean collection context
    if (data.lastCollection && (now - data.lastCollection.timestamp) < expiryMs) {
      cleaned.lastCollection = data.lastCollection;
    }

    // Clean recent cards
    if (data.recentCards) {
      cleaned.recentCards = data.recentCards.filter(card => 
        (now - card.timestamp) < expiryMs
      ).slice(0, MAX_RECENT_CARDS);
    }

    // Keep preferences (they don't expire)
    if (data.preferences) {
      cleaned.preferences = data.preferences;
    }

    // Clean session data (keep only recent)
    if (data.lastSession && (now - data.lastSession.timestamp) < expiryMs) {
      cleaned.lastSession = data.lastSession;
    }

    return cleaned;
  }

  // Deck context management
  updateDeckContext(deck: {
    id: string;
    name: string;
    commander?: string;
    colors: string[];
  }): void {
    this.context.lastDeck = {
      ...deck,
      timestamp: Date.now()
    };
    this.saveToStorage();

    // Track context update
    try {
      capture('ai_memory_updated', {
        context_type: 'deck',
        deck_id: deck.id,
        colors: deck.colors
      });
    } catch {}
  }

  // Collection context management
  updateCollectionContext(collection: {
    id: string;
    name: string;
    cardCount: number;
  }): void {
    this.context.lastCollection = {
      ...collection,
      timestamp: Date.now()
    };
    this.saveToStorage();

    // Track context update
    try {
      capture('ai_memory_updated', {
        context_type: 'collection',
        collection_id: collection.id,
        card_count: collection.cardCount
      });
    } catch {}
  }

  // Recent cards tracking
  addRecentCard(cardName: string, set?: string): void {
    if (!this.context.recentCards) {
      this.context.recentCards = [];
    }

    // Remove existing entry for same card
    this.context.recentCards = this.context.recentCards.filter(
      card => card.name.toLowerCase() !== cardName.toLowerCase()
    );

    // Add to front of list
    this.context.recentCards.unshift({
      name: cardName,
      set,
      timestamp: Date.now()
    });

    // Keep only recent cards
    this.context.recentCards = this.context.recentCards.slice(0, MAX_RECENT_CARDS);
    this.saveToStorage();
  }

  // User preferences
  updatePreferences(preferences: {
    favoriteFormats?: string[];
    playStyle?: string;
    budgetRange?: string;
  }): void {
    this.context.preferences = {
      ...this.context.preferences,
      ...preferences
    };
    this.saveToStorage();
  }

  // Session tracking
  updateSession(actions: string[]): void {
    this.context.lastSession = {
      timestamp: Date.now(),
      duration: this.context.lastSession?.duration || 0,
      actions
    };
    this.saveToStorage();
  }

  // Get personalized greeting message
  getPersonalizedGreeting(): string | null {
    const { lastDeck, lastCollection, recentCards, preferences } = this.context;
    
    if (!lastDeck && !lastCollection && !recentCards?.length) {
      return null; // No context to personalize with
    }

    const greetings = [];

    if (lastDeck) {
      const deckAge = Math.floor((Date.now() - lastDeck.timestamp) / (1000 * 60 * 60 * 24));
      if (deckAge === 0) {
        greetings.push(`Welcome back! I see you were working on "${lastDeck.name}" earlier.`);
      } else if (deckAge < 7) {
        greetings.push(`Hey there! Ready to continue with "${lastDeck.name}"?`);
      } else {
        greetings.push(`Welcome back! It's been a while since you worked on "${lastDeck.name}".`);
      }

      if (lastDeck.commander) {
        greetings.push(`How's your ${lastDeck.commander} deck coming along?`);
      }
    }

    if (lastCollection && !lastDeck) {
      greetings.push(`Welcome back! I remember you were organizing your collection "${lastCollection.name}".`);
    }

    if (recentCards?.length) {
      const recentCard = recentCards[0];
      const cardAge = Math.floor((Date.now() - recentCard.timestamp) / (1000 * 60 * 60));
      if (cardAge < 24) {
        greetings.push(`I noticed you were looking at ${recentCard.name} recently.`);
      }
    }

    if (preferences?.favoriteFormats?.length) {
      const format = preferences.favoriteFormats[0];
      greetings.push(`What ${format} strategies are you exploring today?`);
    }

    // Return a random greeting or combine a few
    if (greetings.length === 0) return null;
    
    return greetings.length <= 2 ? 
      greetings.join(' ') : 
      greetings.slice(0, 2).join(' ');
  }

  // Get context for AI chat
  getChatContext(): string {
    const { lastDeck, lastCollection, recentCards, preferences } = this.context;
    const contextParts = [];

    if (lastDeck) {
      contextParts.push(`User's current deck: "${lastDeck.name}"`);
      if (lastDeck.commander) {
        contextParts.push(`Commander: ${lastDeck.commander}`);
      }
      if (lastDeck.colors.length) {
        contextParts.push(`Colors: ${lastDeck.colors.join(', ')}`);
      }
    }

    if (lastCollection) {
      contextParts.push(`User's collection: "${lastCollection.name}" (${lastCollection.cardCount} cards)`);
    }

    if (recentCards?.length) {
      const recentCardNames = recentCards.slice(0, 3).map(c => c.name);
      contextParts.push(`Recently viewed cards: ${recentCardNames.join(', ')}`);
    }

    if (preferences?.favoriteFormats?.length) {
      contextParts.push(`Preferred formats: ${preferences.favoriteFormats.join(', ')}`);
    }

    if (preferences?.playStyle) {
      contextParts.push(`Play style: ${preferences.playStyle}`);
    }

    return contextParts.length ? 
      `Context: ${contextParts.join(' | ')}` : 
      '';
  }

  // Clear all context (for privacy)
  clearContext(): void {
    this.context = {};
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }

    // Track context clearing
    try {
      capture('ai_memory_cleared', {
        reason: 'user_request'
      });
    } catch {}
  }

  // Get current context for display
  getContext(): UserContext {
    return { ...this.context };
  }

  // Check if user has context (for consent prompting)
  hasContext(): boolean {
    const { lastDeck, lastCollection, recentCards } = this.context;
    return !!(lastDeck || lastCollection || recentCards?.length);
  }
}

// Singleton instance
export const aiMemory = AIMemoryManager.getInstance();
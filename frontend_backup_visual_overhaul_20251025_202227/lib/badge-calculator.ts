/**
 * Badge Progress Calculator
 * Calculates user progress towards various achievement badges
 */

export interface BadgeProgress {
  id: string;
  name: string;
  description: string;
  icon: string;
  current: number;
  target: number;
  progress: number; // 0-100 percentage
  unlocked: boolean;
}

/**
 * Calculate progress for all badges
 */
export async function calculateBadgeProgress(userId: string): Promise<BadgeProgress[]> {
  // Import supabase here to avoid circular dependencies
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  const badges: BadgeProgress[] = [];

  try {
    // Fetch user data
    const [decksResult, collectionsResult, analyticsResult] = await Promise.all([
      supabase.from('decks').select('id, deck_text, created_at').eq('user_id', userId),
      supabase.from('collections').select('id').eq('user_id', userId),
      supabase.from('ai_usage').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ]);

    const decks = decksResult.data || [];
    const collections = collectionsResult.data || [];
    const analytics = analyticsResult.data || [];

    // 1. Budget Wizard: 5 decks under $50
    const budgetDecks = decks.filter(deck => {
      // Simple heuristic: count cards, assume average ~$2/card
      const cardCount = countCards(deck.deck_text || '');
      const estimatedPrice = cardCount * 2;
      return estimatedPrice < 50 && cardCount >= 10;
    }).length;

    badges.push({
      id: 'budget_wizard',
      name: 'Budget Wizard',
      description: 'Build 5 decks under $50',
      icon: '💰',
      current: budgetDecks,
      target: 5,
      progress: Math.min(100, (budgetDecks / 5) * 100),
      unlocked: budgetDecks >= 5,
    });

    // 2. Deck Architect: 25 decks
    badges.push({
      id: 'deck_architect',
      name: 'Deck Architect',
      description: 'Create 25 decks',
      icon: '🏗️',
      current: decks.length,
      target: 25,
      progress: Math.min(100, (decks.length / 25) * 100),
      unlocked: decks.length >= 25,
    });

    // 3. Night Owl: Active midnight-4am for 10 sessions
    const nightSessions = analytics.filter(record => {
      const hour = new Date(record.created_at).getHours();
      return hour >= 0 && hour < 4;
    }).length;

    const uniqueNightDays = new Set(
      analytics
        .filter(record => {
          const hour = new Date(record.created_at).getHours();
          return hour >= 0 && hour < 4;
        })
        .map(record => new Date(record.created_at).toDateString())
    ).size;

    badges.push({
      id: 'night_owl',
      name: 'Night Owl',
      description: 'Use ManaTap after midnight 10 times',
      icon: '🦉',
      current: uniqueNightDays,
      target: 10,
      progress: Math.min(100, (uniqueNightDays / 10) * 100),
      unlocked: uniqueNightDays >= 10,
    });

    // 4. Streak Keeper: 30 days in a row (simplified: any 30 days with activity)
    const uniqueDays = new Set(
      analytics.map(record => new Date(record.created_at).toDateString())
    ).size;

    badges.push({
      id: 'streak_keeper',
      name: 'Streak Keeper',
      description: '30 active days',
      icon: '🔥',
      current: uniqueDays,
      target: 30,
      progress: Math.min(100, (uniqueDays / 30) * 100),
      unlocked: uniqueDays >= 30,
    });

    // 5. Combo Connoisseur: 10 different combos in decks (simplified: assume 1 combo per 10 cards)
    const totalCards = decks.reduce((sum, deck) => sum + countCards(deck.deck_text || ''), 0);
    const estimatedCombos = Math.floor(totalCards / 10);

    badges.push({
      id: 'combo_connoisseur',
      name: 'Combo Connoisseur',
      description: 'Discover 10 unique combos',
      icon: '⚡',
      current: estimatedCombos,
      target: 10,
      progress: Math.min(100, (estimatedCombos / 10) * 100),
      unlocked: estimatedCombos >= 10,
    });

    // 6. Collection Curator: Has at least 1 collection
    badges.push({
      id: 'collection_curator',
      name: 'Collection Curator',
      description: 'Create your first collection',
      icon: '📚',
      current: collections.length > 0 ? 1 : 0,
      target: 1,
      progress: collections.length > 0 ? 100 : 0,
      unlocked: collections.length > 0,
    });

    // 7. Commander Master: Build 10 Commander decks
    const commanderDecks = decks.filter(deck => 
      (deck.deck_text || '').toLowerCase().includes('commander:')
    ).length;

    badges.push({
      id: 'commander_master',
      name: 'Commander Master',
      description: 'Build 10 Commander decks',
      icon: '👑',
      current: commanderDecks,
      target: 10,
      progress: Math.min(100, (commanderDecks / 10) * 100),
      unlocked: commanderDecks >= 10,
    });

    // Sort by progress (closest to completion first)
    badges.sort((a, b) => {
      // Unlocked badges go to end
      if (a.unlocked !== b.unlocked) return a.unlocked ? 1 : -1;
      // Sort by progress (highest first)
      return b.progress - a.progress;
    });

  } catch (error) {
    console.error('Error calculating badge progress:', error);
  }

  return badges;
}

/**
 * Get the 3 closest badges to completion (not yet unlocked)
 */
export function getClosestBadges(allBadges: BadgeProgress[]): BadgeProgress[] {
  return allBadges
    .filter(badge => !badge.unlocked)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3);
}

/**
 * Count cards in deck_text
 */
function countCards(deckText: string): number {
  if (!deckText) return 0;
  const lines = deckText.split(/\r?\n/).filter(l => l.trim());
  let total = 0;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (m) {
      total += parseInt(m[1], 10) || 1;
    } else if (line.trim() && !line.match(/^(Commander|Sideboard|Deck|Maybeboard):/i)) {
      total += 1;
    }
  }
  return total;
}



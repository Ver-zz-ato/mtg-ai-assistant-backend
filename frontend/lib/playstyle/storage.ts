// lib/playstyle/storage.ts
// LocalStorage and Supabase persistence for playstyle profile

import { PlaystyleProfile, PlaystyleTraits } from '@/lib/quiz/quiz-data';
import { CommanderSuggestion, ArchetypeSuggestion } from '@/lib/quiz/commander-suggestions';

const STORAGE_KEY = 'playstyle_quiz_results';
const DAILY_BUILD_KEY = 'playstyle_daily_builds';

export interface StoredPlaystyleProfile {
  profile: PlaystyleProfile;
  traits: PlaystyleTraits;
  commanders: CommanderSuggestion[];
  archetypes: ArchetypeSuggestion[];
  colorIdentities: string[];
  answers: Record<string, string>;
  completedAt: string;
  version?: number;
}

/**
 * Get stored playstyle profile from localStorage.
 */
export function getStoredProfile(): StoredPlaystyleProfile | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const parsed = JSON.parse(stored) as StoredPlaystyleProfile;
    
    // Validate required fields
    if (!parsed.profile || !parsed.answers) {
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save playstyle profile to localStorage.
 */
export function saveProfile(data: StoredPlaystyleProfile): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...data,
      version: 2,
    }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear stored playstyle profile.
 */
export function clearStoredProfile(): void {
  if (typeof window === 'undefined') return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/**
 * Check if user has previous quiz results.
 */
export function hasStoredProfile(): boolean {
  return getStoredProfile() !== null;
}

/**
 * Get profile age in days.
 */
export function getProfileAgeInDays(): number | null {
  const stored = getStoredProfile();
  if (!stored?.completedAt) return null;
  
  const completedDate = new Date(stored.completedAt);
  const now = new Date();
  const diffMs = now.getTime() - completedDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ============================================
// DAILY BUILD LIMIT TRACKING
// ============================================

interface DailyBuildData {
  date: string; // YYYY-MM-DD
  count: number;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Get current daily build count.
 */
export function getDailyBuildCount(): number {
  if (typeof window === 'undefined') return 0;
  
  try {
    const stored = localStorage.getItem(DAILY_BUILD_KEY);
    if (!stored) return 0;
    
    const data = JSON.parse(stored) as DailyBuildData;
    if (data.date !== getTodayKey()) {
      return 0;
    }
    return data.count;
  } catch {
    return 0;
  }
}

/**
 * Increment daily build count.
 */
export function incrementDailyBuildCount(): number {
  if (typeof window === 'undefined') return 0;
  
  const today = getTodayKey();
  let count = 0;
  
  try {
    const stored = localStorage.getItem(DAILY_BUILD_KEY);
    if (stored) {
      const data = JSON.parse(stored) as DailyBuildData;
      if (data.date === today) {
        count = data.count;
      }
    }
  } catch {}
  
  const newCount = count + 1;
  
  try {
    localStorage.setItem(DAILY_BUILD_KEY, JSON.stringify({
      date: today,
      count: newCount,
    }));
  } catch {}
  
  return newCount;
}

/**
 * Check if user can build more decks today.
 */
export function canBuildDeck(dailyLimit: number | undefined): boolean {
  if (dailyLimit === undefined) return true; // Unlimited
  if (dailyLimit === 0) return false; // No builds allowed
  return getDailyBuildCount() < dailyLimit;
}

/**
 * Get remaining builds for today.
 */
export function getRemainingBuilds(dailyLimit: number | undefined): number | null {
  if (dailyLimit === undefined) return null; // Unlimited
  return Math.max(0, dailyLimit - getDailyBuildCount());
}

// ============================================
// SUPABASE SYNC (Optional for logged-in users)
// ============================================

/**
 * Sync playstyle profile to Supabase for logged-in users.
 * This is a fire-and-forget operation.
 */
export async function syncProfileToSupabase(
  userId: string,
  data: StoredPlaystyleProfile
): Promise<boolean> {
  try {
    const response = await fetch('/api/playstyle/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        profile: data.profile,
        traits: data.traits,
        answers: data.answers,
        completedAt: data.completedAt,
      }),
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch playstyle profile from Supabase for logged-in users.
 */
export async function fetchProfileFromSupabase(
  userId: string
): Promise<StoredPlaystyleProfile | null> {
  try {
    const response = await fetch(`/api/playstyle/sync?userId=${encodeURIComponent(userId)}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.ok || !data.profile) return null;
    
    return data as StoredPlaystyleProfile;
  } catch {
    return null;
  }
}

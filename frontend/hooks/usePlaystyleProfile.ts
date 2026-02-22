// hooks/usePlaystyleProfile.ts
// Hook for managing playstyle profile state with localStorage

import { useState, useEffect, useCallback } from 'react';
import { 
  getStoredProfile, 
  saveProfile, 
  clearStoredProfile,
  hasStoredProfile,
  getProfileAgeInDays,
  getDailyBuildCount,
  incrementDailyBuildCount,
  canBuildDeck,
  getRemainingBuilds,
  syncProfileToSupabase,
  fetchProfileFromSupabase,
  StoredPlaystyleProfile 
} from '@/lib/playstyle/storage';
import { useAuth } from '@/lib/auth-context';
import { useProStatus } from '@/hooks/useProStatus';
import { resolvePlaystyleDepth } from '@/lib/playstyle/depth';

interface UsePlaystyleProfileReturn {
  profile: StoredPlaystyleProfile | null;
  hasProfile: boolean;
  profileAge: number | null;
  loading: boolean;
  
  // Daily build tracking
  dailyBuildsUsed: number;
  dailyBuildsRemaining: number | null;
  canBuild: boolean;
  
  // Actions
  refreshProfile: () => void;
  updateProfile: (data: StoredPlaystyleProfile) => void;
  clearProfile: () => void;
  recordBuild: () => number;
}

export function usePlaystyleProfile(): UsePlaystyleProfileReturn {
  const [profile, setProfile] = useState<StoredPlaystyleProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyBuildsUsed, setDailyBuildsUsed] = useState(0);
  
  const { user } = useAuth();
  const { modelTier } = useProStatus();
  const depth = resolvePlaystyleDepth(modelTier);
  
  // Load profile from storage
  const loadProfile = useCallback(async () => {
    setLoading(true);
    
    // Try localStorage first
    let localProfile = getStoredProfile();
    
    // If logged in, try to fetch from Supabase
    if (user?.id) {
      try {
        const remoteProfile = await fetchProfileFromSupabase(user.id);
        if (remoteProfile) {
          // Use remote if newer than local
          const localDate = localProfile?.completedAt ? new Date(localProfile.completedAt) : new Date(0);
          const remoteDate = remoteProfile.completedAt ? new Date(remoteProfile.completedAt) : new Date(0);
          
          if (remoteDate > localDate) {
            localProfile = remoteProfile;
            // Update local storage with remote data
            saveProfile(remoteProfile);
          }
        }
      } catch {
        // Silently fail - use local data
      }
    }
    
    setProfile(localProfile);
    setDailyBuildsUsed(getDailyBuildCount());
    setLoading(false);
  }, [user?.id]);
  
  // Initial load
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  
  // Refresh profile
  const refreshProfile = useCallback(() => {
    loadProfile();
  }, [loadProfile]);
  
  // Update profile
  const updateProfile = useCallback((data: StoredPlaystyleProfile) => {
    saveProfile(data);
    setProfile(data);
    
    // Sync to Supabase if logged in
    if (user?.id) {
      syncProfileToSupabase(user.id, data).catch(() => {});
    }
  }, [user?.id]);
  
  // Clear profile
  const clearProfile = useCallback(() => {
    clearStoredProfile();
    setProfile(null);
  }, []);
  
  // Record a deck build
  const recordBuild = useCallback(() => {
    const newCount = incrementDailyBuildCount();
    setDailyBuildsUsed(newCount);
    return newCount;
  }, []);
  
  // Computed values
  const hasProfile = profile !== null;
  const profileAge = profile ? getProfileAgeInDays() : null;
  const dailyBuildsRemaining = getRemainingBuilds(depth.dailyDeckBuildLimit);
  const canBuild = canBuildDeck(depth.dailyDeckBuildLimit);
  
  return {
    profile,
    hasProfile,
    profileAge,
    loading,
    dailyBuildsUsed,
    dailyBuildsRemaining,
    canBuild,
    refreshProfile,
    updateProfile,
    clearProfile,
    recordBuild,
  };
}

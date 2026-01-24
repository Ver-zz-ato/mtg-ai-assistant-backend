import { createClient } from '@/lib/supabase/server';

/**
 * Standardized Pro status check for server-side code
 * Checks both profiles.is_pro (database) AND user_metadata (fallback)
 * This ensures consistency across all Pro gates
 */
export async function checkProStatus(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    // Get user to check metadata
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return false;
    }

    // Check database (primary source)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', userId)
      .single();

    const isProFromProfile = profile?.is_pro === true;
    
    // Check metadata (fallback for backward compatibility)
    const isProFromMetadata = 
      user.user_metadata?.is_pro === true || 
      user.user_metadata?.pro === true;

    // Return true if either source says Pro (OR logic for consistency)
    return isProFromProfile || isProFromMetadata;
  } catch (error) {
    console.error('Error checking Pro status:', error);
    // On error, default to false (secure by default)
    return false;
  }
}

/**
 * Get Pro status with detailed information (for debugging)
 */
export async function getProStatusDetails(userId: string): Promise<{
  isPro: boolean;
  fromProfile: boolean;
  fromMetadata: boolean;
  profileError?: string;
}> {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== userId) {
      return { isPro: false, fromProfile: false, fromMetadata: false };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_pro')
      .eq('id', userId)
      .single();

    const isProFromProfile = profile?.is_pro === true;
    const isProFromMetadata = 
      user.user_metadata?.is_pro === true || 
      user.user_metadata?.pro === true;

    return {
      isPro: isProFromProfile || isProFromMetadata,
      fromProfile: isProFromProfile,
      fromMetadata: isProFromMetadata,
      profileError: profileError?.message,
    };
  } catch (error: any) {
    return {
      isPro: false,
      fromProfile: false,
      fromMetadata: false,
      profileError: error?.message,
    };
  }
}

/**
 * Standardized authentication messages for consistent UX
 */

export const AUTH_MESSAGES = {
  // Generic
  SIGN_IN_REQUIRED: 'Please sign in to use this feature',
  
  // Specific features
  LIKE_DECKS: 'Sign in to like decks',
  SAVE_DECKS: 'Please sign in to save decks',
  CREATE_DECK: 'Please sign in to create a deck',
  ATTACH_CARD: 'Please sign in to attach cards to your profile',
  SHARE_CARD: 'Please sign in to share a custom card',
  
  // Success messages
  SAVED: 'Saved successfully',
  CHANGES_SAVED: 'Changes saved',
  
  // Account
  ACCOUNT_CREATED: 'Account created — welcome to ManaTap!',
} as const;

/**
 * Show a toast message using the client-side toast system
 */
export async function showAuthToast(message: string) {
  try {
    const { toastError } = await import('@/lib/toast-client');
    toastError(message);
  } catch {
    // Fallback to alert if toast system isn't available
    alert(message);
  }
}












































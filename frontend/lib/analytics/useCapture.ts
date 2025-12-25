/**
 * React hook wrapper for capture() that automatically includes authentication status
 */

import { capture as baseCapture } from '@/lib/ph';
import { useAuth } from '@/lib/auth-context';

/**
 * Hook that returns a capture function with automatic auth context
 * 
 * @example
 *   const capture = useCapture();
 *   capture(AnalyticsEvents.DECK_SAVED, { deck_id: '123' });
 */
export function useCapture() {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  
  return (event: string, props?: Record<string, any>) => {
    baseCapture(event, props, { isAuthenticated });
  };
}

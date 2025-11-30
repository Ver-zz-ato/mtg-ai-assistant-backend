/**
 * Cookie consent management helper
 * 
 * Manages analytics consent state in localStorage.
 * SSR-safe (guards for typeof window !== "undefined").
 */

export type ConsentStatus = "accepted" | "declined" | "unknown";

const CONSENT_STORAGE_KEY = "manatap_cookie_consent";
const LEGACY_CONSENT_KEY = "analytics:consent"; // For backward compatibility

/**
 * Get current consent status
 * Returns "unknown" if no consent has been given yet
 */
export function getConsentStatus(): ConsentStatus {
  if (typeof window === "undefined") return "unknown";
  
  try {
    const status = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (status === "accepted" || status === "declined") {
      return status;
    }
    
    // Check legacy key for backward compatibility
    const legacy = window.localStorage.getItem(LEGACY_CONSENT_KEY);
    if (legacy === "granted") {
      // Migrate to new format
      window.localStorage.setItem(CONSENT_STORAGE_KEY, "accepted");
      return "accepted";
    }
    
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Set consent status
 */
export function setConsentStatus(status: "accepted" | "declined"): void {
  if (typeof window === "undefined") return;
  
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, status);
    
    // Also set legacy key for backward compatibility with existing code
    if (status === "accepted") {
      window.localStorage.setItem(LEGACY_CONSENT_KEY, "granted");
      // Emit event for existing listeners
      window.dispatchEvent(new Event("analytics:consent-granted"));
    } else {
      window.localStorage.removeItem(LEGACY_CONSENT_KEY);
      window.dispatchEvent(new Event("analytics:consent-revoked"));
    }
  } catch (error) {
    console.error("Failed to save consent status:", error);
  }
}

/**
 * Clear consent status (for testing or user preference reset)
 */
export function clearConsentStatus(): void {
  if (typeof window === "undefined") return;
  
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_CONSENT_KEY);
  } catch (error) {
    console.error("Failed to clear consent status:", error);
  }
}

/**
 * Check if client-side analytics should be enabled
 * (alias for backward compatibility)
 */
export function hasConsent(): boolean {
  return getConsentStatus() === "accepted";
}


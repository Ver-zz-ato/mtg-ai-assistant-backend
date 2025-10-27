// lib/frustration-detector.ts
// Utilities to detect user frustration indicators

import { trackUserFrustration } from './analytics-enhanced';

interface FrustrationState {
  rapidClicks: { count: number; lastClick: number };
  formResubmits: { count: number; lastSubmit: number };
  backButtonSpam: { count: number; lastBack: number };
  errorRepeats: Map<string, { count: number; lastError: number }>;
}

class FrustrationDetector {
  private state: FrustrationState = {
    rapidClicks: { count: 0, lastClick: 0 },
    formResubmits: { count: 0, lastSubmit: 0 },
    backButtonSpam: { count: 0, lastBack: 0 },
    errorRepeats: new Map()
  };

  private readonly RAPID_CLICK_THRESHOLD = 5; // clicks
  private readonly RAPID_CLICK_WINDOW = 2000; // 2 seconds
  private readonly FORM_RESUBMIT_THRESHOLD = 3; // attempts
  private readonly FORM_RESUBMIT_WINDOW = 10000; // 10 seconds
  private readonly ERROR_REPEAT_THRESHOLD = 3; // same error
  private readonly ERROR_REPEAT_WINDOW = 30000; // 30 seconds

  detectRapidClicks(element?: string) {
    const now = Date.now();
    const { rapidClicks } = this.state;

    if (now - rapidClicks.lastClick < this.RAPID_CLICK_WINDOW) {
      rapidClicks.count++;
    } else {
      rapidClicks.count = 1;
    }
    
    rapidClicks.lastClick = now;

    if (rapidClicks.count >= this.RAPID_CLICK_THRESHOLD) {
      trackUserFrustration('rapid_clicks', { 
        element,
        click_count: rapidClicks.count,
        time_window_ms: this.RAPID_CLICK_WINDOW
      });
      
      // Reset to avoid spam
      rapidClicks.count = 0;
    }
  }

  detectFormResubmit(formId: string, error?: string) {
    const now = Date.now();
    const { formResubmits } = this.state;

    if (now - formResubmits.lastSubmit < this.FORM_RESUBMIT_WINDOW) {
      formResubmits.count++;
    } else {
      formResubmits.count = 1;
    }
    
    formResubmits.lastSubmit = now;

    if (formResubmits.count >= this.FORM_RESUBMIT_THRESHOLD) {
      trackUserFrustration('form_resubmit', {
        form_id: formId,
        attempt_count: formResubmits.count,
        last_error: error
      });
      
      // Reset to avoid spam
      formResubmits.count = 0;
    }
  }

  detectErrorRepeat(errorType: string, errorMessage?: string) {
    const now = Date.now();
    const existing = this.state.errorRepeats.get(errorType);

    if (existing && now - existing.lastError < this.ERROR_REPEAT_WINDOW) {
      existing.count++;
      existing.lastError = now;
    } else {
      this.state.errorRepeats.set(errorType, { count: 1, lastError: now });
    }

    const current = this.state.errorRepeats.get(errorType)!;
    
    if (current.count >= this.ERROR_REPEAT_THRESHOLD) {
      trackUserFrustration('error_repeat', {
        error_type: errorType,
        error_message: errorMessage,
        repeat_count: current.count
      });
      
      // Reset to avoid spam
      current.count = 0;
    }
  }

  detectBackButtonSpam() {
    const now = Date.now();
    const { backButtonSpam } = this.state;

    if (now - backButtonSpam.lastBack < 1000) { // 1 second window
      backButtonSpam.count++;
    } else {
      backButtonSpam.count = 1;
    }
    
    backButtonSpam.lastBack = now;

    if (backButtonSpam.count >= 3) {
      trackUserFrustration('back_button_spam', {
        back_count: backButtonSpam.count
      });
      
      // Reset to avoid spam
      backButtonSpam.count = 0;
    }
  }
}

// Global instance
const frustrationDetector = new FrustrationDetector();

// Convenience functions for easy use
export function detectRapidClicks(element?: string) {
  frustrationDetector.detectRapidClicks(element);
}

export function detectFormResubmit(formId: string, error?: string) {
  frustrationDetector.detectFormResubmit(formId, error);
}

export function detectErrorRepeat(errorType: string, errorMessage?: string) {
  frustrationDetector.detectErrorRepeat(errorType, errorMessage);
}

export function detectBackButtonSpam() {
  frustrationDetector.detectBackButtonSpam();
}

// Setup automatic detection
export function setupFrustrationDetection() {
  if (typeof window === 'undefined') return;

  // Track rapid clicks on common interactive elements
  const clickableSelectors = ['button', 'a', '[role="button"]', 'input[type="submit"]'];
  
  clickableSelectors.forEach(selector => {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.matches(selector)) {
        detectRapidClicks(selector);
      }
    });
  });

  // Track back button usage
  let backButtonCount = 0;
  let lastBackTime = 0;
  
  window.addEventListener('popstate', () => {
    const now = Date.now();
    if (now - lastBackTime < 1000) {
      backButtonCount++;
    } else {
      backButtonCount = 1;
    }
    lastBackTime = now;
    
    if (backButtonCount >= 3) {
      detectBackButtonSpam();
      backButtonCount = 0;
    }
  });
}

// Auto-setup when module loads in browser
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupFrustrationDetection);
  } else {
    setupFrustrationDetection();
  }
}
# Next Features Implementation Plan

## Feature 1: Dark Mode Toggle (4-6 hours)

### Files to Create/Modify:
1. **Create**: `frontend/lib/theme-context.tsx` - Theme provider
2. **Create**: `frontend/components/ThemeToggle.tsx` - Toggle button component
3. **Modify**: `frontend/app/layout.tsx` - Wrap with ThemeProvider
4. **Modify**: `frontend/components/Header.tsx` - Add toggle to header
5. **Modify**: `tailwind.config.ts` - Ensure dark mode enabled

### Implementation Steps:

#### 1.1 Theme Context
```typescript
// lib/theme-context.tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('theme') as Theme;
    if (stored) setTheme(stored);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    const isDark = theme === 'dark' || 
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    root.classList.toggle('dark', isDark);
    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

#### 1.2 Theme Toggle Component
```typescript
// components/ThemeToggle.tsx
'use client';
import { useTheme } from '@/lib/theme-context';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  );
}
```

---

## Feature 2: Annual Plan Discount (2-4 hours)

### Files to Modify:
1. **Modify**: `frontend/app/pricing/page.tsx` - Add annual pricing tier
2. **Create**: `frontend/app/api/billing/create-annual-checkout/route.ts` - Annual Stripe session
3. **Modify**: Stripe dashboard - Create annual price ID

### Implementation Steps:

#### 2.1 Add Annual Toggle to Pricing Page
```typescript
// app/pricing/page.tsx
const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

const monthlyPrice = 9.99;
const annualPrice = 95.88; // 20% off ($119.88 -> $95.88)
const savings = (monthlyPrice * 12) - annualPrice; // $24

<div className="flex items-center gap-3 mb-8">
  <button onClick={() => setBillingInterval('monthly')}>Monthly</button>
  <button onClick={() => setBillingInterval('annual')}>
    Annual <span className="text-emerald-400">Save 20%</span>
  </button>
</div>

{billingInterval === 'annual' && (
  <div className="text-sm text-emerald-400 mb-4">
    💰 Save ${savings.toFixed(2)}/year
  </div>
)}
```

#### 2.2 Stripe Integration
- Create annual price in Stripe Dashboard
- Update checkout session to accept `price_id` parameter
- Store price ID in environment variables

---

## Feature 3: Keyboard Shortcuts (4-6 hours)

### Files to Create/Modify:
1. **Create**: `frontend/hooks/useKeyboardShortcuts.ts` - Global shortcuts hook
2. **Create**: `frontend/components/ShortcutsModal.tsx` - Help modal
3. **Create**: `frontend/components/CommandPalette.tsx` - Cmd+K palette
4. **Modify**: `frontend/app/layout.tsx` - Add shortcuts provider
5. **Modify**: Multiple pages - Add page-specific shortcuts

### Implementation Steps:

#### 3.1 Global Shortcuts Hook
```typescript
// hooks/useKeyboardShortcuts.ts
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in input
      if (['INPUT', 'TEXTAREA'].includes((e.target as any).tagName)) return;

      // Global shortcuts
      if (e.key === '/') {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('[data-search]')?.focus();
      }
      
      if (e.key === 'n') {
        e.preventDefault();
        router.push('/new-deck');
      }

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts(true);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
```

#### 3.2 Shortcuts to Implement
```
Global:
- / : Focus search
- n : New deck
- ? : Show shortcuts help
- Cmd/Ctrl + K : Command palette
- Esc : Close modals

Deck Editor:
- Cmd/Ctrl + S : Save deck
- Cmd/Ctrl + D : Delete card
- Arrow keys : Navigate cards

Collections:
- Cmd/Ctrl + I : Import CSV
- Cmd/Ctrl + E : Export CSV
```

---

## Feature 4: Service Worker + PWA (6-8 hours)

### Files to Create/Modify:
1. **Create**: `public/manifest.json` - PWA manifest
2. **Create**: `public/sw.js` - Service worker
3. **Create**: `frontend/components/InstallPrompt.tsx` - Install banner
4. **Modify**: `frontend/app/layout.tsx` - Add manifest link
5. **Create**: PWA icons (192x192, 512x512)

### Implementation Steps:

#### 4.1 PWA Manifest
```json
// public/manifest.json
{
  "name": "ManaTap - MTG Deck Builder",
  "short_name": "ManaTap",
  "description": "Build, analyze, and optimize your Magic: The Gathering decks",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#10b981",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### 4.2 Service Worker
```javascript
// public/sw.js
const CACHE_NAME = 'manatap-v1';
const STATIC_ASSETS = [
  '/',
  '/pricing',
  '/my-decks',
  '/collections'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

#### 4.3 Install Prompt
```typescript
// components/InstallPrompt.tsx
'use client';
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  if (!deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-emerald-600 text-white p-4 rounded-lg">
      <p>Install ManaTap for quick access!</p>
      <button onClick={handleInstall}>Install</button>
    </div>
  );
}
```

---

## Implementation Order:

1. **Dark Mode** (Day 1: 4-6 hrs)
   - Most impactful UX improvement
   - Foundation for better accessibility

2. **Annual Plan** (Day 1-2: 2-4 hrs)
   - Quick revenue boost
   - Simple Stripe integration

3. **Keyboard Shortcuts** (Day 2-3: 4-6 hrs)
   - Power user feature
   - Improves retention

4. **PWA + Service Worker** (Day 3-4: 6-8 hrs)
   - Mobile experience
   - Offline capability

**Total Estimated Time**: 16-24 hours (2-3 days)

---

## Success Criteria:

### Dark Mode:
- [ ] Toggle button in header
- [ ] Preference persists in localStorage
- [ ] All pages respect dark mode
- [ ] Smooth transition animations

### Annual Plan:
- [ ] Annual pricing visible on /pricing
- [ ] "Save 20%" badge displayed
- [ ] Stripe checkout works for annual
- [ ] Pro badge works for annual subscribers

### Keyboard Shortcuts:
- [ ] All global shortcuts work
- [ ] Help modal shows all shortcuts
- [ ] Command palette functional
- [ ] No conflicts with browser shortcuts

### PWA:
- [ ] manifest.json valid
- [ ] Service worker caches assets
- [ ] Install prompt appears
- [ ] Works offline (basic navigation)
- [ ] Lighthouse PWA score > 90

---

## Analytics Events to Track:

```typescript
// Dark mode
track('theme_changed', { theme: 'dark' | 'light' | 'system' })

// Annual plan
track('annual_plan_selected', { savings: 24 })
track('annual_checkout_started')

// Keyboard shortcuts
track('shortcut_used', { key: '/', action: 'search' })
track('shortcuts_help_opened')
track('command_palette_opened')

// PWA
track('pwa_install_prompted')
track('pwa_install_accepted')
track('pwa_install_dismissed')
track('app_opened_standalone') // from PWA
```

---

## Testing Checklist:

- [ ] Dark mode works on all pages
- [ ] Annual plan checkout completes
- [ ] Stripe webhook updates subscription
- [ ] All keyboard shortcuts work
- [ ] Command palette search works
- [ ] PWA installs on mobile
- [ ] Service worker caches correctly
- [ ] Offline mode shows cached pages
- [ ] Build completes successfully
- [ ] No console errors














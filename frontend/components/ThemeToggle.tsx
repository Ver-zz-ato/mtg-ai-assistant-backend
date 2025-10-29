'use client';

import { useTheme } from '@/lib/theme-context';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="p-2 rounded-lg border border-neutral-700 bg-neutral-900 w-10 h-10" aria-label="Toggle theme">
        <div className="w-5 h-5" />
      </button>
    );
  }

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
    } else if (theme === 'dark') {
      setTheme('system');
    } else {
      setTheme('light');
    }

    // Track theme change
    try {
      const { capture } = require('@/lib/ph');
      capture('theme_changed', { 
        from: theme, 
        to: theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light' 
      });
    } catch {}
  };

  return (
    <button
      onClick={cycleTheme}
      className="p-2 rounded-lg border border-neutral-700 hover:bg-neutral-800 transition-colors relative group"
      title={`Theme: ${theme} (${resolvedTheme})`}
      aria-label="Toggle theme"
    >
      {/* Sun icon (light mode) */}
      <svg
        className={`w-5 h-5 absolute inset-2 transition-all duration-300 ${
          resolvedTheme === 'light' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>

      {/* Moon icon (dark mode) */}
      <svg
        className={`w-5 h-5 absolute inset-2 transition-all duration-300 ${
          resolvedTheme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>

      {/* Tooltip */}
      <div className="absolute top-full mt-2 right-0 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {theme === 'system' ? `System (${resolvedTheme})` : theme}
      </div>
    </button>
  );
}













































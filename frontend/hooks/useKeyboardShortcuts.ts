'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { capture } from '@/lib/ph';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName) || 
                       target.isContentEditable;

      // Global shortcuts (only when not typing)
      if (!isTyping) {
        // / - Focus search
        if (e.key === '/') {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('[data-search], input[type="search"], input[placeholder*="search" i]');
          if (searchInput) {
            searchInput.focus();
            capture('shortcut_used', { key: '/', action: 'search' });
          }
        }

        // n - New deck
        if (e.key === 'n') {
          e.preventDefault();
          router.push('/new-deck');
          capture('shortcut_used', { key: 'n', action: 'new_deck' });
        }

        // ? - Show shortcuts help
        if (e.key === '?') {
          e.preventDefault();
          setShowShortcutsModal(true);
          capture('shortcuts_help_opened');
        }
      }

      // Cmd/Ctrl + K - Command palette (works even when typing)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
        capture('command_palette_opened');
      }

      // Escape - Close modals
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setShowCommandPalette(false);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  return {
    showShortcutsModal,
    setShowShortcutsModal,
    showCommandPalette,
    setShowCommandPalette,
  };
}























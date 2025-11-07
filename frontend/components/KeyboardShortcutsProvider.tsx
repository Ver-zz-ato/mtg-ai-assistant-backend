'use client';

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import ShortcutsModal from './ShortcutsModal';
import CommandPalette from './CommandPalette';

export default function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const { 
    showShortcutsModal, 
    setShowShortcutsModal,
    showCommandPalette,
    setShowCommandPalette 
  } = useKeyboardShortcuts();

  return (
    <>
      {children}
      <ShortcutsModal 
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
      />
    </>
  );
}





























































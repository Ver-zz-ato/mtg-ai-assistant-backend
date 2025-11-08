'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { capture } from '@/lib/ph';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      id: 'new-deck',
      label: 'New Deck',
      description: 'Create a new deck',
      icon: '➕',
      action: () => {
        router.push('/new-deck');
        capture('command_palette_action', { command: 'new_deck' });
      },
      keywords: ['create', 'add', 'deck']
    },
    {
      id: 'my-decks',
      label: 'My Decks',
      description: 'View all your decks',
      icon: '🃏',
      action: () => {
        router.push('/my-decks');
        capture('command_palette_action', { command: 'my_decks' });
      },
      keywords: ['view', 'list', 'decks']
    },
    {
      id: 'collections',
      label: 'My Collections',
      description: 'Manage your card collections',
      icon: '📦',
      action: () => {
        router.push('/collections');
        capture('command_palette_action', { command: 'collections' });
      },
      keywords: ['collection', 'cards']
    },
    {
      id: 'wishlist',
      label: 'Wishlist',
      description: 'View your wishlist',
      icon: '⭐',
      action: () => {
        router.push('/wishlist');
        capture('command_palette_action', { command: 'wishlist' });
      },
      keywords: ['wish', 'want']
    },
    {
      id: 'price-tracker',
      label: 'Price Tracker',
      description: 'Track card prices over time',
      icon: '📈',
      action: () => {
        router.push('/price-tracker');
        capture('command_palette_action', { command: 'price_tracker' });
      },
      keywords: ['price', 'track', 'chart']
    },
    {
      id: 'pricing',
      label: 'Upgrade to Pro',
      description: 'View Pro pricing and features',
      icon: '💎',
      action: () => {
        router.push('/pricing');
        capture('command_palette_action', { command: 'pricing' });
      },
      keywords: ['pro', 'upgrade', 'subscribe']
    },
    {
      id: 'profile',
      label: 'Profile',
      description: 'View and edit your profile',
      icon: '👤',
      action: () => {
        router.push('/profile');
        capture('command_palette_action', { command: 'profile' });
      },
      keywords: ['user', 'account', 'settings']
    },
    {
      id: 'help',
      label: 'Help & Support',
      description: 'Get help and support',
      icon: '❓',
      action: () => {
        router.push('/support');
        capture('command_palette_action', { command: 'support' });
      },
      keywords: ['help', 'support', 'contact']
    }
  ];

  const filteredCommands = commands.filter((cmd) => {
    const searchText = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchText) ||
      cmd.description?.toLowerCase().includes(searchText) ||
      cmd.keywords?.some(k => k.includes(searchText))
    );
  });

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-[9999] pt-[20vh] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="w-full bg-transparent text-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          />
        </div>

        {/* Commands List */}
        <div className="max-h-96 overflow-auto">
          {filteredCommands.length > 0 ? (
            <div className="py-2">
              {filteredCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  onClick={() => {
                    cmd.action();
                    onClose();
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3 transition-colors ${
                    idx === selectedIndex
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-white'
                  }`}
                >
                  <span className="text-2xl">{cmd.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{cmd.label}</div>
                    {cmd.description && (
                      <div className={`text-sm ${idx === selectedIndex ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {cmd.description}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="text-4xl mb-2">🔍</div>
              <div>No commands found</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}






























































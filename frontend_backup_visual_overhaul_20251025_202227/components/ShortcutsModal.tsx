'use client';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'Global',
      items: [
        { key: '/', description: 'Focus search' },
        { key: 'n', description: 'New deck' },
        { key: '?', description: 'Show this help' },
        { key: 'Cmd/Ctrl + K', description: 'Command palette' },
        { key: 'Esc', description: 'Close modals' },
      ]
    },
    {
      category: 'Navigation',
      items: [
        { key: 'Arrow Keys', description: 'Navigate items in lists' },
        { key: 'Enter', description: 'Select/Confirm' },
        { key: 'Tab', description: 'Move between fields' },
      ]
    },
    {
      category: 'Deck Editor',
      items: [
        { key: 'Cmd/Ctrl + S', description: 'Save deck (auto-saves)' },
        { key: 'Delete/Backspace', description: 'Remove selected card' },
        { key: '1-9', description: 'Set card quantity' },
      ]
    }
  ];

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-auto shadow-2xl border border-gray-200 dark:border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Keyboard Shortcuts</h2>
              <p className="text-blue-100 text-sm">Master ManaTap AI with these shortcuts</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="w-1 h-6 bg-blue-600 rounded"></span>
                {section.category}
              </h3>
              <div className="space-y-2 ml-3">
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {item.description}
                    </span>
                    <kbd className="px-3 py-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800 rounded-b-2xl">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            💡 <strong>Tip:</strong> Press <kbd className="px-2 py-1 text-xs font-semibold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">?</kbd> anytime to see this menu
          </p>
        </div>
      </div>
    </div>
  );
}



























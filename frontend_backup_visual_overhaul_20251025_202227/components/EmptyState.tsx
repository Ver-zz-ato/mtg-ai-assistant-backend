interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  secondaryActionHref?: string;
  onSecondaryAction?: () => void;
}

export default function EmptyState({
  icon = "📦",
  title,
  description,
  actionText,
  actionHref,
  onAction,
  secondaryActionText,
  secondaryActionHref,
  onSecondaryAction,
}: EmptyStateProps) {
  const renderButton = (
    text?: string,
    href?: string,
    onClick?: () => void,
    isPrimary = true
  ) => {
    if (!text) return null;

    const className = isPrimary
      ? "px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
      : "px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors";

    if (href) {
      return (
        <a href={href} className={className}>
          {text}
        </a>
      );
    }

    return (
      <button onClick={onClick} className={className}>
        {text}
      </button>
    );
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="text-7xl mb-6 animate-bounce">{icon}</div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
        {title}
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
        {description}
      </p>
      <div className="flex gap-4">
        {renderButton(actionText, actionHref, onAction, true)}
        {renderButton(
          secondaryActionText,
          secondaryActionHref,
          onSecondaryAction,
          false
        )}
      </div>
    </div>
  );
}

// Pre-built empty states
export function NoDecksEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="text-7xl mb-6 animate-bounce">🃏</div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
        No decks yet
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
        Let's build your first deck! Import from a list, start from scratch, or try a sample Commander deck.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        {(()=>{ try { const { SampleDeckButton } = require('./SampleDeckSelector'); return <SampleDeckButton />; } catch { return null; } })()}
        <a href="/new-deck" className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl">
          Create Deck
        </a>
        <a href="/my-decks?action=import" className="px-6 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          Import Deck
        </a>
      </div>
    </div>
  );
}

export function NoCollectionsEmptyState() {
  return (
    <EmptyState
      icon="📚"
      title="No collections yet"
      description="Start tracking your MTG cards! Create a collection to see what you own and what it's worth."
      actionText="Create Collection"
      actionHref="/collections?action=create"
      secondaryActionText="Import CSV"
      secondaryActionHref="/collections?action=import"
    />
  );
}

export function NoWishlistItemsEmptyState() {
  return (
    <EmptyState
      icon="⭐"
      title="Your wishlist is empty"
      description="Add cards you want to acquire! Track prices and get notified when they drop."
      actionText="Browse Cards"
      actionHref="/cards"
      secondaryActionText="Import List"
      secondaryActionHref="/wishlist?action=import"
    />
  );
}

export function NoChatHistoryEmptyState() {
  return (
    <EmptyState
      icon="💬"
      title="No chat history"
      description="Start a conversation with the AI deck assistant! Get suggestions, analyze decks, and build better."
      actionText="Start Chatting"
      onAction={() => {
        const input = document.querySelector('[data-chat-input]') as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }}
      secondaryActionText="See Examples"
      actionHref="/support#chat-examples"
    />
  );
}

export function NoCostToFinishEmptyState() {
  return (
    <EmptyState
      icon="💰"
      title="No deck selected"
      description="Select a deck from your collection to see what cards you're missing and how much they'll cost."
      actionText="View My Decks"
      actionHref="/my-decks"
      secondaryActionText="Import Deck"
      secondaryActionHref="/new-deck"
    />
  );
}


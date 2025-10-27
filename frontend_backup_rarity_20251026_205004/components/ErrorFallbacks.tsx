'use client';
import React from 'react';
import ErrorBoundary from './ErrorBoundary';

interface ErrorFallbackProps {
  onRetry?: () => void;
  title?: string;
  message?: string;
  actionLabel?: string;
  icon?: 'chat' | 'network' | 'empty' | 'scryfall' | 'generic';
}

const icons = {
  chat: (
    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  network: (
    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.536-.833-3.306 0l-6.928 12C-2.502 17.833-.54 19.5.98 19.5z" />
    </svg>
  ),
  empty: (
    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  ),
  scryfall: (
    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M19 11H5m14-7H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z" />
    </svg>
  ),
  generic: (
    <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5l-6.928-12c-.77-.833-2.536-.833-3.306 0l-6.928 12C-2.502 17.833-.54 19.5.98 19.5z" />
    </svg>
  )
};

export function ErrorFallback({ 
  onRetry, 
  title = "Something went wrong", 
  message = "Please try again in a moment.",
  actionLabel = "Try Again",
  icon = 'generic' 
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-4">
        {icons[icon]}
      </div>
      <h3 className="text-lg font-semibold text-neutral-200 mb-2">{title}</h3>
      <p className="text-neutral-400 mb-4 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Specific error fallbacks for common scenarios
export function ChatErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorFallback
      icon="chat"
      title="Chat temporarily unavailable"
      message="Our AI assistant is having trouble right now. This usually resolves quickly."
      actionLabel="Try Again"
      onRetry={onRetry}
    />
  );
}

export function ScryfallErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorFallback
      icon="scryfall"
      title="Card data temporarily unavailable"
      message="We're having trouble loading card information from Scryfall. Please try again in a moment."
      actionLabel="Reload Cards"
      onRetry={onRetry}
    />
  );
}

export function NetworkErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorFallback
      icon="network"
      title="Connection problem"
      message="Check your internet connection and try again."
      actionLabel="Retry"
      onRetry={onRetry}
    />
  );
}

export function EmptyStateError({ 
  title = "Nothing here yet",
  message = "Try adding some content or checking back later.",
  actionLabel,
  onAction
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <ErrorFallback
      icon="empty"
      title={title}
      message={message}
      actionLabel={actionLabel}
      onRetry={onAction}
    />
  );
}

// Higher-order component for wrapping components with specific error handling
export function withErrorFallback<P extends object>(
  Component: React.ComponentType<P>,
  fallback: React.ComponentType<{ onRetry: () => void }>
) {
  return function WrappedComponent(props: P) {
    const [key, setKey] = React.useState(0);
    const handleRetry = () => setKey(prev => prev + 1);

    return (
      <ErrorBoundary
        key={key}
        fallback={React.createElement(fallback, { onRetry: handleRetry })}
      >
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}


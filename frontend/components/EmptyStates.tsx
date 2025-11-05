'use client';

import React from 'react';
import Link from 'next/link';
import { capture } from '@/lib/ph';

interface EmptyStateProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  suggestions?: string[];
}

export function EmptyState({ 
  title, 
  description, 
  icon, 
  primaryAction, 
  secondaryAction,
  suggestions 
}: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-2 border-dashed border-blue-600/30 flex items-center justify-center">
            {icon}
          </div>
        </div>

        {/* Title & Description */}
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-gray-400 mb-6">{description}</p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
          {primaryAction && (
            primaryAction.href ? (
              <Link
                href={primaryAction.href}
                onClick={() => capture('empty_state_primary_action', { title })}
                className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <button
                onClick={() => {
                  capture('empty_state_primary_action', { title });
                  primaryAction.onClick?.();
                }}
                className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105"
              >
                {primaryAction.label}
              </button>
            )
          )}

          {secondaryAction && (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                onClick={() => capture('empty_state_secondary_action', { title })}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                onClick={() => {
                  capture('empty_state_secondary_action', { title });
                  secondaryAction.onClick?.();
                }}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {secondaryAction.label}
              </button>
            )
          )}
        </div>

        {/* Suggestions */}
        {suggestions && suggestions.length > 0 && (
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-lg p-4">
            <p className="text-sm font-semibold text-gray-300 mb-2">💡 Quick Tips:</p>
            <ul className="text-sm text-gray-400 space-y-1 text-left">
              {suggestions.map((suggestion, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Specific empty states

export function EmptyDecksState() {
  return (
    <EmptyState
      title="No Decks Yet"
      description="Start building your Magic: The Gathering deck collection!"
      icon={
        <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      }
      primaryAction={{
        label: "Create New Deck",
        href: "/new-deck"
      }}
      secondaryAction={{
        label: "Browse Sample Decks",
        onClick: () => {
          // Trigger sample deck modal
          window.dispatchEvent(new CustomEvent('open-sample-deck-modal'));
        }
      }}
      suggestions={[
        "Import from Moxfield, Archidekt, or paste a decklist",
        "Start with a sample Commander deck and customize it",
        "Use AI chat to help you build from scratch"
      ]}
    />
  );
}

export function EmptyCollectionsState() {
  return (
    <EmptyState
      title="No Collections Yet"
      description="Track your card collection to see what you own and what you need!"
      icon={
        <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      }
      primaryAction={{
        label: "Create Collection",
        onClick: () => {
          const name = prompt("Collection name:");
          if (name) {
            fetch('/api/collections/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name })
            }).then(() => window.location.reload());
          }
        }
      }}
      secondaryAction={{
        label: "Import CSV",
        href: "/collections?import=true"
      }}
      suggestions={[
        "Create a collection for each set you own",
        "Import from CSV (Arena, MTGO format supported)",
        "Track collection value over time"
      ]}
    />
  );
}

export function EmptyWishlistState() {
  return (
    <EmptyState
      title="Wishlist is Empty"
      description="Add cards you want to buy and track their prices!"
      icon={
        <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      }
      primaryAction={{
        label: "Add Cards to Wishlist",
        href: "/wishlist"
      }}
      secondaryAction={{
        label: "Browse Price Tracker",
        href: "/price-tracker"
      }}
      suggestions={[
        "Get price drop alerts when cards you want go on sale",
        "See missing cards from Cost-to-Finish",
        "Track total wishlist value"
      ]}
    />
  );
}

export function EmptySearchState({ query }: { query?: string }) {
  return (
    <EmptyState
      title="No Results Found"
      description={query ? `No decks found matching "${query}"` : "No decks match your filters"}
      icon={
        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
      primaryAction={{
        label: "Clear Filters",
        onClick: () => window.location.href = window.location.pathname
      }}
      suggestions={[
        "Try different search terms or filters",
        "Browse all public decks instead",
        "Create a deck yourself!"
      ]}
    />
  );
}


























































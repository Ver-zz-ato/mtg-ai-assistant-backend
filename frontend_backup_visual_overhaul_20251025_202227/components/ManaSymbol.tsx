"use client";
import React from "react";

interface ManaSymbolProps {
  symbol: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export default function ManaSymbol({ symbol, size = 'medium', className = '' }: ManaSymbolProps) {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-5 h-5',
    large: 'w-6 h-6'
  };

  // Convert symbol to Scryfall format
  const scryfallSymbol = symbol.toLowerCase();
  
  // Try local mana symbols first, then Scryfall as fallback
  const localPath = `/mana/${scryfallSymbol}.svg`;
  const scryfallPath = `https://svgs.scryfall.io/card-symbols/${scryfallSymbol}.svg`;
  
  return (
    <img 
      src={localPath}
      alt={symbol}
      className={`${sizeClasses[size]} ${className} inline-block`}
      style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
      onError={(e) => {
        // Try Scryfall as fallback
        const target = e.target as HTMLImageElement;
        if (target.src === localPath) {
          target.src = scryfallPath;
        } else {
          // If both fail, show a simple circle
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent) {
            parent.innerHTML = `<div class="${sizeClasses[size]} rounded-full bg-gray-500 text-white text-xs flex items-center justify-center font-bold">${symbol}</div>`;
          }
        }
      }}
    />
  );
}

interface ManaCostProps {
  cost: string[];
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function ManaCost({ cost, size = 'medium', className = '' }: ManaCostProps) {
  if (!cost || cost.length === 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center gap-0.5 ${className}`}>
      {cost.map((symbol, index) => (
        <ManaSymbol 
          key={`${symbol}-${index}`} 
          symbol={symbol} 
          size={size}
        />
      ))}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';

interface PublicTrustFooterProps {
  showModel?: boolean;
  showData?: boolean;
  className?: string;
  compact?: boolean;
}

export default function PublicTrustFooter({ 
  showModel = true, 
  showData = true, 
  className = "",
  compact = false 
}: PublicTrustFooterProps) {
  const [modelInfo, setModelInfo] = useState<{
    name: string;
    lastUpdated: string;
  } | null>(null);

  useEffect(() => {
    // Get model information from environment or API
    const modelName = process.env.NEXT_PUBLIC_OPENAI_MODEL || "GPT-4o-mini";
    const lastUpdated = process.env.NEXT_PUBLIC_MODEL_LAST_UPDATED || "October 2024";
    
    setModelInfo({
      name: modelName,
      lastUpdated: lastUpdated
    });
  }, []);

  if (!showModel && !showData) return null;

  const baseClasses = compact 
    ? "text-xs text-gray-500 dark:text-gray-400" 
    : "text-sm text-gray-600 dark:text-gray-300";
  
  const containerClasses = compact 
    ? "flex items-center gap-2 flex-wrap"
    : "flex items-center gap-3 flex-wrap";

  return (
    <div className={`${containerClasses} ${className}`}>
      {showModel && modelInfo && (
        <span className={baseClasses}>
          Model: {modelInfo.name} • Updated: {modelInfo.lastUpdated}
        </span>
      )}
      
      {showModel && showData && (
        <span className="text-gray-400">•</span>
      )}
      
      {showData && (
        <span className={baseClasses}>
          Data: <a 
            href="https://scryfall.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline text-blue-500 hover:text-blue-400"
          >
            Scryfall API
          </a>
        </span>
      )}
    </div>
  );
}
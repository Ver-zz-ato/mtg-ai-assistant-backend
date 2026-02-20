/**
 * Commander art banner for hub and content pages.
 * Renders a full-width art_crop image with gradient overlay, similar to deck/swap-suggestions.
 */
"use client";

import React from "react";

interface CommanderArtBannerProps {
  artUrl: string;
  name: string;
  /** Optional subtitle (e.g. "Mulligan Guide") */
  subtitle?: string;
  className?: string;
}

export function CommanderArtBanner({
  artUrl,
  name,
  subtitle,
  className = "",
}: CommanderArtBannerProps) {
  const [imgError, setImgError] = React.useState(false);
  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 border-neutral-700 ${className}`}
    >
      {!imgError ? (
        <img
          src={artUrl}
          alt={name}
          className="w-full h-32 sm:h-40 object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-32 sm:h-40 bg-neutral-800 flex items-center justify-center text-neutral-500 text-sm">
          {name}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-neutral-950 to-transparent pointer-events-none" />
      <div className="absolute bottom-2 left-3 right-3">
        <div className="font-semibold text-sm text-white drop-shadow-lg">
          {name}
        </div>
        {subtitle && (
          <div className="text-xs text-neutral-200 drop-shadow-lg">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

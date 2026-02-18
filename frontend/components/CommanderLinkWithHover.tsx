"use client";

import React from "react";
import Link from "next/link";

interface CommanderLinkWithHoverProps {
  href: string;
  name: string;
  className?: string;
}

const PREVIEW_W = 192;
const PREVIEW_H = 256;
const MARGIN = 12;

/** Clamp preview position to viewport bounds. Prefer above cursor; fallback below. */
function clampPosition(clientX: number, clientY: number) {
  if (typeof window === "undefined")
    return { x: clientX, y: clientY, below: false };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const halfW = PREVIEW_W / 2;

  // Horizontal: keep within viewport
  const x = Math.min(vw - MARGIN - halfW, Math.max(MARGIN + halfW, clientX));

  // Vertical: prefer above cursor; if not enough space, show below
  const spaceAbove = clientY - MARGIN;
  const spaceBelow = vh - clientY - MARGIN;
  const below = spaceAbove < PREVIEW_H + MARGIN && spaceBelow > spaceAbove;

  const y = below
    ? Math.min(vh - MARGIN - PREVIEW_H, clientY + MARGIN)
    : Math.max(MARGIN, clientY - PREVIEW_H - MARGIN);

  return { x, y, below };
}

export function CommanderLinkWithHover({ href, name, className = "" }: CommanderLinkWithHoverProps) {
  const [art, setArt] = React.useState<string | null>(null);
  const [pos, setPos] = React.useState<{ x: number; y: number; below: boolean } | null>(null);
  const fetchedRef = React.useRef(false);

  const fetchArt = React.useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    try {
      const r = await fetch(
        `/api/commander-art?name=${encodeURIComponent(name)}`,
        { cache: "force-cache" }
      );
      const j = await r.json().catch(() => ({}));
      if (j?.ok && j?.art) {
        setArt(j.art);
      }
    } finally {
      /* no-op */
    }
  }, [name]);

  return (
    <span className="relative inline">
      <Link
        href={href}
        className={`text-blue-400 hover:text-blue-300 hover:underline ${className}`}
        onMouseEnter={(e) => {
          setPos(clampPosition(e.clientX, e.clientY));
          fetchArt();
        }}
        onMouseMove={(e) => setPos(clampPosition(e.clientX, e.clientY))}
        onMouseLeave={() => setPos(null)}
      >
        {name}
      </Link>
      {pos && art && (
        <div
          className="fixed pointer-events-none z-50"
          style={{
            left: pos.x,
            top: pos.y,
            transform: "translateX(-50%)",
            width: PREVIEW_W,
          }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden">
            <img
              src={art}
              alt={name}
              className="w-full aspect-[3/4] object-cover"
            />
            <div className="px-2 py-1.5 text-xs font-medium text-white bg-black/60">
              {name}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

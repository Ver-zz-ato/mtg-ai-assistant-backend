"use client";

import React from "react";
import Link from "next/link";

interface CommanderLinkWithHoverProps {
  href: string;
  name: string;
  className?: string;
}

export function CommanderLinkWithHover({ href, name, className = "" }: CommanderLinkWithHoverProps) {
  const [art, setArt] = React.useState<string | null>(null);
  const [hoverPos, setHoverPos] = React.useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const fetchedRef = React.useRef(false);

  const fetchArt = React.useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
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
      setLoading(false);
    }
  }, [name]);

  return (
    <>
      <Link
        href={href}
        className={`text-blue-400 hover:text-blue-300 hover:underline ${className}`}
        onMouseEnter={(e) => {
          setHoverPos({ x: e.clientX, y: e.clientY });
          fetchArt();
        }}
        onMouseMove={(e) => setHoverPos({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setHoverPos(null)}
      >
        {name}
      </Link>
      {hoverPos && art && (
        <div
          className="fixed pointer-events-none z-50"
          style={{ left: hoverPos.x + 16, top: hoverPos.y - 80 }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden">
            <img
              src={art}
              alt={name}
              className="w-48 h-64 object-cover"
            />
            <div className="px-2 py-1.5 text-xs font-medium text-white bg-black/60">
              {name}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

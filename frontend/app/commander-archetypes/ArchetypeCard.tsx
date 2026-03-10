'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ArchetypeDef } from '@/lib/data/archetypes';

interface ArchetypeCardProps {
  archetype: ArchetypeDef;
  imageUrl?: string;
  gradient: string;
}

export default function ArchetypeCard({ archetype, imageUrl, gradient }: ArchetypeCardProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = imageUrl && !imgError;

  return (
    <Link
      href={`/commander-archetypes/${archetype.slug}`}
      className="group block rounded-xl overflow-hidden border border-neutral-700 bg-neutral-800/80 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-300 hover:-translate-y-1"
    >
      {/* Hero image */}
      <div className={`relative h-40 bg-gradient-to-br ${gradient} overflow-hidden`}>
        {showImage ? (
          <>
            <img
              src={imageUrl}
              alt={archetype.title}
              className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
              onError={() => setImgError(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </>
        ) : (
          <div className="absolute inset-0 bg-black/30" />
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h2 className="font-bold text-white text-lg drop-shadow-lg group-hover:text-blue-200 transition-colors">
            {archetype.title}
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <p className="text-sm text-neutral-400 line-clamp-3 group-hover:text-neutral-300 transition-colors">
          {archetype.intro.slice(0, 140)}...
        </p>
        <span className="inline-block mt-3 text-xs text-blue-400 font-medium group-hover:text-blue-300">
          Read guide →
        </span>
      </div>
    </Link>
  );
}

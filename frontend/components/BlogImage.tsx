'use client';

import { useState } from 'react';

interface BlogImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackToGradient?: boolean;
  icon?: string;
}

export default function BlogImage({ src, alt, className = '', fallbackToGradient = false, icon }: BlogImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError && fallbackToGradient && icon) {
    return (
      <div className={className + ' flex items-center justify-center'}>
        <div className="relative z-10 text-8xl drop-shadow-2xl">{icon}</div>
      </div>
    );
  }

  if (hasError) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

'use client';

import React from 'react';
import BlogCardImage from '@/components/BlogCardImage';
import { sanitizeBlogHtml } from '@/lib/blog/sanitizeBlogHtml';

type Block = { type: 'html'; html: string } | { type: 'card'; name: string };

export default function BlogPostBody({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, i) =>
        block.type === 'html' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(block.html) }} />
        ) : (
          <BlogCardImage key={i} name={block.name} />
        )
      )}
    </>
  );
}

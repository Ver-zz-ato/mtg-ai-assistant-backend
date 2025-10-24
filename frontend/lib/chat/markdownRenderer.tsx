// lib/chat/markdownRenderer.tsx
// Simple markdown renderer for chat messages
// Converts basic markdown to React elements

import React from 'react';

/**
 * Parse and render basic markdown in chat messages
 * Supports: bold, italic, inline code, lists
 */
export function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines
    if (!line.trim()) {
      elements.push(<br key={`br-${i}`} />);
      continue;
    }
    
    // Check if it's a list item
    const isBullet = /^[\-\*\•]\s+/.test(line);
    const isNumbered = /^\d+[\.\)]\s+/.test(line);
    
    if (isBullet || isNumbered) {
      // Render as list item
      const content = line.replace(/^[\-\*\•]\s+/, '').replace(/^\d+[\.\)]\s+/, '');
      elements.push(
        <div key={i} className="ml-4">
          {isBullet && <span className="mr-2">•</span>}
          {isNumbered && <span className="mr-2">{line.match(/^(\d+)/)?.[1]}.</span>}
          {parseInlineMarkdown(content)}
        </div>
      );
    } else {
      // Regular line
      elements.push(
        <div key={i}>
          {parseInlineMarkdown(line)}
        </div>
      );
    }
  }
  
  return <>{elements}</>;
}

/**
 * Parse inline markdown (bold, italic, code) within a line
 */
function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentIndex = 0;
  let keyCounter = 0;
  
  // Regex patterns (order matters - check longer patterns first)
  const patterns = [
    { regex: /\*\*([^*]+)\*\*/g, render: (match: string) => <strong key={keyCounter++}>{match}</strong> }, // **bold**
    { regex: /__([^_]+)__/g, render: (match: string) => <strong key={keyCounter++}>{match}</strong> }, // __bold__
    { regex: /\*([^*]+)\*/g, render: (match: string) => <em key={keyCounter++}>{match}</em> }, // *italic*
    { regex: /_([^_]+)_/g, render: (match: string) => <em key={keyCounter++}>{match}</em> }, // _italic_
    { regex: /`([^`]+)`/g, render: (match: string) => <code key={keyCounter++} className="bg-neutral-700 px-1 rounded text-xs">{match}</code> }, // `code`
  ];
  
  // Find all matches
  const matches: Array<{ start: number; end: number; element: React.ReactNode }> = [];
  
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const start = match.index;
      const end = pattern.regex.lastIndex;
      const content = match[1];
      
      // Check if this match overlaps with existing matches
      const overlaps = matches.some(m => 
        (start >= m.start && start < m.end) || 
        (end > m.start && end <= m.end)
      );
      
      if (!overlaps) {
        matches.push({
          start,
          end,
          element: pattern.render(content)
        });
      }
    }
  }
  
  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start);
  
  // Build the final output
  matches.forEach(match => {
    // Add text before this match
    if (currentIndex < match.start) {
      parts.push(text.substring(currentIndex, match.start));
    }
    
    // Add the formatted element
    parts.push(match.element);
    
    currentIndex = match.end;
  });
  
  // Add remaining text
  if (currentIndex < text.length) {
    parts.push(text.substring(currentIndex));
  }
  
  // If no markdown was found, just return the text
  if (parts.length === 0) {
    return text;
  }
  
  return <>{parts}</>;
}


"use client";
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export default function Tooltip({ content, children, side = "top" }: { content: string; children: React.ReactNode; side?: "top"|"bottom"|"left"|"right" }) {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    let top = 0;
    let left = 0;
    
    switch (side) {
      case 'top':
        top = rect.top - 8;
        left = rect.left + rect.width / 2;
        break;
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
        break;
      case 'left':
        top = rect.top + rect.height / 2;
        left = rect.left - 8;
        break;
      case 'right':
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
    }
    
    setPosition({ top, left });
  };

  const handleMouseEnter = () => {
    updatePosition();
    setShow(true);
  };

  const handleMouseLeave = () => {
    setShow(false);
  };

  const tooltipContent = show && mounted ? createPortal(
    <div
      className={`pointer-events-none fixed text-xs bg-black text-white px-2 py-1 rounded shadow-lg whitespace-nowrap z-[9999] transition-opacity
        ${side === 'top' ? '-translate-x-1/2 -translate-y-full' : ''}
        ${side === 'bottom' ? '-translate-x-1/2' : ''}
        ${side === 'left' ? '-translate-x-full -translate-y-1/2' : ''}
        ${side === 'right' ? '-translate-y-1/2' : ''}
      `}
      style={{ 
        top: `${position.top}px`, 
        left: `${position.left}px` 
      }}
    >
      {content}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span 
        ref={triggerRef}
        className="relative inline-block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </span>
      {tooltipContent}
    </>
  );
}

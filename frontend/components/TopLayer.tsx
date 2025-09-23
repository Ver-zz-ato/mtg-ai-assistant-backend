'use client';
import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children into document.body at an absolute screen position.
 * Use for UI that must be guaranteed clickable (escapes parent stacking/overlays).
 */
export default function TopLayer(props: {
  left: number;
  top: number;
  children: React.ReactNode;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="history-click-fix-wrapper"
      style={{
        position: 'fixed',
        left: props.left,
        top: props.top,
        zIndex: 2147483647,
        isolation: 'isolate',
        pointerEvents: 'auto',
      }}
    >
      {props.children}
    </div>,
    document.body
  );
}

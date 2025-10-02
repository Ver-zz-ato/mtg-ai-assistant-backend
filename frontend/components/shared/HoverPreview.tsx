"use client";
import React from "react";

// Simple hover preview overlay manager
// Usage: const { preview, bind } = useHoverPreview(); attach {...bind(src)} to <img>, render {preview}
export function useHoverPreview(){
  const [pv, setPv] = React.useState<{ src: string; x: number; y: number; shown: boolean; below: boolean }>({ src: '', x:0, y:0, shown:false, below:false });
  const calcPos = (e: MouseEvent | any) => {
    try{ const vw=window.innerWidth, vh=window.innerHeight, margin=12, boxW=320, boxH=460, half=boxW/2; const rawX=(e as any).clientX as number, rawY=(e as any).clientY as number; const below = rawY - boxH - margin < 0; const x=Math.min(vw-margin-half, Math.max(margin+half, rawX)); const y = below ? Math.min(vh - margin, rawY + margin) : Math.max(margin + 1, rawY - margin); return { x, y, below }; } catch { return { x: (e as any).clientX||0, y: (e as any).clientY||0, below:false }; }
  };
  function bind(src: string){
    return {
      onMouseEnter: (e: any)=>{ const { x, y, below } = calcPos(e); setPv({ src, x, y, shown:true, below }); },
      onMouseMove: (e: any)=>{ const { x, y, below } = calcPos(e); setPv(p=>p.shown?{...p, x, y, below}:p); },
      onMouseLeave: ()=> setPv(p=> ({ ...p, shown:false })),
    } as React.HTMLAttributes<HTMLElement>;
  }
  const preview = pv.shown && (
    <div className="fixed z-[9999] pointer-events-none" style={{ left: pv.x, top: pv.y, transform: `translate(-50%, ${pv.below ? '0%' : '-100%'})` }}>
      <div className="rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl w-72 md:w-80" style={{ minWidth: '18rem' }}>
        <img src={pv.src} alt="preview" className="block w-full h-auto max-h-[70vh] max-w-none object-contain rounded" />
      </div>
    </div>
  );
  return { preview, bind };
}

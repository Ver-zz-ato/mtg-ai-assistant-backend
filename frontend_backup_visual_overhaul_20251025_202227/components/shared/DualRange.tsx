"use client";
import React from "react";

export function DualRange({ min, max, valueMin, valueMax, onChange }: { min:number; max:number; valueMin:number|''; valueMax:number|''; onChange: (lo:number|'', hi:number|'')=>void }){
  const [lo, setLo] = React.useState<number|''>(valueMin);
  const [hi, setHi] = React.useState<number|''>(valueMax);
  React.useEffect(()=>{ setLo(valueMin); setHi(valueMax); }, [valueMin, valueMax]);
  function commit(nextLo: number|'', nextHi: number|'') { onChange(nextLo, nextHi); }
  return (
    <div className="flex items-center gap-2">
      <input type="number" className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" value={lo as any} onChange={e=>{ const v=e.target.value===''? '': Number(e.target.value); setLo(v); commit(v, hi); }} onBlur={()=>commit(lo,hi)} />
      <span className="text-xs opacity-60">to</span>
      <input type="number" className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs" value={hi as any} onChange={e=>{ const v=e.target.value===''? '': Number(e.target.value); setHi(v); commit(lo, v); }} onBlur={()=>commit(lo,hi)} />
    </div>
  );
}

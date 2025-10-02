"use client";
import React from "react";

export default function Sparkline({ names, currency }: { names: string[]; currency: 'USD'|'EUR'|'GBP' }){
  const ref = React.useRef<HTMLCanvasElement|null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string|undefined>(undefined);
  React.useEffect(()=>{
    let alive = true;
    (async ()=>{
      try{
        setBusy(true); setError(undefined);
        const params = new URLSearchParams();
        names.slice(0,300).forEach(n=> params.append('names[]', n));
        params.set('currency', currency);
        const from = new Date(); from.setDate(from.getDate()-30); params.set('from', from.toISOString().slice(0,10));
        const r = await fetch('/api/price/series?'+params.toString(), { cache:'no-store' });
        const j = await r.json().catch(()=>({ ok:false }));
        if(!alive) return;
        if(!r.ok || j?.ok===false){ setError('series failed'); return; }
        // Aggregate total per date (approx; limited to first 10 names)
        const map = new Map<string, number>();
        for (const s of (j.series||[])){
          for (const p of (s.points||[])){
            map.set(p.date, (map.get(p.date)||0) + Number(p.unit||0));
          }
        }
        const pts = Array.from(map.entries()).sort((a,b)=> a[0].localeCompare(b[0]));
        const cvs = ref.current as any; if(!cvs) return;
        const w = 280, h = 60; cvs.width = w; cvs.height = h; const ctx = cvs.getContext('2d'); if(!ctx) return; cvs._ptsCount = pts.length;
        ctx.clearRect(0,0,w,h);
        if(pts.length<2){ ctx.fillStyle='#aaa'; ctx.fillText('No data', 6, 16); return; }
        const vals = pts.map(p=>p[1]); const min = Math.min(...vals), max = Math.max(...vals);
        const nx = (i:number)=> i*(w/(pts.length-1));
        const ny = (v:number)=> max===min? h/2 : h - ((v-min)/(max-min))*h;
        ctx.strokeStyle = '#7dd3fc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, ny(vals[0]));
        for(let i=1;i<pts.length;i++) ctx.lineTo(nx(i), ny(vals[i])); ctx.stroke();
        // markers
        ctx.fillStyle = '#7dd3fc';
        for(let i=0;i<pts.length;i++){ const x=nx(i), y=ny(vals[i]); ctx.beginPath(); ctx.arc(x,y,1.8,0,Math.PI*2); ctx.fill(); }
        // axes (min/max)
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif';
        ctx.fillText(new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(min), 2, h-2);
        ctx.fillText(new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(max), 2, 10);
        // area
        ctx.fillStyle = 'rgba(125, 211, 252, 0.12)'; ctx.beginPath(); ctx.moveTo(0, ny(vals[0]));
        for(let i=1;i<pts.length;i++) ctx.lineTo(nx(i), ny(vals[i])); ctx.lineTo(w, h); ctx.lineTo(0,h); ctx.closePath(); ctx.fill();
        // tooltip if hover
        const hx = cvs._hoverX; if (typeof hx === 'number'){
          // nearest index
          let bestI=0, bestDX=1e9; for(let i=0;i<pts.length;i++){ const dx=Math.abs(hx-nx(i)); if(dx<bestDX){bestDX=dx; bestI=i;} }
          const vx = nx(bestI), vy = ny(vals[bestI]);
          ctx.strokeStyle = '#aaa'; ctx.setLineDash([3,2]); ctx.beginPath(); ctx.moveTo(vx,0); ctx.lineTo(vx,h); ctx.stroke(); ctx.setLineDash([]);
          const date = pts[bestI][0]; const value = vals[bestI];
          const tip = `${new Date(date).toLocaleDateString()}  ${new Intl.NumberFormat(undefined,{ style:'currency', currency }).format(value)}`;
          const pad=4; ctx.font='10px sans-serif'; const tw = ctx.measureText(tip).width + pad*2; const th=16; const tx=Math.min(Math.max(0, vx - tw/2), w-tw), ty=Math.max(0, vy-22);
          ctx.fillStyle='#111827'; ctx.fillRect(tx,ty,tw,th); ctx.strokeStyle='#374151'; ctx.strokeRect(tx,ty,tw,th); ctx.fillStyle='#e5e7eb'; ctx.fillText(tip, tx+pad, ty+11);
        }
      } catch{ setError('series failed'); } finally{ if(alive) setBusy(false); }
    })();
    return ()=>{ alive=false; };
  }, [names.join('|'), currency]);
  return (
    <div className="rounded border border-neutral-800 p-3 space-y-2">
      <div className="font-medium">Snapshot history (30d)</div>
      <div className="relative">
        <canvas ref={ref} className="w-full h-[60px]" onMouseMove={(e)=>{
          const cvs = ref.current; if(!cvs) return; const rect=cvs.getBoundingClientRect(); const x = e.clientX-rect.left; const w=cvs.width; const ptsCount=(cvs as any)._ptsCount||0; (cvs as any)._hoverX = x; (cvs as any)._needsRedraw = true; }} onMouseLeave={()=>{ const cvs=ref.current as any; if(!cvs) return; cvs._hoverX = undefined; cvs._needsRedraw=true; }} />
      </div>
      {busy && <div className="text-xs opacity-70">Loading…</div>}
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="text-[10px] opacity-60">Totals across up to 300 names. Values are snapshot sums; axes show min/max.</div>
    </div>
  );
}

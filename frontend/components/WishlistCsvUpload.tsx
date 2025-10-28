// components/WishlistCsvUpload.tsx
"use client";
import { useRef, useState } from "react";

export default function WishlistCsvUpload({ wishlistId, onDone }: { wishlistId: string; onDone?: ()=>void }){
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<{ added:number; updated:number; skipped:string[]; total:number }|null>(null);
  const inputRef = useRef<HTMLInputElement|null>(null);

  function pick(){ inputRef.current?.click(); }

  async function onChange(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setReport(null);
    try{
      const fd = new FormData();
      fd.append('file', file);
      fd.append('wishlistId', wishlistId);
      const r = await fetch('/api/wishlists/upload-csv', { method:'POST', body: fd });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j?.ok===false) throw new Error(j?.error||'Upload failed');
      setReport(j.report||null);
      onDone?.();
      try { window.dispatchEvent(new CustomEvent('wishlist:csv-imported', { detail: { wishlistId } })); } catch {}
    } catch(e:any){ alert(e?.message||'Upload failed'); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value=''; }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onChange} />
      <button onClick={pick} disabled={busy} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed">
        <span className="flex items-center gap-1.5">
          <span>📤</span>
          <span>{busy?'Uploading…':'Upload CSV'}</span>
        </span>
      </button>
      {report && (
        <span className="text-xs opacity-80">Imported {(report.added||0)+(report.updated||0)}/{report.total}{report.skipped?.length?` • skipped ${report.skipped.length}`:''}</span>
      )}
    </div>
  );
}

// components/ExportWishlistCSV.tsx
"use client";
import { useState } from "react";

export default function ExportWishlistCSV({ wishlistId, filename = "wishlist.csv", small }: { wishlistId: string; filename?: string; small?: boolean }){
  const [busy, setBusy] = useState(false);
  async function onExport(){
    setBusy(true);
    try{
      const res = await fetch(`/api/wishlists/export?wishlistId=${encodeURIComponent(wishlistId)}`, { cache:'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch(e){ alert('Export failed'); }
    finally{ setBusy(false); }
  }
  return (
    <button onClick={onExport} disabled={busy} className={small ? 'text-xs underline' : 'border rounded px-2 py-1 text-xs'}>{busy?'Exporting…':'Export CSV'}</button>
  );
}

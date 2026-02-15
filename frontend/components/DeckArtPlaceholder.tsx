export default function DeckArtPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800/60 via-indigo-900/30 to-slate-900/80">
      <div className="text-center p-2">
        <svg 
          className="w-12 h-12 mx-auto text-indigo-400/50" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
        <div className="text-[10px] text-slate-500/80 mt-1">Deck</div>
      </div>
    </div>
  );
}


"use client";
import React from "react";

export default function PanelWrapper({ 
  title, 
  colorFrom, 
  colorTo, 
  large = false, 
  children,
  defaultHiddenOnMobile = false
}: { 
  title: string; 
  colorFrom: string; 
  colorTo: string; 
  large?: boolean;
  children: React.ReactNode;
  defaultHiddenOnMobile?: boolean;
}) {
  // On mobile, start hidden if defaultHiddenOnMobile is true, otherwise start open
  const [open, setOpen] = React.useState(() => {
    if (typeof window === 'undefined') return true;
    if (defaultHiddenOnMobile && window.innerWidth < 768) return false;
    return true;
  });
  
  // Listen for hide/show all panels event
  React.useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.action === 'toggle-all') {
        const shouldShow = e.detail?.show;
        if (shouldShow !== undefined) {
          setOpen(Boolean(shouldShow));
        }
      }
    };
    window.addEventListener('side-panels-toggle' as any, handler as EventListener);
    return () => window.removeEventListener('side-panels-toggle' as any, handler as EventListener);
  }, [title]);
  
  // Map color names to actual Tailwind classes
  const colorClasses: Record<string, { dot: string; text: string }> = {
    'green-400': { dot: 'bg-green-400', text: 'from-green-400 to-emerald-500' },
    'amber-400': { dot: 'bg-amber-400', text: 'from-amber-400 to-orange-500' },
    'emerald-400': { dot: 'bg-emerald-400', text: 'from-emerald-400 to-green-500' },
    'sky-400': { dot: 'bg-sky-400', text: 'from-sky-400 to-blue-500' },
    'cyan-400': { dot: 'bg-cyan-400', text: 'from-cyan-400 to-blue-500' },
    'purple-400': { dot: 'bg-purple-400', text: 'from-purple-400 to-purple-600' },
  };
  
  const colors = colorClasses[colorFrom] || colorClasses['cyan-400'];
  const sizeClass = large ? 'p-5' : 'p-4';
  const borderClass = large ? 'border-neutral-700' : 'border-neutral-800';
  const bgClass = large ? 'bg-gradient-to-b from-neutral-900 to-neutral-950 shadow-lg' : '';
  
  // Shadow classes - need to map properly
  const shadowClasses: Record<string, string> = {
    'green-400': 'shadow-green-400/50',
    'amber-400': 'shadow-amber-400/50',
    'emerald-400': 'shadow-emerald-400/50',
    'sky-400': 'shadow-sky-400/50',
    'cyan-400': 'shadow-cyan-400/50',
    'purple-400': 'shadow-purple-400/50',
  };
  const shadowClass = shadowClasses[colorFrom] || 'shadow-cyan-400/50';
  
  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} ${sizeClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`h-1 w-1 rounded-full ${colors.dot} animate-pulse shadow-lg ${shadowClass}`}></div>
          <h3 className={`${large ? 'text-base' : 'text-sm'} font-bold bg-gradient-to-r ${colors.text} bg-clip-text text-transparent`}>
            {title}
          </h3>
        </div>
        <button onClick={() => setOpen(v=>!v)} className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs transition-colors">
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}


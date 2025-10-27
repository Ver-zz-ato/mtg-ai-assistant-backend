"use client";
import React, { createContext, useContext, useState, useCallback } from "react";

interface PanelLine {
  id: string;
  text: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface Toast {
  id: string;
  message?: string;
  type: "success" | "error" | "warning" | "info";
  // Optional: large, anchored panel with per-line actions
  title?: string;
  large?: boolean;
  anchor?: { x: number; y: number };
  lines?: PanelLine[];
  actions?: { id: string; label: string; onClick?: () => void; variant?: "primary" | "danger" | "default" }[];
  autoCloseMs?: number | null;
}

interface ToastContextType {
  showToast: (message: string, type?: Toast["type"]) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  showPanel: (opts: {
    title?: string;
    lines?: Array<{ id?: string; text: string; onClick?: () => void; disabled?: boolean }>;
    actions?: { id?: string; label: string; onClick?: () => void; variant?: "primary"|"danger"|"default" }[];
    anchor?: { x: number; y: number };
    large?: boolean;
    type?: Toast["type"];
    autoCloseMs?: number | null;
  }) => { id: string };
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function RegisterToastApi({ showToast, showError, showPanel, removeToast }: { showToast: (m:string,t?:any)=>void; showError:(m:string)=>void; showPanel: (opts:any)=>{id:string}; removeToast:(id:string)=>void }) {
  React.useEffect(()=>{
    try {
      const { registerToastApi } = require("@/lib/toast-client");
      registerToastApi({ showToast, showError, showPanel, removeToast });
    } catch {}
  }, [showToast, showError, showPanel, removeToast]);
  return null;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seqRef = React.useRef(0);
  const lastRef = React.useRef<{ msg: string; at: number } | null>(null);

  const newId = () => {
    const now = Date.now();
    seqRef.current = (seqRef.current + 1) % 1000000;
    return `${now}-${seqRef.current}-${Math.random().toString(36).slice(2,8)}`;
  };

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const now = Date.now();
    const last = lastRef.current;
    if (last && last.msg === message && (now - last.at) < 1200) return;
    lastRef.current = { msg: message, at: now };

    const id = newId();
    const toast: Toast = { id, message, type, autoCloseMs: 15000 }; // Changed from 5000 to 15000 (15 seconds)

    setToasts(prev => [...prev, toast]);
    if (toast.autoCloseMs && toast.autoCloseMs > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.autoCloseMs);
    }
  }, []);

  const showPanel = useCallback((opts: {
    title?: string;
    lines?: Array<{ id?: string; text: string; onClick?: () => void; disabled?: boolean }>;
    actions?: { id?: string; label: string; onClick?: () => void; variant?: "primary"|"danger"|"default" }[];
    anchor?: { x: number; y: number };
    large?: boolean;
    type?: Toast["type"];
    autoCloseMs?: number | null;
  }): { id: string } => {
    const id = newId();
    const lines = (opts.lines || []).map((l, i) => ({ id: l.id || `${id}-ln-${i}`, text: l.text, onClick: l.onClick, disabled: l.disabled }));
    const actions = (opts.actions || []).map((a, i) => ({ id: a.id || `${id}-act-${i}`, label: a.label, onClick: a.onClick, variant: a.variant || 'default' }));
    const toast: Toast = {
      id,
      type: opts.type || 'info',
      title: opts.title,
      large: opts.large !== false, // default large
      anchor: opts.anchor,
      lines,
      actions,
      autoCloseMs: opts.autoCloseMs ?? 12000,
    };
    setToasts(prev => [...prev, toast]);
    if (toast.autoCloseMs && toast.autoCloseMs > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.autoCloseMs);
    }
    return { id };
  }, []);

  const showError = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const showSuccess = useCallback((message: string) => showToast(message, "success"), [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Position helper for anchored panel
  const anchoredStyle = (t: Toast): React.CSSProperties | undefined => {
    if (!t.anchor) return undefined;
    const x = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth - 12 : 9999), t.anchor.x));
    const y = Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerHeight - 12 : 9999), t.anchor.y));
    return { left: x, top: y, transform: 'translate(-50%, -110%)' };
  };

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showPanel, removeToast }}>
      {children}

      {/* Register client-side API for non-React helpers */}
      <RegisterToastApi showToast={showToast} showError={showError} showPanel={showPanel} removeToast={removeToast} />

      {/* Standard toasts (top-right) */}
      <div className="fixed top-4 right-4 z-[1000] space-y-2 max-w-md">
        {toasts.filter(t=>!t.large && !t.anchor).map(toast => (
          <div
            key={toast.id}
            className={`px-5 py-4 rounded-lg shadow-2xl border-2 cursor-pointer transition-all duration-300 ${
              toast.type === "error" 
                ? "bg-red-900 border-red-700 text-red-100"
                : toast.type === "success"
                ? "bg-green-900 border-green-700 text-green-100"
                : toast.type === "warning"
                ? "bg-yellow-900 border-yellow-700 text-yellow-100"
                : "bg-blue-900 border-blue-700 text-blue-100"
            }`}
            onClick={() => removeToast(toast.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-base font-medium leading-relaxed">{toast.message}</p>
              <button
                onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
                className="text-sm opacity-70 hover:opacity-100 flex-shrink-0"
                title="Dismiss"
              >✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* Large anchored panels */}
      {toasts.filter(t=>t.large || t.anchor).map(toast => (
        <div key={toast.id} className="fixed z-[1100]" style={anchoredStyle(toast)}>
          <div className={`min-w-[320px] max-w-[520px] rounded-xl border shadow-2xl ${
            toast.type === 'error' ? 'bg-red-950 border-red-700 text-red-100' :
            toast.type === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-100' :
            toast.type === 'warning' ? 'bg-yellow-950 border-yellow-700 text-yellow-100' :
            'bg-neutral-950 border-neutral-700 text-neutral-100'
          }`} onClick={(e)=>{ e.stopPropagation(); }}>
            <div className="p-3 flex items-start justify-between">
              <div className="text-sm font-medium pr-6">{toast.title || toast.message}</div>
              <button className="text-xs opacity-70 hover:opacity-100" onClick={()=>removeToast(toast.id)} title="Dismiss">✕</button>
            </div>
            {Array.isArray(toast.lines) && toast.lines.length>0 && (
              <div className="px-3 pb-3 space-y-2">
                {toast.lines.map(line => (
                  <div key={line.id} className="flex items-center justify-between gap-3">
                    <div className={`text-xs ${line.disabled? 'opacity-60': ''}`}>{line.text}</div>
                    {line.onClick && (
                      <button className="px-2 py-0.5 text-xs rounded border border-neutral-600 hover:bg-neutral-800" onClick={line.onClick} disabled={line.disabled}>Approve</button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {Array.isArray(toast.actions) && toast.actions.length>0 && (
              <div className="px-3 pb-3 flex items-center justify-end gap-2">
                {toast.actions.map(a => (
                  <button key={a.id} className={`px-2 py-1 text-xs rounded border ${
                    a.variant==='primary'? 'bg-emerald-600 border-emerald-500 text-black hover:bg-emerald-500':
                    a.variant==='danger'? 'bg-red-700 border-red-600 text-white hover:bg-red-600':
                    'border-neutral-600 hover:bg-neutral-800'
                  }`} onClick={a.onClick}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </ToastContext.Provider>
  );
}

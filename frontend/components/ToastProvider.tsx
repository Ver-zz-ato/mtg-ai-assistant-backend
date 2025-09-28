"use client";
import React, { createContext, useContext, useState, useCallback } from "react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

interface ToastContextType {
  showToast: (message: string, type?: Toast["type"]) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

function RegisterToastApi({ showToast, showError }: { showToast: (m:string,t?:any)=>void; showError:(m:string)=>void }) {
  React.useEffect(()=>{
    try {
      const { registerToastApi } = require("@/lib/toast-client");
      registerToastApi({ showToast, showError });
    } catch {}
  }, [showToast, showError]);
  return null;
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = Date.now().toString();
    const toast: Toast = { id, message, type };
    
    setToasts(prev => [...prev, toast]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  const showError = useCallback((message: string) => showToast(message, "error"), [showToast]);
  const showSuccess = useCallback((message: string) => showToast(message, "success"), [showToast]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}

      {/* Register client-side API for non-React helpers */}
      <RegisterToastApi showToast={showToast} showError={showError} />

      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg border cursor-pointer transition-all duration-300 ${
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
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{toast.message}</p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeToast(toast.id);
                }}
                className="text-xs opacity-70 hover:opacity-100"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
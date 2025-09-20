"use client";
import { ReactNode } from "react";
export default function Modal({ open, title, children, onClose }:{ open:boolean; title:string; children:ReactNode; onClose:()=>void; }){
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-xl">
        <div className="mb-3 text-base font-medium">{title}</div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

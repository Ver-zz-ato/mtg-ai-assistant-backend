// components/Dropdown.guarded.tsx
"use client";
import React from "react";

type Option = { value: string; label: string };
type Props = {
  options: Option[];
  placeholder?: string;
  value?: string;
  onSelect?: (value: string) => void;
  className?: string;
};

export default function GuardedDropdown({ options, placeholder = "Select…", value = "", onSelect, className = "" }: Props) {
  const handle = (v: string) => { try { onSelect?.(v); } catch {} };
  return (
    <select
      className={`border rounded px-2 py-1 bg-background text-foreground ${className}`}
      onChange={(e) => handle(e.target.value)}
      value={value}
    >
      {value === "" && <option value="" disabled>{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

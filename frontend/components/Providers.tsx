"use client";
import { PrefsProvider } from "./PrefsContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <PrefsProvider>{children}</PrefsProvider>;
}
